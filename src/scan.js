import { createHash } from 'node:crypto';
import { RevReader, git, gitLines, isShallow, repoRoot } from './git.js';
import { LOG_FORMAT, changeBlocks, parseLog, pickWindow } from './diff.js';
import { discoverGroups, keysFor } from './groups.js';
import { indexOfWindow } from './normalize.js';
import { loadConfig } from './config.js';

const CONVENTIONAL = /^(\w+)(\([^)]*\))?!?:/;
const FIX_TYPES = new Set(['fix', 'hotfix', 'bugfix', 'bug', 'security', 'revert']);
const FIX_WORDS = /\b(fix(es|ed)?|bug|crash(es|ed)?|error|exception|regression|broken|prevent|handle|null|undefined|empty|missing|incorrect|wrong|leak|race|security|vulnerab\w*|cve|escape|sanitize|overflow)\b/i;

/** A conventional-commit type decides on its own; otherwise look for fix-like words. */
export function isFixCommit(subject) {
  const m = subject.match(CONVENTIONAL);
  if (m) return FIX_TYPES.has(m[1].toLowerCase());
  return FIX_WORDS.test(subject);
}

export const LEVELS = ['high', 'medium', 'low'];

function findingId(pattern, old) {
  return `hf-${createHash('sha1').update(`${pattern}\n${old.join('\n')}`).digest('hex').slice(0, 7)}`;
}

function confidenceOf(finding) {
  const fixes = finding.fixedIn.filter((f) => f.fix).length;
  const independent = new Set(finding.fixedIn.map((f) => f.commit)).size;
  let level = 2;
  if (fixes > 0 && (finding.kind === 'replacement' || independent > 1)) level = 0;
  else if (fixes > 0 || independent > 1) level = 1;
  // If no sibling can take the new code as-is, it's more likely a local change.
  if (finding.missing.every((m) => m.needs.length > 0)) level = Math.min(level + 1, 2);
  return LEVELS[level];
}

const STRING = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const IDENT = /(->|\.|::)?([A-Za-z_$][\w$]*)/g;

/**
 * Bare identifiers per line, counted. Member accesses (`->name`, `.name`, `::name`) and
 * words inside string literals are skipped: they belong to shared types and data, not to
 * the file's own scope.
 */
function identifiers(lines) {
  const counts = new Map();
  for (const line of lines) {
    for (const m of line.replace(STRING, '""').matchAll(IDENT)) {
      if (m[1]) continue;
      counts.set(m[2], (counts.get(m[2]) || 0) + 1);
    }
  }
  return counts;
}

function fileIdentifiers(content) {
  if (!content.idents) content.idents = identifiers(content.lines);
  return content.idents;
}

/**
 * Names the new code introduces that the fixed file also uses outside the change: local
 * variables, imports, helpers. A sibling without them can't take the change verbatim.
 * Names only used inside the change (a method on a shared type, say) don't count.
 */
function localNames(window, own) {
  if (!own) return [];
  const before = identifiers(window.old);
  const after = identifiers(window.new);
  const all = fileIdentifiers(own);
  return [...after.keys()].filter((id) => !before.has(id) && (all.get(id) || 0) > after.get(id));
}

function groupsAt(root, config, options) {
  const rev = options.rev || 'HEAD';
  const minMembers = options.minMembers || config.minMembers || 3;
  const files = git(root, ['ls-tree', '-r', '--name-only', rev]).split('\n').filter(Boolean);
  const groups = discoverGroups(files, { minMembers, include: config.include, exclude: config.exclude });
  if (options.group) {
    for (const pattern of [...groups.keys()]) if (!pattern.includes(options.group)) groups.delete(pattern);
  }
  return { rev, groups };
}

export function listGroups(cwd, options = {}) {
  const root = repoRoot(cwd);
  const { rev, groups } = groupsAt(root, loadConfig(root), options);
  return {
    root,
    rev,
    groups: [...groups.values()]
      .map((g) => ({ pattern: g.pattern, members: [...g.members.keys()].sort() }))
      .sort((a, b) => a.pattern.localeCompare(b.pattern)),
  };
}

/**
 * Scan a repository's history for fixes that reached some siblings but not others.
 */
export async function scan(cwd, options = {}) {
  const root = repoRoot(cwd);
  const config = loadConfig(root);
  const { rev, groups } = groupsAt(root, config, options);
  const maxCommits = options.maxCommits || config.maxCommits || 5000;
  const warnings = [];
  if (isShallow(root)) warnings.push('shallow clone: history is incomplete, run `git fetch --unshallow` for a full scan');

  const result = { root, rev, base: options.base || null, commitsScanned: 0, groupsScanned: groups.size, warnings, findings: [], dismissed: [] };
  if (groups.size === 0) return result;

  const reader = new RevReader(root, rev);
  const findings = new Map();
  const args = ['log', '--no-merges', '--no-renames', '--no-color', '--no-ext-diff', '-U3', '--date=short', LOG_FORMAT, '-p', `--max-count=${maxCommits}`];
  if (options.since) args.push(`--since=${options.since}`);
  args.push(options.base ? `${options.base}..${rev}` : rev, '--', ...[...groups.keys()].map((p) => `:(glob)${p}`));

  for await (const commit of parseLog(gitLines(root, args))) {
    result.commitsScanned++;
    const fix = isFixCommit(commit.subject);

    // Which members of each group this commit touched at all.
    const touched = new Map();
    for (const file of commit.files) {
      for (const path of [file.oldPath, file.newPath]) {
        if (!path) continue;
        for (const { pattern, member } of keysFor(path)) {
          if (!groups.has(pattern)) continue;
          if (!touched.has(pattern)) touched.set(pattern, new Set());
          touched.get(pattern).add(member);
        }
      }
    }

    for (const file of commit.files) {
      if (!file.oldPath || !file.newPath) continue;
      for (const { pattern, member } of keysFor(file.newPath)) {
        const group = groups.get(pattern);
        if (!group) continue;
        const untouched = [...group.members.keys()].filter((m) => !touched.get(pattern).has(m));
        if (untouched.length === 0) continue;

        for (const hunk of file.hunks) {
          const { blocks, newSide } = changeBlocks(hunk);
          for (const block of blocks) {
            const window = pickWindow(block, newSide);
            if (!window) continue;

            // The fix has to still be in place in the member it was made in.
            const own = group.members.has(member) ? reader.read(group.members.get(member)) : null;
            if (own && indexOfWindow(own.lines, window.old) !== -1) continue;

            const locals = localNames(window, own);
            const missing = [];
            for (const sibling of untouched) {
              const path = group.members.get(sibling);
              const content = reader.read(path);
              if (!content) continue;
              const at = indexOfWindow(content.lines, window.old);
              if (at === -1 || indexOfWindow(content.lines, window.new) !== -1) continue;
              const have = fileIdentifiers(content);
              missing.push({ member: sibling, path, line: content.lineNos[at], needs: locals.filter((id) => !have.has(id)) });
            }
            if (missing.length === 0) continue;

            const id = findingId(pattern, window.old);
            let finding = findings.get(id);
            if (!finding) {
              finding = { id, group: pattern, size: group.members.size, kind: window.kind, old: window.old, new: window.new, fixedIn: [], missing: new Map() };
              findings.set(id, finding);
            }
            if (!finding.fixedIn.some((f) => f.member === member)) {
              finding.fixedIn.push({ member, path: file.newPath, commit: commit.sha, date: commit.date, subject: commit.subject, fix });
            }
            for (const m of missing) finding.missing.set(m.member, m);
          }
        }
      }
    }
  }

  // A member that got this fix in one commit can't also be missing it.
  for (const finding of findings.values()) {
    for (const f of finding.fixedIn) finding.missing.delete(f.member);
  }

  const exempt = config.exempt || [];
  for (const raw of findings.values()) {
    if (raw.missing.size === 0) continue;
    const finding = { ...raw, missing: [...raw.missing.values()].sort((a, b) => a.member.localeCompare(b.member)) };
    finding.confidence = confidenceOf(finding);
    const rules = exempt.filter((e) => e.id === finding.id);
    if (rules.length) {
      const all = rules.find((e) => !e.members || e.members.length === 0);
      const skip = new Set(rules.flatMap((e) => e.members || []));
      const kept = all ? [] : finding.missing.filter((m) => !skip.has(m.member));
      if (kept.length === 0) {
        result.dismissed.push({ ...finding, reason: rules.map((e) => e.reason).filter(Boolean).join('; ') });
        continue;
      }
      finding.missing = kept;
    }
    result.findings.push(finding);
  }

  result.findings.sort(
    (a, b) =>
      LEVELS.indexOf(a.confidence) - LEVELS.indexOf(b.confidence) ||
      b.missing.length - a.missing.length ||
      (b.fixedIn[0].date || '').localeCompare(a.fixedIn[0].date || ''),
  );
  return result;
}
