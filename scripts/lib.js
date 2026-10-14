// Helpers shared by the maintainer scripts in this folder. They run under plain
// Node 18, because the CI jobs that test old Node versions have no Bun.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The plugin folder: what Claude Code and Codex install and the directories list. */
export const PLUGIN = 'plugins/half-fixed';

/** The single-file CLI that the skill runs with Node. Built, never edited. */
export const BUNDLE = `${PLUGIN}/skills/half-fixed/scripts/half-fixed.js`;

export const readText = (file) => readFileSync(join(ROOT, file), 'utf8');
export const readJson = (file) => JSON.parse(readText(file));

const WHERE_TO_GET = {
  bun: 'Install Bun first. CONTRIBUTING.md has the version this project uses.',
  gh: 'Install the GitHub CLI from https://cli.github.com.',
  npm: 'npm ships with Node.js.',
};

/**
 * Runs a program and returns its stdout. With `show`, its output goes straight
 * to the terminal instead. A program that isn't installed fails with a short
 * hint rather than a bare spawn ENOENT.
 */
export function run(program, args, { cwd = ROOT, show = false, input } = {}) {
  try {
    return execFileSync(program, args, {
      cwd,
      encoding: 'utf8',
      input,
      maxBuffer: 64 * 1024 * 1024,
      stdio: [input === undefined ? 'ignore' : 'pipe', show ? 'inherit' : 'pipe', show ? 'inherit' : 'pipe'],
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${program} was not found on PATH. ${WHERE_TO_GET[program] || ''}`.trim());
    }
    throw error;
  }
}

/** The exact Bun version named by `packageManager` in package.json, or null. */
export function bunPin(packageManager = readJson('package.json').packageManager) {
  const match = /^bun@(\d+\.\d+\.\d+)$/.exec(String(packageManager ?? ''));
  return match ? match[1] : null;
}

/**
 * Throws unless the Bun on PATH is the pinned one. The committed bundle is
 * compared byte for byte, and each Bun release names the identifiers it
 * generates differently, so a bundle from another Bun looks stale even when
 * the source hasn't changed.
 */
export function requirePinnedBun() {
  const pin = bunPin();
  if (!pin) throw new Error('package.json "packageManager" must pin an exact Bun version, such as "bun@1.4.2".');
  let local;
  try {
    local = run('bun', ['--version']).trim();
  } catch (error) {
    throw new Error(`${error.message}\nThis project builds with Bun ${pin}.`);
  }
  if (local !== pin) {
    throw new Error(
      [
        `This project builds with Bun ${pin}, and this machine has Bun ${local}.`,
        `Install Bun ${pin} to build it.`,
        'To move the project to another Bun instead, change the version in package.json "packageManager",',
        '.github/workflows/ci.yml, and CONTRIBUTING.md together, then run bun run build:fallback.',
      ].join('\n'),
    );
  }
  return pin;
}

/** Runs `main` and turns a thrown error into a message and exit code 1. */
export function script(main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
