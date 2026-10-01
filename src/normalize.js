/** Trim and collapse whitespace so re-indented code still compares equal. */
export function norm(line) {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * Normalized non-blank lines of a file, with each line's original 1-based number.
 * Blank lines are dropped on both sides of every comparison, so they never break a match.
 */
export function normalizeText(text) {
  const lines = [];
  const lineNos = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const n = norm(raw);
    if (n !== '') {
      lines.push(n);
      lineNos.push(i + 1);
    }
  });
  return { lines, lineNos };
}

export function alnum(lines) {
  let count = 0;
  for (const line of lines) {
    const m = line.match(/[A-Za-z0-9]/g);
    if (m) count += m.length;
  }
  return count;
}

const IMPORT = /^(use|import|from|require|using|package|namespace|@import|#include|export \* from|export \{[^}]*\} from)\b|^(const|let|var)\s+[^=]+=\s*require\(/;
const COMMENT = /^(\/\/|\/\*|\*\/?|#(?![[!]|include)|-- |"""|''')/;

/** Imports and comments: changes made only of these are never worth propagating. */
export function isNoise(line) {
  return IMPORT.test(line) || COMMENT.test(line);
}

export function sameSeq(a, b) {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/** Index of the first place `window` appears as consecutive lines in `hay`, or -1. */
export function indexOfWindow(hay, window) {
  if (window.length === 0) return -1;
  const last = hay.length - window.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < window.length; j++) {
      if (hay[i + j] !== window[j]) continue outer;
    }
    return i;
  }
  return -1;
}
