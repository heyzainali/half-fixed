#!/usr/bin/env node

// src/scan.js
import { createHash } from "node:crypto";

// src/git.js
import { execFileSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative } from "node:path";

// src/normalize.js
function norm(line) {
  return line.trim().replace(/\s+/g, " ");
}
function normalizeText(text) {
  const lines = [];
  const lineNos = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const n = norm(raw);
    if (n !== "") {
      lines.push(n);
      lineNos.push(i + 1);
    }
  });
  return { lines, lineNos };
}
function alnum(lines) {
  let count = 0;
  for (const line of lines) {
    const m = line.match(/[A-Za-z0-9]/g);
    if (m)
      count += m.length;
  }
  return count;
}
var IMPORT = /^(use|import|from|require|using|package|namespace|@import|#include|export \* from|export \{[^}]*\} from)\b|^(const|let|var)\s+[^=]+=\s*require\(/;
var COMMENT = /^(\/\/|\/\*|\*\/?|#(?![[!]|include)|-- |"""|''')/;
function isNoise(line) {
  return IMPORT.test(line) || COMMENT.test(line);
}
function sameSeq(a, b) {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}
function indexOfWindow(hay, window) {
  if (window.length === 0)
    return -1;
  const last = hay.length - window.length;
  outer:
    for (let i = 0;i <= last; i++) {
      for (let j = 0;j < window.length; j++) {
        if (hay[i + j] !== window[j])
          continue outer;
      }
      return i;
    }
  return -1;
}

// src/git.js
var MAX_FILE_BYTES = 1024 * 1024;
var BASE = ["-c", "core.quotePath=false", "-c", "core.bigFileThreshold=1m"];
function isInside(dir, root) {
  const rel = relative(root, dir);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
function isExecutableFile(path) {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
function findGit(cwd, env = process.env, platform = process.platform) {
  const name = platform === "win32" ? "git.exe" : "git";
  for (const dir of (env.PATH || env.Path || "").split(delimiter)) {
    if (!dir || !isAbsolute(dir) || dir.split(/[\\/]/).includes("node_modules") || isInside(dir, cwd))
      continue;
    const candidate = join(dir, name);
    if (isExecutableFile(candidate))
      return candidate;
  }
  throw new Error("git was not found on PATH");
}
var gitPaths = new Map;
function gitFor(cwd) {
  if (!gitPaths.has(cwd))
    gitPaths.set(cwd, findGit(cwd));
  return gitPaths.get(cwd);
}
function git(cwd, args, input) {
  return execFileSync(gitFor(cwd), [...BASE, ...args], {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 1024 * 1024 * 512,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
  });
}
function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}
function gitLines(cwd, args, input) {
  let out;
  try {
    out = git(cwd, args, input);
  } catch (error) {
    throw new Error(`git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`);
  }
  const lines = out.split(`
`);
  if (lines[lines.length - 1] === "")
    lines.pop();
  return lines.map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
}
function rootError(cwd, stderr) {
  if (/dubious ownership/.test(stderr)) {
    return new Error(`git refuses to read ${cwd} because another user owns it. Make sure you trust it before adding it to git's safe.directory, and never add '*'.`);
  }
  return new Error(`not a git repository: ${cwd}`);
}
function repoRoot(cwd) {
  try {
    return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  } catch (error) {
    throw rootError(cwd, String(error.stderr || ""));
  }
}
function resolveCommit(cwd, rev) {
  if (rev.startsWith("-"))
    throw new Error(`not a revision: ${rev}`);
  const sha = tryGit(cwd, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  if (sha === null)
    throw new Error(`unknown revision: ${rev}`);
  return sha.trim();
}
function isShallow(cwd) {
  return (tryGit(cwd, ["rev-parse", "--is-shallow-repository"]) || "").trim() === "true";
}
function listFiles(cwd, rev) {
  const files = new Map;
  for (const record of git(cwd, ["ls-tree", "-r", "-l", "-z", rev]).split("\x00")) {
    const tab = record.indexOf("\t");
    if (tab === -1)
      continue;
    const [, type, , size] = record.slice(0, tab).trim().split(/\s+/);
    if (type === "blob")
      files.set(record.slice(tab + 1), Number(size));
  }
  return files;
}

class RevReader {
  constructor(cwd, rev, sizes = new Map) {
    this.cwd = cwd;
    this.rev = rev;
    this.sizes = sizes;
    this.cache = new Map;
  }
  read(path) {
    if (!this.cache.has(path)) {
      const text = (this.sizes.get(path) || 0) > MAX_FILE_BYTES ? null : tryGit(this.cwd, ["show", `${this.rev}:${path}`]);
      this.cache.set(path, text === null ? null : normalizeText(text));
    }
    return this.cache.get(path);
  }
}

// src/diff.js
var COMMIT = "\x01";
var FIELD = "\x1F";
var LOG_FORMAT = `--format=${COMMIT}%H${FIELD}%ad${FIELD}%an${FIELD}%s`;
function unquote(path) {
  return path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}
function stripPrefix(path) {
  const p = unquote(path.replace(/\t$/, ""));
  return p === "/dev/null" ? null : p.replace(/^[ab]\//, "");
}
async function* parseLog(lines) {
  let commit = null;
  let file = null;
  let hunk = null;
  let oldLeft = 0;
  let newLeft = 0;
  for await (const line of lines) {
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const t = line[0];
      if (t === "\\")
        continue;
      if (t === " " || t === undefined) {
        oldLeft--;
        newLeft--;
      } else if (t === "-") {
        oldLeft--;
      } else if (t === "+") {
        newLeft--;
      } else {
        hunk = null;
      }
      if (hunk) {
        hunk.push({ t: t === undefined ? " " : t, text: line.slice(1) });
        continue;
      }
    }
    if (line.startsWith(COMMIT)) {
      if (commit)
        yield commit;
      const [sha, date, author, subject] = line.slice(1).split(FIELD);
      commit = { sha, date, author, subject: subject || "", files: [] };
      file = null;
      hunk = null;
    } else if (!commit) {
      continue;
    } else if (line.startsWith("diff --git ")) {
      file = { oldPath: null, newPath: null, hunks: [] };
      commit.files.push(file);
      hunk = null;
    } else if (file && line.startsWith("--- ")) {
      file.oldPath = stripPrefix(line.slice(4));
    } else if (file && line.startsWith("+++ ")) {
      file.newPath = stripPrefix(line.slice(4));
    } else if (file && line.startsWith("@@")) {
      const m = line.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
      if (!m)
        continue;
      oldLeft = m[1] === undefined ? 1 : Number(m[1]);
      newLeft = m[2] === undefined ? 1 : Number(m[2]);
      hunk = [];
      file.hunks.push(hunk);
    }
  }
  if (commit)
    yield commit;
}
function changeBlocks(hunk) {
  const entries = hunk.map((l) => ({ t: l.t, n: norm(l.text) })).filter((e) => e.n !== "");
  const newSide = entries.filter((e) => e.t !== "-").map((e) => e.n);
  const blocks = [];
  let i = 0;
  while (i < entries.length) {
    if (entries[i].t === " ") {
      i++;
      continue;
    }
    const start = i;
    while (i < entries.length && entries[i].t !== " ")
      i++;
    const body = entries.slice(start, i);
    const ctxBefore = [];
    for (let j = start - 1;j >= 0 && entries[j].t === " "; j--)
      ctxBefore.unshift(entries[j].n);
    const ctxAfter = [];
    for (let j = i;j < entries.length && entries[j].t === " "; j++)
      ctxAfter.push(entries[j].n);
    blocks.push({
      removed: body.filter((e) => e.t === "-").map((e) => e.n),
      added: body.filter((e) => e.t === "+").map((e) => e.n),
      ctxBefore,
      ctxAfter
    });
  }
  return { blocks, newSide };
}
var LIMITS = {
  minChanged: 6,
  minWindow: 25,
  minAnchor: 30,
  maxContext: 3
};
function pickWindow(block, newSide, limits = LIMITS) {
  const { removed, added, ctxBefore, ctxAfter } = block;
  if (sameSeq(removed, added))
    return null;
  const changed = [...removed, ...added];
  if (changed.every(isNoise))
    return null;
  if (alnum(changed) < limits.minChanged)
    return null;
  const maxK = Math.min(limits.maxContext, Math.max(ctxBefore.length, ctxAfter.length));
  for (let k = 0;k <= maxK; k++) {
    const before = ctxBefore.slice(Math.max(0, ctxBefore.length - k));
    const after = ctxAfter.slice(0, k);
    const oldW = [...before, ...removed, ...after];
    const newW = [...before, ...added, ...after];
    if (oldW.length === 0)
      continue;
    const min = removed.length === 0 ? limits.minAnchor : limits.minWindow;
    if (alnum(oldW) < min)
      continue;
    if (indexOfWindow(newSide, oldW) !== -1)
      continue;
    return { old: oldW, new: newW, kind: removed.length === 0 ? "addition" : "replacement" };
  }
  return null;
}

// src/groups.js
var CODE_EXT = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "cxx",
  "clj",
  "dart",
  "erl",
  "ex",
  "exs",
  "fs",
  "go",
  "groovy",
  "h",
  "hpp",
  "hs",
  "java",
  "jl",
  "js",
  "jsx",
  "kt",
  "kts",
  "lua",
  "m",
  "mjs",
  "cjs",
  "ml",
  "mm",
  "nim",
  "php",
  "pl",
  "py",
  "r",
  "rb",
  "rs",
  "scala",
  "sh",
  "sql",
  "svelte",
  "swift",
  "tf",
  "ts",
  "tsx",
  "vue",
  "zig"
]);
var DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/vendor/**",
  "**/dist/**",
  "**/build/**",
  "**/generated/**",
  "**/__generated__/**",
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/spec/**",
  "**/fixtures/**",
  "**/testdata/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*_test.*",
  "**/*Test.*",
  "**/*.min.js",
  "**/*.d.ts"
];
function tokenize(glob) {
  const tokens = [];
  for (let i = 0;i < glob.length; i++) {
    if (glob[i] === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        tokens.push("**/");
      } else {
        tokens.push("**");
      }
    } else if (glob[i] === "*" || glob[i] === "?") {
      tokens.push(glob[i]);
    } else {
      tokens.push({ literal: glob[i] });
    }
  }
  return tokens;
}
function longestLiteral(tokens) {
  let best = "";
  let run = "";
  for (const token of tokens) {
    run = typeof token === "object" ? run + token.literal : "";
    if (run.length > best.length)
      best = run;
  }
  return best;
}
function matchCompiled({ tokens, literal }, path) {
  if (!path.includes(literal))
    return false;
  const n = path.length;
  let next = new Uint8Array(n + 2);
  next[n] = 1;
  for (let t = tokens.length - 1;t >= 0; t--) {
    const token = tokens[t];
    const here = new Uint8Array(n + 2);
    let laterSlash = 0;
    let any = 0;
    for (let i = n;i >= 0; i--) {
      const ch = path[i];
      if (token === "**/") {
        laterSlash ||= i < n && ch === "/" && next[i + 1] ? 1 : 0;
        here[i] = next[i] || laterSlash;
      } else if (token === "**") {
        here[i] = next[i] || i < n && here[i + 1] ? 1 : 0;
      } else if (token === "*") {
        here[i] = next[i] || i < n && ch !== "/" && here[i + 1] ? 1 : 0;
      } else if (token === "?") {
        here[i] = i < n && ch !== "/" && next[i + 1] ? 1 : 0;
      } else {
        here[i] = i < n && ch === token.literal && next[i + 1] ? 1 : 0;
      }
      any |= here[i];
    }
    if (!any)
      return false;
    next = here;
  }
  return next[0] === 1;
}
function compile(glob) {
  const tokens = tokenize(glob);
  return { tokens, literal: longestLiteral(tokens) };
}
function matcher(globs) {
  const compiled = globs.map(compile);
  return (path) => compiled.some((glob) => matchCompiled(glob, path));
}
var MAX_PATH = 1024;
function extOf(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}
function keysFor(path) {
  if (path.length > MAX_PATH)
    return [];
  const keys = [];
  const segs = path.split("/");
  for (let i = 0;i < segs.length - 1; i++) {
    const pattern = [...segs.slice(0, i), "*", ...segs.slice(i + 1)].join("/");
    keys.push({ pattern, member: segs[i] });
  }
  const base = segs[segs.length - 1];
  const dot = base.lastIndexOf(".");
  if (dot > 0) {
    const stem = base.slice(0, dot);
    const ext = base.slice(dot);
    const m = stem.match(/^(.*?[a-z0-9])([-_.]?)([A-Z][a-z0-9]{2,}|[a-z0-9]{3,})$/);
    if (m && m[1] && (m[2] || /[A-Z]/.test(m[3][0]))) {
      const dir = segs.slice(0, -1).join("/");
      const suffix = `${m[2]}${m[3]}${ext}`;
      keys.push({ pattern: `${dir ? `${dir}/` : ""}*${suffix}`, member: m[1] });
    }
  }
  return keys;
}
function discoverGroups(files, { minMembers = 3, include = [], exclude = [] } = {}) {
  const excluded = matcher([...DEFAULT_EXCLUDE, ...exclude]);
  const included = matcher(include);
  const groups = new Map;
  for (const file of files) {
    if (!(include.length ? included(file) : CODE_EXT.has(extOf(file))))
      continue;
    if (excluded(file))
      continue;
    for (const { pattern, member } of keysFor(file)) {
      let group = groups.get(pattern);
      if (!group)
        groups.set(pattern, group = { pattern, members: new Map });
      group.members.set(member, file);
    }
  }
  for (const [pattern, group] of groups) {
    if (group.members.size < minMembers)
      groups.delete(pattern);
  }
  return groups;
}

// src/config.js
import { lstatSync, readFileSync } from "node:fs";
import { join as join2 } from "node:path";
var CONFIG_FILE = ".half-fixed.json";
var MAX_CONFIG_BYTES = 256 * 1024;
var MAX_GLOBS = 50;
var MAX_GLOB_LENGTH = 200;
var MAX_REASON_LENGTH = 500;
var isText = (value) => typeof value === "string" && value.length > 0;
var globs = (value) => Array.isArray(value) ? value.filter((g) => isText(g) && g.length <= MAX_GLOB_LENGTH).slice(0, MAX_GLOBS) : [];
var count = (value, max) => Number.isInteger(value) && value > 0 && value <= max ? value : undefined;
function exemption(raw) {
  if (!raw || !isText(raw.id))
    return null;
  const reason = typeof raw.reason === "string" ? raw.reason.replace(/\s+/g, " ").trim().slice(0, MAX_REASON_LENGTH) : "";
  const members = Array.isArray(raw.members) ? raw.members.filter(isText) : undefined;
  return { id: raw.id, members, reason };
}
function loadConfig(root) {
  const path = join2(root, CONFIG_FILE);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return { include: [], exclude: [], exempt: [] };
  }
  if (!stat.isFile())
    throw new Error(`${CONFIG_FILE} must be a regular file, not a symlink or a directory`);
  if (stat.size > MAX_CONFIG_BYTES)
    throw new Error(`${CONFIG_FILE} is larger than ${MAX_CONFIG_BYTES / 1024} KiB`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${CONFIG_FILE} is not valid JSON`);
  }
  return {
    minMembers: count(raw?.minMembers, 1000),
    maxCommits: count(raw?.maxCommits, 1e6),
    include: globs(raw?.include),
    exclude: globs(raw?.exclude),
    exempt: Array.isArray(raw?.exempt) ? raw.exempt.map(exemption).filter(Boolean) : []
  };
}

// src/scan.js
var CONVENTIONAL = /^(\w+)(\([^)]*\))?!?:/;
var FIX_TYPES = new Set(["fix", "hotfix", "bugfix", "bug", "security", "revert"]);
var FIX_WORDS = /\b(fix(es|ed)?|bug|crash(es|ed)?|error|exception|regression|broken|prevent|handle|null|undefined|empty|missing|incorrect|wrong|leak|race|security|vulnerab\w*|cve|escape|sanitize|overflow)\b/i;
var TOOLING_SCOPES = new Set(["lint", "types", "typing", "style", "format", "ci", "deps", "test", "tests", "docs"]);
var TOOLING_WORDS = /\b(lint\w*|typing|type[- ]?(hints?|annotations?|safe\w*|discipline|check\w*)|typecheck\w*|mypy|pyright|phpstan|psalm|eslint|rubocop|formatting)\b/i;
function isFixCommit(subject) {
  if (TOOLING_WORDS.test(subject))
    return false;
  const m = subject.match(CONVENTIONAL);
  if (m) {
    const scopes = (m[2] || "").slice(1, -1).toLowerCase().split(/[|,/ ]+/);
    return FIX_TYPES.has(m[1].toLowerCase()) && !scopes.some((s) => TOOLING_SCOPES.has(s));
  }
  return FIX_WORDS.test(subject);
}
var LEVELS = ["high", "medium", "low"];
function findingId(pattern, window) {
  const key = window.kind === "addition" ? [...window.old, "\x00", ...window.new] : window.old;
  return `hf-${createHash("sha1").update(`${pattern}
${key.join(`
`)}`).digest("hex").slice(0, 7)}`;
}
function confidenceOf(finding) {
  const fixes = finding.fixedIn.filter((f) => f.fix).length;
  const independent = new Set(finding.fixedIn.map((f) => f.commit)).size;
  let level = 2;
  if (fixes > 0 && (finding.kind === "replacement" || independent > 1))
    level = 0;
  else if (fixes > 0 || independent > 1)
    level = 1;
  if (finding.missing.every((m) => m.needs.length > 0))
    level = Math.min(level + 1, 2);
  return LEVELS[level];
}
var STRING = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
var MAX_LINE = 2000;
var MAX_BLOCKS = 200;
var IDENT = /(->|\.|::)?([A-Za-z_$][\w$]*)/g;
function identifiers(lines) {
  const counts = new Map;
  for (const line of lines) {
    if (line.length > MAX_LINE)
      continue;
    for (const m of line.replace(STRING, '""').matchAll(IDENT)) {
      if (m[1])
        continue;
      counts.set(m[2], (counts.get(m[2]) || 0) + 1);
    }
  }
  return counts;
}
function fileIdentifiers(content) {
  if (!content.idents)
    content.idents = identifiers(content.lines);
  return content.idents;
}
function lineSet(content) {
  if (!content.lineSet)
    content.lineSet = new Set(content.lines);
  return content.lineSet;
}
function localNames(window, own) {
  if (!own)
    return [];
  const before = identifiers(window.old);
  const after = identifiers(window.new);
  const all = fileIdentifiers(own);
  return [...after.keys()].filter((id) => !before.has(id) && (all.get(id) || 0) > after.get(id));
}
function groupsAt(root, config, options) {
  const rev = options.rev || "HEAD";
  const commit = resolveCommit(root, rev);
  const minMembers = options.minMembers || config.minMembers || 3;
  const sizes = listFiles(root, commit);
  const groups = discoverGroups([...sizes.keys()], { minMembers, include: config.include, exclude: config.exclude });
  if (options.group) {
    for (const pattern of [...groups.keys()])
      if (!pattern.includes(options.group))
        groups.delete(pattern);
  }
  return { rev, commit, groups, sizes };
}
function listGroups(cwd, options = {}) {
  const root = repoRoot(cwd);
  const { rev, groups } = groupsAt(root, loadConfig(root), options);
  return {
    root,
    rev,
    groups: [...groups.values()].map((g) => ({ pattern: g.pattern, members: [...g.members.keys()].sort() })).sort((a, b) => a.pattern.localeCompare(b.pattern))
  };
}
async function scan(cwd, options = {}) {
  const root = repoRoot(cwd);
  const config = loadConfig(root);
  const { rev, commit: head, groups, sizes } = groupsAt(root, config, options);
  const base = options.base ? resolveCommit(root, options.base) : null;
  const maxCommits = options.maxCommits || config.maxCommits || 5000;
  const warnings = [];
  if (isShallow(root))
    warnings.push("shallow clone: history is incomplete, run `git fetch --unshallow` for a full scan");
  const result = { root, rev, base: options.base || null, commitsScanned: 0, groupsScanned: groups.size, warnings, findings: [], dismissed: [] };
  if (groups.size === 0)
    return result;
  const reader = new RevReader(root, head, sizes);
  const findings = new Map;
  const args = [
    "log",
    "--stdin",
    "--no-merges",
    "--no-renames",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--no-show-signature",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "-U3",
    "--date=short",
    LOG_FORMAT,
    "-p",
    `--max-count=${maxCommits}`
  ];
  if (options.since)
    args.push(`--since=${options.since}`);
  const input = [base ? `${base}..${head}` : head, "--", ...[...groups.keys()].map((p) => `:(glob)${p}`)].join(`
`);
  for await (const commit of parseLog(gitLines(root, args, `${input}
`))) {
    result.commitsScanned++;
    const fix = isFixCommit(commit.subject);
    const touched = new Map;
    for (const file of commit.files) {
      for (const path of [file.oldPath, file.newPath]) {
        if (!path)
          continue;
        for (const { pattern, member } of keysFor(path)) {
          if (!groups.has(pattern))
            continue;
          if (!touched.has(pattern))
            touched.set(pattern, new Set);
          touched.get(pattern).add(member);
        }
      }
    }
    for (const file of commit.files) {
      if (!file.oldPath || !file.newPath)
        continue;
      for (const { pattern, member } of keysFor(file.newPath)) {
        const group = groups.get(pattern);
        if (!group)
          continue;
        const untouched = [...group.members.keys()].filter((m) => !touched.get(pattern).has(m));
        if (untouched.length === 0)
          continue;
        for (const hunk of file.hunks) {
          const { blocks, newSide } = changeBlocks(hunk);
          if (blocks.length > MAX_BLOCKS)
            continue;
          for (const block of blocks) {
            const window = pickWindow(block, newSide);
            if (!window)
              continue;
            const own = group.members.has(member) ? reader.read(group.members.get(member)) : null;
            if (own && indexOfWindow(own.lines, window.old) !== -1)
              continue;
            const locals = localNames(window, own);
            const introduced = window.new.filter((line) => !window.old.includes(line));
            const missing = [];
            for (const sibling of untouched) {
              const path = group.members.get(sibling);
              const content = reader.read(path);
              if (!content)
                continue;
              const at = indexOfWindow(content.lines, window.old);
              if (at === -1 || indexOfWindow(content.lines, window.new) !== -1)
                continue;
              if (introduced.length && introduced.every((line) => lineSet(content).has(line)))
                continue;
              const have = fileIdentifiers(content);
              missing.push({ member: sibling, path, line: content.lineNos[at], needs: locals.filter((id) => !have.has(id)) });
            }
            if (missing.length === 0)
              continue;
            const id = findingId(pattern, window);
            let finding = findings.get(id);
            if (!finding) {
              finding = { id, group: pattern, size: group.members.size, kind: window.kind, old: window.old, new: window.new, fixedIn: [], missing: new Map };
              findings.set(id, finding);
            }
            if (!finding.fixedIn.some((f) => f.member === member)) {
              finding.fixedIn.push({ member, path: file.newPath, commit: commit.sha, date: commit.date, subject: commit.subject, fix });
            }
            for (const m of missing)
              finding.missing.set(m.member, m);
          }
        }
      }
    }
  }
  for (const finding of findings.values()) {
    for (const f of finding.fixedIn)
      finding.missing.delete(f.member);
  }
  const exempt = config.exempt || [];
  for (const raw of findings.values()) {
    if (raw.missing.size === 0)
      continue;
    const finding = { ...raw, missing: [...raw.missing.values()].sort((a, b) => a.member.localeCompare(b.member)) };
    finding.confidence = confidenceOf(finding);
    const rules = exempt.filter((e) => e.id === finding.id);
    if (rules.length) {
      const all = rules.find((e) => !e.members || e.members.length === 0);
      const skip = new Set(rules.flatMap((e) => e.members || []));
      const kept = all ? [] : finding.missing.filter((m) => !skip.has(m.member));
      if (kept.length === 0) {
        result.dismissed.push({ ...finding, reason: rules.map((e) => e.reason).filter(Boolean).join("; ") });
        continue;
      }
      finding.missing = kept;
    }
    result.findings.push(finding);
  }
  result.findings.sort((a, b) => LEVELS.indexOf(a.confidence) - LEVELS.indexOf(b.confidence) || b.missing.length - a.missing.length || (b.fixedIn[0].date || "").localeCompare(a.fixedIn[0].date || ""));
  return result;
}

// src/report.js
function palette(color) {
  const paint = (code) => (s) => color ? `\x1B[${code}m${s}\x1B[0m` : String(s);
  return { red: paint(31), green: paint(32), yellow: paint(33), dim: paint(2), bold: paint(1) };
}
var UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Variation_Selector}]/gu;
function escapeCodePoint(ch) {
  const code = ch.codePointAt(0);
  return code > 65535 ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, "0")}`;
}
function safe(value, { multiline = false } = {}) {
  return String(value).replace(UNSAFE, (ch) => ch === "\t" || multiline && ch === `
` ? ch : escapeCodePoint(ch));
}
function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(UNSAFE, (ch) => {
    if (ch === `
`)
      return ch;
    let out = "";
    for (let i = 0;i < ch.length; i++)
      out += `\\u${ch.charCodeAt(i).toString(16).padStart(4, "0")}`;
    return out;
  });
}
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function changedLines(finding) {
  const kept = new Set(finding.old.filter((l) => finding.new.includes(l)));
  return [
    ...finding.old.filter((l) => !kept.has(l)).map((l) => ({ t: "-", l })),
    ...finding.new.filter((l) => !kept.has(l)).map((l) => ({ t: "+", l }))
  ];
}
function fixedLines(finding, c) {
  const byCommit = new Map;
  for (const f of finding.fixedIn) {
    if (!byCommit.has(f.commit))
      byCommit.set(f.commit, { ...f, members: [] });
    byCommit.get(f.commit).members.push(f.member);
  }
  return [...byCommit.values()].map((f) => `${c.green(safe(f.members.join(", ")))} ${c.dim(`${f.commit.slice(0, 7)} ${f.date}`)} ${safe(f.subject)}`);
}
function trim(line, max = 100) {
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
function renderScan(result, { color = false } = {}) {
  const c = palette(color);
  const shown = result.findings;
  const out = [];
  for (const w of result.warnings)
    out.push(c.yellow(`warning: ${w}`));
  const head = shown.length ? c.red(c.bold(`${plural(shown.length, "half-fixed change")} found`)) : c.green(c.bold("no half-fixed changes found"));
  const range = safe(result.base ? `${result.base}..${result.rev}` : `at ${result.rev}`);
  out.push(`${head} ${c.dim(`(${plural(result.commitsScanned, "commit")}, ${plural(result.groupsScanned, "sibling group")}, ${range})`)}`);
  let group = null;
  for (const f of shown) {
    if (f.group !== group) {
      group = f.group;
      out.push("", c.bold(safe(group)));
    }
    const tag = { high: c.red("high"), medium: c.yellow("medium"), low: c.dim("low") }[f.confidence];
    out.push(`  ${c.bold(f.id)}  ${tag}  fixed in ${f.fixedIn.length} of ${f.size}, still old in ${f.missing.length}`);
    for (const line of fixedLines(f, c))
      out.push(`    fixed    ${line}`);
    out.push(`    missing  ${f.missing.map((m) => c.red(safe(m.member)) + c.dim(`:${m.line}`)).join(", ")}`);
    const diff = changedLines(f);
    for (const d of diff.slice(0, 6))
      out.push(c.dim(`    ${d.t} ${trim(safe(d.l))}`));
    if (diff.length > 6)
      out.push(c.dim(`    … ${diff.length - 6} more lines, run: half-fixed show ${f.id}`));
  }
  const tail = [];
  if (result.hidden)
    tail.push(`${plural(result.hidden, "lower-confidence change")} hidden (--confidence medium, or --all)`);
  if (result.dismissed.length)
    tail.push(`${result.dismissed.length} dismissed by .half-fixed.json`);
  if (tail.length)
    out.push("", c.dim(tail.join(", ")));
  return out.join(`
`);
}
function renderShow(finding, dismissedReason, { color = false } = {}) {
  const c = palette(color);
  const out = [];
  out.push(`${c.bold(finding.id)}  ${finding.confidence}  ${finding.kind}`);
  out.push(`group    ${safe(finding.group)} (${finding.size} members)`);
  if (dismissedReason !== undefined)
    out.push(c.dim(`dismissed: ${safe(dismissedReason || "no reason given")}`));
  out.push("", c.bold("Fixed in"));
  for (const f of finding.fixedIn) {
    out.push(`  ${c.green(safe(f.member))}  ${safe(f.path)}`);
    out.push(c.dim(`    ${f.commit} ${f.date} ${safe(f.subject)}`));
  }
  out.push("", c.bold("Still has the old code"));
  for (const m of finding.missing) {
    const needs = m.needs.length ? c.dim(`  (fix uses ${safe(m.needs.join(", "))}, not in this file)`) : "";
    out.push(`  ${c.red(safe(m.member))}  ${safe(m.path)}:${m.line}${needs}`);
  }
  out.push("", c.bold("Old code (normalized)"));
  for (const l of finding.old)
    out.push(c.red(`  - ${safe(l)}`));
  out.push("", c.bold("New code (normalized)"));
  for (const l of finding.new)
    out.push(c.green(`  + ${safe(l)}`));
  out.push("", c.dim(`Next: git show ${finding.fixedIn[0].commit.slice(0, 12)} to read the original fix, then decide whether each sibling needs it.`));
  return out.join(`
`);
}
function renderGroups(result, { color = false } = {}) {
  const c = palette(color);
  const out = [c.bold(`${plural(result.groups.length, "sibling group")} at ${safe(result.rev)}`)];
  for (const g of result.groups)
    out.push(`  ${safe(g.pattern)}  ${c.dim(`${g.members.length}: ${safe(g.members.join(", "))}`)}`);
  return out.join(`
`);
}

// src/version.js
var VERSION = "0.1.2";

// src/cli.js
var EXIT = { CLEAN: 0, FINDINGS: 1, ERROR: 2 };
var HELP = `half-fixed ${VERSION}
Find bug fixes that reached some sibling implementations but not the others.

Usage
  half-fixed scan [path]        list changes made to some siblings but missing from others
  half-fixed show <id> [path]   full detail for one finding
  half-fixed groups [path]      list the sibling groups that will be compared

Options
  --rev <rev>          revision to check (default HEAD)
  --base <rev>         only commits after this one, e.g. --base origin/main to check a branch
  --since <date>       only read history after this date, e.g. 2024-01-01
  --max-commits <n>    history depth (default 5000)
  --min-members <n>    smallest sibling group to consider (default 3)
  --group <text>       only groups whose pattern contains this text
  --confidence <lvl>   lowest confidence to report: high (default), medium, low
  --all                same as --confidence low
  --json               machine-readable output
  -h, --help           show this help
  -v, --version        show the version

Exit codes: 0 nothing found, 1 findings, 2 error.
Config and exemptions: .half-fixed.json at the repo root.`;
var VALUED = {
  "--rev": "rev",
  "--base": "base",
  "--since": "since",
  "--max-commits": "maxCommits",
  "--min-members": "minMembers",
  "--group": "group",
  "--confidence": "confidence"
};
var NUMERIC = new Set(["maxCommits", "minMembers"]);
var MAX_NUMBER = 1e6;
function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0;i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--") ? arg.split(/=(.*)/s) : [arg];
    const key = Object.hasOwn(VALUED, flag) ? VALUED[flag] : undefined;
    if (key) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined)
        throw new Error(`${flag} needs a value`);
      if (NUMERIC.has(key) && !(/^[1-9]\d{0,6}$/.test(value) && Number(value) <= MAX_NUMBER)) {
        throw new Error(`${flag} must be a whole number from 1 to ${MAX_NUMBER}`);
      }
      opts[key] = NUMERIC.has(key) ? Number(value) : value;
    } else if (flag === "--all")
      opts.all = true;
    else if (flag === "--json")
      opts.json = true;
    else if (flag === "-h" || flag === "--help")
      opts.help = true;
    else if (flag === "-v" || flag === "--version")
      opts.version = true;
    else if (arg.startsWith("-"))
      throw new Error(`unknown option ${arg}`);
    else
      opts._.push(arg);
  }
  return opts;
}
async function dispatch(opts, { cwd, out, color }) {
  if (opts.version)
    return out(VERSION), EXIT.CLEAN;
  const [command = "scan", ...rest] = opts._;
  if (opts.help || command === "help")
    return out(HELP), EXIT.CLEAN;
  if (command === "scan") {
    const level = opts.all ? "low" : opts.confidence || "high";
    if (!LEVELS.includes(level))
      throw new Error(`--confidence must be one of ${LEVELS.join(", ")}`);
    const result = await scan(rest[0] || cwd, opts);
    const all = result.findings.length;
    result.findings = result.findings.filter((f) => LEVELS.indexOf(f.confidence) <= LEVELS.indexOf(level));
    result.hidden = all - result.findings.length;
    out(opts.json ? safeJson(result) : renderScan(result, { color }));
    return result.findings.length ? EXIT.FINDINGS : EXIT.CLEAN;
  }
  if (command === "show") {
    const [id, path] = rest;
    if (!id)
      throw new Error("usage: half-fixed show <id> [path]");
    const result = await scan(path || cwd, opts);
    const found = result.findings.find((f) => f.id === id);
    const dismissed = result.dismissed.find((f) => f.id === id);
    if (!found && !dismissed)
      throw new Error(`no finding ${id} at ${result.rev}`);
    if (opts.json)
      out(safeJson(found || dismissed));
    else
      out(found ? renderShow(found, undefined, { color }) : renderShow(dismissed, dismissed.reason, { color }));
    return EXIT.CLEAN;
  }
  if (command === "groups") {
    const result = listGroups(rest[0] || cwd, opts);
    out(opts.json ? safeJson(result) : renderGroups(result, { color }));
    return EXIT.CLEAN;
  }
  throw new Error(`unknown command ${command}, see half-fixed --help`);
}
async function runCli(argv, { cwd, stdout, stderr, env = process.env }) {
  const out = (text) => stdout.write(`${text}
`);
  const color = Boolean(stdout.isTTY) && !env.NO_COLOR;
  try {
    return await dispatch(parseArgs(argv), { cwd, out, color });
  } catch (error) {
    stderr.write(`half-fixed: ${safe(error.message, { multiline: true })}
`);
    return EXIT.ERROR;
  }
}
function handleOutputError(error, proc) {
  if (error && error.code === "EPIPE") {
    proc.exit(EXIT.CLEAN);
    return;
  }
  try {
    proc.stderr.write(`half-fixed: ${safe(error && error.message ? error.message : error, { multiline: true })}
`);
  } finally {
    proc.exit(EXIT.ERROR);
  }
}

// bin/half-fixed.js
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => handleOutputError(error, process));
}
process.on("uncaughtException", (error) => handleOutputError(error, process));
process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr
});
