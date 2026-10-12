#!/usr/bin/env node
// Builds the bundled CLI, or checks that the committed copy is current.
//
//   node scripts/fallback.js build    rewrite skills/half-fixed/scripts/half-fixed.js
//   node scripts/fallback.js check    fail if it differs from a fresh build
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUNDLE, ROOT, requirePinnedBun, run, script } from './lib.js';

function bundle(outfile) {
  try {
    run('bun', ['build', './bin/half-fixed.js', '--target=node', `--outfile=${outfile}`]);
  } catch (error) {
    throw new Error(`bun build failed:\n${error.stderr || error.stdout || error.message}`);
  }
}

/** The first line number where two texts differ, or 0 when they're the same. */
function firstDifference(left, right) {
  const a = left.split('\n');
  const b = right.split('\n');
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return index + 1;
  }
  return 0;
}

script(([mode]) => {
  if (mode !== 'build' && mode !== 'check') throw new Error('Usage: node scripts/fallback.js <build|check>');
  requirePinnedBun();

  if (mode === 'build') {
    bundle(join(ROOT, BUNDLE));
    console.log(`Built ${BUNDLE}.`);
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'half-fixed-bundle-'));
  let line;
  try {
    const fresh = join(dir, 'half-fixed.js');
    bundle(fresh);
    line = firstDifference(readFileSync(join(ROOT, BUNDLE), 'utf8'), readFileSync(fresh, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (line) {
    throw new Error(`${BUNDLE} is out of date: a fresh build differs from line ${line}. Run bun run build:fallback and commit the result.`);
  }
  console.log(`${BUNDLE} matches a fresh build.`);
});
