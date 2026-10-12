import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXIT, handleOutputError, parseArgs, runCli } from '../src/cli.js';
import { VERSION } from '../src/version.js';
import { Repo, cli, fixTwoOfFive, providerFiles, tempDir } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/half-fixed.js', import.meta.url));

describe('cli', () => {
  test('exits 1 with findings and prints them', async () => {
    const out = await cli(fixTwoOfFive().dir, 'scan');
    expect(out.code).toBe(EXIT.FINDINGS);
    expect(out.stdout).toContain('1 half-fixed change found');
    expect(out.stdout).toContain('missing  Charlie:15, Delta:15, Echo:15');
  });

  test('exits 0 on a clean repo and scans the cwd by default', async () => {
    const r = new Repo();
    r.commit('feat: providers', providerFiles());
    const out = await cli(r.dir);
    expect(out.code).toBe(EXIT.CLEAN);
    expect(out.stdout).toContain('no half-fixed changes found');
  });

  test('filters by confidence', async () => {
    const r = fixTwoOfFive('feat(alpha|bravo): optional parameters');
    expect((await cli(r.dir, 'scan')).code).toBe(EXIT.CLEAN);
    expect((await cli(r.dir, 'scan', '--confidence=medium')).stdout).toContain('1 lower-confidence change hidden');
    expect((await cli(r.dir, 'scan', '--all')).code).toBe(EXIT.FINDINGS);
    const bad = await cli(r.dir, 'scan', '--confidence', 'extreme');
    expect(bad.code).toBe(EXIT.ERROR);
    expect(bad.stderr).toContain('--confidence must be one of high, medium, low');
  });

  test('prints JSON and shows one finding by id', async () => {
    const r = fixTwoOfFive();
    const json = JSON.parse((await cli(r.dir, 'scan', '--json')).stdout);
    const id = json.findings[0].id;
    const show = await cli(r.dir, 'show', id);
    expect(show.code).toBe(EXIT.CLEAN);
    expect(show.stdout).toContain('Still has the old code');
    expect(show.stdout).toContain('Delta  src/Providers/Delta/Maps/ToolMap.php:15');
    expect(JSON.parse((await cli(r.dir, 'show', id, r.dir, '--json')).stdout).id).toBe(id);
  });

  test('shows a dismissed finding with its reason', async () => {
    const r = fixTwoOfFive();
    const id = JSON.parse((await cli(r.dir, 'scan', '--json')).stdout).findings[0].id;
    r.write({ '.half-fixed.json': JSON.stringify({ exempt: [{ id, reason: 'on purpose' }] }) });
    expect((await cli(r.dir, 'show', id)).stdout).toContain('dismissed: on purpose');
    expect(JSON.parse((await cli(r.dir, 'show', id, '--json')).stdout).reason).toBe('on purpose');
  });

  test('reports errors with exit code 2', async () => {
    const r = fixTwoOfFive();
    expect((await cli(r.dir, 'show')).stderr).toContain('usage: half-fixed show <id>');
    expect((await cli(r.dir, 'show', 'hf-0000000')).stderr).toContain('no finding hf-0000000');
    expect((await cli(r.dir, 'frobnicate')).stderr).toContain('unknown command frobnicate');
    expect((await cli(r.dir, '--nope')).stderr).toContain('unknown option --nope');
    expect((await cli(r.dir, '--rev')).stderr).toContain('--rev needs a value');
    expect((await cli(r.dir, '--max-commits', '0')).stderr).toContain('whole number from 1 to 1000000');
    const outside = await cli(tempDir(), 'scan');
    expect(outside.code).toBe(EXIT.ERROR);
    expect(outside.stderr).toContain('not a git repository');
  });

  test('prints help and version', async () => {
    expect((await cli('/', '--help')).stdout).toContain('Usage');
    expect((await cli('/', 'help')).stdout).toContain('Usage');
    expect((await cli('/', '-v')).stdout).toBe(`${VERSION}\n`);
  });

  test('lists sibling groups as text and JSON', async () => {
    const r = fixTwoOfFive();
    expect((await cli(r.dir, 'groups')).stdout).toContain('src/Providers/*/Maps/ToolMap.php  5: Alpha, Bravo, Charlie, Delta, Echo');
    expect(JSON.parse((await cli(r.dir, 'groups', r.dir, '--json')).stdout).groups).toHaveLength(1);
  });

  test('colours output on a terminal unless NO_COLOR is set', async () => {
    const r = fixTwoOfFive();
    const run = async (env) => {
      let stdout = '';
      await runCli(['scan'], { cwd: r.dir, stdout: { write: (s) => (stdout += s), isTTY: true }, stderr: { write() {} }, env });
      return stdout;
    };
    expect(await run({})).toContain('\x1b[');
    expect(await run({ NO_COLOR: '1' })).not.toContain('\x1b[');
  });

  test('parses numeric and inline options', () => {
    expect(parseArgs(['scan', '--max-commits=5', '--min-members', '4', '--base', 'main', '-h'])).toEqual({
      _: ['scan'], maxCommits: 5, minMembers: 4, base: 'main', help: true,
    });
  });

  test('exits quietly on a closed pipe and loudly on other output errors', () => {
    const calls = [];
    const proc = { exit: (code) => calls.push(code), stderr: { write: (s) => calls.push(s) } };
    handleOutputError({ code: 'EPIPE' }, proc);
    handleOutputError(new Error('disk full'), proc);
    handleOutputError('odd', proc);
    expect(calls).toEqual([0, 'half-fixed: disk full\n', 2, 'half-fixed: odd\n', 2]);
  });

  test('the bin runs under Node', () => {
    const out = spawnSync('node', [BIN, '--version'], { encoding: 'utf8' });
    expect(out.status).toBe(0);
    expect(out.stdout.trim()).toBe(VERSION);
  });
});
