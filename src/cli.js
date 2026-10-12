import { LEVELS, listGroups, scan } from './scan.js';
import { renderGroups, renderScan, renderShow, safe, safeJson } from './report.js';
import { VERSION } from './version.js';

export const EXIT = { CLEAN: 0, FINDINGS: 1, ERROR: 2 };

export const HELP = `half-fixed ${VERSION}
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

const VALUED = {
  '--rev': 'rev',
  '--base': 'base',
  '--since': 'since',
  '--max-commits': 'maxCommits',
  '--min-members': 'minMembers',
  '--group': 'group',
  '--confidence': 'confidence',
};
const NUMERIC = new Set(['maxCommits', 'minMembers']);
const MAX_NUMBER = 1_000_000;

export function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s) : [arg];
    const key = Object.hasOwn(VALUED, flag) ? VALUED[flag] : undefined;
    if (key) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      if (NUMERIC.has(key) && !(/^[1-9]\d{0,6}$/.test(value) && Number(value) <= MAX_NUMBER)) {
        throw new Error(`${flag} must be a whole number from 1 to ${MAX_NUMBER}`);
      }
      opts[key] = NUMERIC.has(key) ? Number(value) : value;
    } else if (flag === '--all') opts.all = true;
    else if (flag === '--json') opts.json = true;
    else if (flag === '-h' || flag === '--help') opts.help = true;
    else if (flag === '-v' || flag === '--version') opts.version = true;
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    else opts._.push(arg);
  }
  return opts;
}

async function dispatch(opts, { cwd, out, color }) {
  if (opts.version) return out(VERSION), EXIT.CLEAN;
  const [command = 'scan', ...rest] = opts._;
  if (opts.help || command === 'help') return out(HELP), EXIT.CLEAN;

  if (command === 'scan') {
    const level = opts.all ? 'low' : opts.confidence || 'high';
    if (!LEVELS.includes(level)) throw new Error(`--confidence must be one of ${LEVELS.join(', ')}`);
    const result = await scan(rest[0] || cwd, opts);
    const all = result.findings.length;
    result.findings = result.findings.filter((f) => LEVELS.indexOf(f.confidence) <= LEVELS.indexOf(level));
    result.hidden = all - result.findings.length;
    out(opts.json ? safeJson(result) : renderScan(result, { color }));
    return result.findings.length ? EXIT.FINDINGS : EXIT.CLEAN;
  }

  if (command === 'show') {
    const [id, path] = rest;
    if (!id) throw new Error('usage: half-fixed show <id> [path]');
    const result = await scan(path || cwd, opts);
    const found = result.findings.find((f) => f.id === id);
    const dismissed = result.dismissed.find((f) => f.id === id);
    if (!found && !dismissed) throw new Error(`no finding ${id} at ${result.rev}`);
    if (opts.json) out(safeJson(found || dismissed));
    else out(found ? renderShow(found, undefined, { color }) : renderShow(dismissed, dismissed.reason, { color }));
    return EXIT.CLEAN;
  }

  if (command === 'groups') {
    const result = listGroups(rest[0] || cwd, opts);
    out(opts.json ? safeJson(result) : renderGroups(result, { color }));
    return EXIT.CLEAN;
  }

  throw new Error(`unknown command ${command}, see half-fixed --help`);
}

/**
 * Run the CLI against the given streams. Resolves to the exit code; never throws.
 * Colour is used only when stdout is a terminal and NO_COLOR is unset.
 */
export async function runCli(argv, { cwd, stdout, stderr, env = process.env }) {
  const out = (text) => stdout.write(`${text}\n`);
  const color = Boolean(stdout.isTTY) && !env.NO_COLOR;
  try {
    return await dispatch(parseArgs(argv), { cwd, out, color });
  } catch (error) {
    stderr.write(`half-fixed: ${safe(error.message, { multiline: true })}\n`);
    return EXIT.ERROR;
  }
}

/**
 * A closed pipe (`half-fixed scan | head`) ends quietly; any other output
 * failure gets a one-line message.
 */
export function handleOutputError(error, proc) {
  if (error && error.code === 'EPIPE') {
    proc.exit(EXIT.CLEAN);
    return;
  }
  try {
    proc.stderr.write(`half-fixed: ${safe(error && error.message ? error.message : error, { multiline: true })}\n`);
  } finally {
    proc.exit(EXIT.ERROR);
  }
}
