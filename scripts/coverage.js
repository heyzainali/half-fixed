#!/usr/bin/env node
// Fails unless every line and function of every .js file in a folder is
// covered, and names the lines that aren't.
//
//   node scripts/coverage.js <lcov.info> <source-dir>
//
// Bun's lcov report has per-line hits (DA) and line and function totals. Branch
// totals are checked too when a report has them.
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { script } from './lib.js';

const TOTALS = [
  ['lines', 'LF', 'LH', true],
  ['functions', 'FNF', 'FNH', true],
  ['branches', 'BRF', 'BRH', false],
];

/** Maps each absolute source path in an lcov report to its totals and unhit lines. */
function readReport(file) {
  const report = new Map();
  for (const record of readFileSync(file, 'utf8').split('end_of_record')) {
    let source = null;
    const totals = {};
    const missed = [];
    for (const line of record.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const key = line.slice(0, colon);
      const value = line.slice(colon + 1);
      if (key === 'SF') source = resolve(value);
      else if (key === 'DA') {
        const [number, hits] = value.split(',');
        if (Number(hits) === 0) missed.push(Number(number));
      } else totals[key] = Number(value);
    }
    if (source) report.set(source, { totals, missed });
  }
  return report;
}

script(([lcov, dir]) => {
  if (!lcov || !dir) throw new Error('Usage: node scripts/coverage.js <lcov.info> <source-dir>');
  const report = readReport(lcov);
  const files = readdirSync(dir).filter((name) => name.endsWith('.js')).sort();
  const gaps = [];

  for (const name of files) {
    const path = resolve(dir, name);
    const label = relative(process.cwd(), path);
    const entry = report.get(path);
    if (!entry) {
      gaps.push(`${label}: missing from the report, so no test loads it`);
      continue;
    }
    for (const [kind, found, hit, required] of TOTALS) {
      if (!(found in entry.totals)) {
        if (required) gaps.push(`${label}: the report has no ${kind} total`);
      } else if (entry.totals[hit] !== entry.totals[found]) {
        gaps.push(`${label}: ${entry.totals[hit]} of ${entry.totals[found]} ${kind} covered`);
      }
    }
    if (entry.missed.length > 0) gaps.push(`${label}: line ${entry.missed.join(', ')} never ran`);
  }

  if (gaps.length > 0) throw new Error(`Coverage is below 100%:\n${gaps.map((gap) => `  ${gap}`).join('\n')}`);
  console.log(`Every line and function in ${files.length} files under ${dir}/ is covered.`);
});
