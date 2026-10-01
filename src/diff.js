import { alnum, indexOfWindow, isNoise, norm, sameSeq } from './normalize.js';

const COMMIT = '\x01';
const FIELD = '\x1f';
export const LOG_FORMAT = `--format=${COMMIT}%H${FIELD}%ad${FIELD}%an${FIELD}%s`;

function unquote(path) {
  return path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}

function stripPrefix(path) {
  const p = unquote(path.replace(/\t$/, ''));
  return p === '/dev/null' ? null : p.replace(/^[ab]\//, '');
}

/**
 * Turn `git log -p --format=LOG_FORMAT` output into commits.
 * Each commit: { sha, date, author, subject, files: [{ oldPath, newPath, hunks: [[{ t, text }]] }] }.
 * Hunk bodies are consumed by line count, so code that looks like a diff header can't confuse the parser.
 */
export async function* parseLog(lines) {
  let commit = null;
  let file = null;
  let hunk = null;
  let oldLeft = 0;
  let newLeft = 0;

  for await (const line of lines) {
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const t = line[0];
      if (t === '\\') continue;
      if (t === ' ' || t === undefined) {
        oldLeft--;
        newLeft--;
      } else if (t === '-') {
        oldLeft--;
      } else if (t === '+') {
        newLeft--;
      } else {
        hunk = null;
      }
      if (hunk) {
        hunk.push({ t: t === undefined ? ' ' : t, text: line.slice(1) });
        continue;
      }
    }

    if (line.startsWith(COMMIT)) {
      if (commit) yield commit;
      const [sha, date, author, subject] = line.slice(1).split(FIELD);
      commit = { sha, date, author, subject: subject || '', files: [] };
      file = null;
      hunk = null;
    } else if (!commit) {
      continue;
    } else if (line.startsWith('diff --git ')) {
      file = { oldPath: null, newPath: null, hunks: [] };
      commit.files.push(file);
      hunk = null;
    } else if (file && line.startsWith('--- ')) {
      file.oldPath = stripPrefix(line.slice(4));
    } else if (file && line.startsWith('+++ ')) {
      file.newPath = stripPrefix(line.slice(4));
    } else if (file && line.startsWith('@@')) {
      const m = line.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
      if (!m) continue;
      oldLeft = m[1] === undefined ? 1 : Number(m[1]);
      newLeft = m[2] === undefined ? 1 : Number(m[2]);
      hunk = [];
      file.hunks.push(hunk);
    }
  }
  if (commit) yield commit;
}

/**
 * Split a hunk into change blocks: runs of removed/added lines with the unchanged lines around them.
 * Blank lines are dropped, matching how file contents are normalized.
 */
export function changeBlocks(hunk) {
  const entries = hunk.map((l) => ({ t: l.t, n: norm(l.text) })).filter((e) => e.n !== '');
  const newSide = entries.filter((e) => e.t !== '-').map((e) => e.n);
  const blocks = [];

  let i = 0;
  while (i < entries.length) {
    if (entries[i].t === ' ') {
      i++;
      continue;
    }
    const start = i;
    while (i < entries.length && entries[i].t !== ' ') i++;
    const body = entries.slice(start, i);

    const ctxBefore = [];
    for (let j = start - 1; j >= 0 && entries[j].t === ' '; j--) ctxBefore.unshift(entries[j].n);
    const ctxAfter = [];
    for (let j = i; j < entries.length && entries[j].t === ' '; j++) ctxAfter.push(entries[j].n);

    blocks.push({
      removed: body.filter((e) => e.t === '-').map((e) => e.n),
      added: body.filter((e) => e.t === '+').map((e) => e.n),
      ctxBefore,
      ctxAfter,
    });
  }
  return { blocks, newSide };
}

export const LIMITS = {
  minChanged: 6, // alphanumeric characters across the changed lines
  minWindow: 25, // alphanumeric characters in the code a sibling must contain
  minAnchor: 30, // same, for pure additions, where the window is context only
  maxContext: 3,
};

/**
 * The smallest stretch of pre-change code that identifies this change: present before it,
 * gone after it. Grows the surrounding context one line at a time until the old code no
 * longer appears in the post-change hunk (a wrap or move leaves the removed lines intact).
 * Returns { old, new } line arrays, or null when the change isn't worth tracking.
 */
export function pickWindow(block, newSide, limits = LIMITS) {
  const { removed, added, ctxBefore, ctxAfter } = block;
  if (sameSeq(removed, added)) return null;
  const changed = [...removed, ...added];
  if (changed.every(isNoise)) return null;
  if (alnum(changed) < limits.minChanged) return null;

  const maxK = Math.min(limits.maxContext, Math.max(ctxBefore.length, ctxAfter.length));
  for (let k = 0; k <= maxK; k++) {
    const before = ctxBefore.slice(Math.max(0, ctxBefore.length - k));
    const after = ctxAfter.slice(0, k);
    const oldW = [...before, ...removed, ...after];
    const newW = [...before, ...added, ...after];
    if (oldW.length === 0) continue;
    const min = removed.length === 0 ? limits.minAnchor : limits.minWindow;
    if (alnum(oldW) < min) continue;
    if (indexOfWindow(newSide, oldW) !== -1) continue;
    return { old: oldW, new: newW, kind: removed.length === 0 ? 'addition' : 'replacement' };
  }
  return null;
}
