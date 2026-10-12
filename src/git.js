import { execFileSync } from 'node:child_process';
import { normalizeText } from './normalize.js';

const BASE = ['-c', 'core.quotePath=false'];

export function git(cwd, args) {
  return execFileSync('git', [...BASE, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

/**
 * Stdout of a git command as lines. Runs synchronously on purpose: under Bun,
 * an async child whose exit overlaps the scanner's synchronous `git show`
 * calls can lose its 'close' event and hang the scan forever.
 */
export function gitLines(cwd, args) {
  let out;
  try {
    out = git(cwd, args);
  } catch (error) {
    throw new Error(`git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`);
  }
  const lines = out.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

export function repoRoot(cwd) {
  const root = tryGit(cwd, ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Error(`not a git repository: ${cwd}`);
  return root.trim();
}

/**
 * Resolves a revision to a commit SHA. A value that starts with "-" would reach
 * git as an option (such as --output=<file>), so it is refused outright.
 */
export function resolveCommit(cwd, rev) {
  if (rev.startsWith('-')) throw new Error(`not a revision: ${rev}`);
  const sha = tryGit(cwd, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  if (sha === null) throw new Error(`unknown revision: ${rev}`);
  return sha.trim();
}

export function isShallow(cwd) {
  return (tryGit(cwd, ['rev-parse', '--is-shallow-repository']) || '').trim() === 'true';
}

/** Reads files at a fixed revision, normalized and cached. */
export class RevReader {
  constructor(cwd, rev) {
    this.cwd = cwd;
    this.rev = rev;
    this.cache = new Map();
  }

  read(path) {
    if (!this.cache.has(path)) {
      const text = tryGit(this.cwd, ['show', `${this.rev}:${path}`]);
      this.cache.set(path, text === null ? null : normalizeText(text));
    }
    return this.cache.get(path);
  }
}
