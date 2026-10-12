import { execFileSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative } from 'node:path';
import { normalizeText } from './normalize.js';

// Files over this size are skipped: git treats them as binary in diffs, and
// RevReader never reads them, so a small but highly compressible repository
// can't exhaust memory.
export const MAX_FILE_BYTES = 1024 * 1024;

const BASE = ['-c', 'core.quotePath=false', '-c', 'core.bigFileThreshold=1m'];

function isInside(dir, root) {
  const rel = relative(root, dir);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function isExecutableFile(path) {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The git executable to run, as an absolute path. A package runner (npx, npm
 * exec, bunx) puts the current project's node_modules/.bin first on PATH, and a
 * repository being scanned can commit a `git` there, so node_modules
 * directories, relative entries, and anything inside `cwd` are skipped. On
 * Windows an absolute path also stops the current directory being searched.
 */
export function findGit(cwd, env = process.env, platform = process.platform) {
  const name = platform === 'win32' ? 'git.exe' : 'git';
  for (const dir of (env.PATH || env.Path || '').split(delimiter)) {
    if (!dir || !isAbsolute(dir) || dir.split(/[\\/]/).includes('node_modules') || isInside(dir, cwd)) continue;
    const candidate = join(dir, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  throw new Error('git was not found on PATH');
}

const gitPaths = new Map();

function gitFor(cwd) {
  if (!gitPaths.has(cwd)) gitPaths.set(cwd, findGit(cwd));
  return gitPaths.get(cwd);
}

export function git(cwd, args, input) {
  return execFileSync(gitFor(cwd), [...BASE, ...args], {
    cwd,
    encoding: 'utf8',
    input,
    maxBuffer: 1024 * 1024 * 512,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
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
export function gitLines(cwd, args, input) {
  let out;
  try {
    out = git(cwd, args, input);
  } catch (error) {
    throw new Error(`git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`);
  }
  const lines = out.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** Git's refusal to read a repository owned by someone else, explained without suggesting a workaround. */
export function rootError(cwd, stderr) {
  if (/dubious ownership/.test(stderr)) {
    return new Error(
      `git refuses to read ${cwd} because another user owns it. Make sure you trust it before adding it to git's safe.directory, and never add '*'.`,
    );
  }
  return new Error(`not a git repository: ${cwd}`);
}

export function repoRoot(cwd) {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch (error) {
    throw rootError(cwd, String(error.stderr || ''));
  }
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

/**
 * Lists the blobs at a revision with their sizes, reading NUL-separated output
 * so unusual file names arrive as they are.
 */
export function listFiles(cwd, rev) {
  const files = new Map();
  for (const record of git(cwd, ['ls-tree', '-r', '-l', '-z', rev]).split('\0')) {
    const tab = record.indexOf('\t');
    if (tab === -1) continue;
    const [, type, , size] = record.slice(0, tab).trim().split(/\s+/);
    if (type === 'blob') files.set(record.slice(tab + 1), Number(size));
  }
  return files;
}

/** Reads files at a fixed revision, normalized and cached. Files over MAX_FILE_BYTES read as null. */
export class RevReader {
  constructor(cwd, rev, sizes = new Map()) {
    this.cwd = cwd;
    this.rev = rev;
    this.sizes = sizes;
    this.cache = new Map();
  }

  read(path) {
    if (!this.cache.has(path)) {
      const text = (this.sizes.get(path) || 0) > MAX_FILE_BYTES ? null : tryGit(this.cwd, ['show', `${this.rev}:${path}`]);
      this.cache.set(path, text === null ? null : normalizeText(text));
    }
    return this.cache.get(path);
  }
}
