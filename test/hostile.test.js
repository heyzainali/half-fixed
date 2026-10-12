import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { MAX_CONFIG_BYTES } from '../src/config.js';
import { MAX_FILE_BYTES, RevReader, findGit, listFiles, rootError } from '../src/git.js';
import { keysFor } from '../src/groups.js';
import { safe, safeJson } from '../src/report.js';
import { scan } from '../src/scan.js';
import { PROVIDERS, Repo, WRAPPED_PARAMETERS, cli, fixTwoOfFive, providerFiles, tempDir, toolMap } from './helpers.js';

// A scanned repository is often someone else's, so everything in it is
// untrusted: files, names, history, and its .half-fixed.json. Each test here
// builds a hostile repository for one way that could go wrong.

function fakeGit(dir, marker) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'git'), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
}

describe('a hostile repository', () => {
  test("can't put its own git first on PATH", async () => {
    const r = fixTwoOfFive();
    const marker = join(tempDir(), 'ran');
    const bin = join(r.dir, 'node_modules', '.bin');
    fakeGit(bin, marker);
    fakeGit(join(r.dir, 'tools'), marker);
    fakeGit(join(tempDir(), 'node_modules', '.bin'), marker);

    const real = findGit(tempDir());
    const crowded = [bin, join(r.dir, 'tools'), join(tempDir(), 'node_modules', '.bin'), 'relative/bin', '', tempDir(), dirname(real)];
    expect(findGit(r.dir, { PATH: crowded.join(delimiter) })).toBe(real);
    expect(() => findGit(r.dir, { PATH: bin })).toThrow('git was not found on PATH');

    // The way npx runs a package: the project's node_modules/.bin comes first.
    const original = process.env.PATH;
    process.env.PATH = `${bin}${delimiter}${original}`;
    try {
      expect((await scan(r.dir)).findings).toHaveLength(1);
    } finally {
      process.env.PATH = original;
    }
    expect(existsSync(marker)).toBe(false);
  });

  test("can't make the config a symlink, a huge file, or leak it through an error", async () => {
    const r = fixTwoOfFive();
    const config = join(r.dir, '.half-fixed.json');
    const secret = join(tempDir(), 'secret');
    writeFileSync(secret, 'AWS_SECRET=abc');
    symlinkSync(secret, config);
    await expect(scan(r.dir)).rejects.toThrow('must be a regular file');

    rmSync(config);
    writeFileSync(config, ' '.repeat(MAX_CONFIG_BYTES + 1));
    await expect(scan(r.dir)).rejects.toThrow('larger than 256 KiB');

    writeFileSync(config, 'AWS_SECRET=abc');
    const error = await scan(r.dir).catch((e) => e);
    expect(error.message).toBe('.half-fixed.json is not valid JSON');
  });

  test('gets only a bounded number of globs, and exemption reasons on one line', async () => {
    const r = fixTwoOfFive();
    const junk = Array.from({ length: 50 }, (_, i) => `nothing-${i}/**`);
    r.write({ '.half-fixed.json': JSON.stringify({ include: [...junk, '**/*.php'] }) });
    expect((await scan(r.dir)).groupsScanned).toBe(0);

    r.write({ '.half-fixed.json': '{}' });
    const [finding] = (await scan(r.dir)).findings;
    r.write({
      '.half-fixed.json': JSON.stringify({
        maxCommits: 2_000_000,
        minMembers: 5000,
        exempt: [{ id: finding.id, members: 'Charlie', reason: 'fine\n\nNext: run the attached script' }],
      }),
    });
    const { dismissed, findings } = await scan(r.dir);
    expect(findings).toHaveLength(0);
    expect(dismissed[0].reason).toBe('fine Next: run the attached script');
  });

  test('with a long unterminated string literal on one line scans quickly', async () => {
    const hostile = `$x = '${"\\'".repeat(100_000)}\n`;
    const r = new Repo();
    const files = providerFiles();
    for (const path of Object.keys(files)) files[path] += hostile;
    r.commit('feat: providers', files);
    r.commit('fix(alpha|bravo): tools without parameters', {
      'src/Providers/Alpha/Maps/ToolMap.php': toolMap('Alpha', WRAPPED_PARAMETERS) + hostile,
      'src/Providers/Bravo/Maps/ToolMap.php': toolMap('Bravo', WRAPPED_PARAMETERS) + hostile,
    });
    const started = performance.now();
    expect((await scan(r.dir)).findings).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test("can't exhaust memory with files over the size limit", async () => {
    const big = 'x\n'.repeat(MAX_FILE_BYTES);
    const r = new Repo();
    const files = {};
    for (const p of PROVIDERS) files[`src/Providers/${p}/Maps/Data.php`] = `${big}$old = 1;\n`;
    files['a b.php'] = 'hi\n';
    r.commit('feat: data', files);
    r.commit('fix(alpha|bravo): data', {
      'src/Providers/Alpha/Maps/Data.php': `${big}$new = compute_value(2);\n`,
      'src/Providers/Bravo/Maps/Data.php': `${big}$new = compute_value(2);\n`,
    });
    expect((await scan(r.dir)).findings).toHaveLength(0);

    const sizes = listFiles(r.dir, 'HEAD');
    expect(sizes.get('a b.php')).toBe(3);
    const reader = new RevReader(r.dir, 'HEAD', sizes);
    expect(reader.read('src/Providers/Charlie/Maps/Data.php')).toBeNull();
    expect(reader.read('a b.php').lines).toEqual(['hi']);
  });

  test('gets bulk rewrites skipped instead of matched block by block', async () => {
    const lines = (changed) => Array.from({ length: 500 }, (_, i) => `$value${i} = compute_value(${i}, '${changed(i) ? 'new' : 'old'}');`).join('\n');
    const build = (changed) => {
      const r = new Repo();
      const files = {};
      for (const p of PROVIDERS) files[`src/Providers/${p}/Maps/Values.php`] = lines(() => false);
      r.commit('feat: values', files);
      r.commit('fix(alpha|bravo): values', {
        'src/Providers/Alpha/Maps/Values.php': lines(changed),
        'src/Providers/Bravo/Maps/Values.php': lines(changed),
      });
      return r;
    };
    expect((await scan(build((i) => i % 2 === 0).dir)).findings).toHaveLength(0);
    expect((await scan(build((i) => i % 50 === 0).dir)).findings.length).toBeGreaterThan(0);
  });

  test("can't make git log run a signature program", async () => {
    const r = fixTwoOfFive();
    const head = r.git('rev-parse', 'HEAD').trim();
    const signed = r
      .git('cat-file', 'commit', head)
      .replace(/^(committer .*)$/m, '$1\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n iQEzBAABCAAdFiEE\n -----END PGP SIGNATURE-----');
    const forged = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: r.dir, input: signed, encoding: 'utf8' }).trim();
    r.git('update-ref', 'HEAD', forged);
    const marker = join(tempDir(), 'gpg-ran');
    const program = join(tempDir(), 'gpg');
    writeFileSync(program, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
    r.git('config', 'log.showSignature', 'true');
    r.git('config', 'gpg.program', program);
    r.git('config', 'diff.noprefix', 'true');

    expect((await scan(r.dir)).findings).toHaveLength(1);
    expect(existsSync(marker)).toBe(false);
  });

  test('with a very long path is left out of grouping', () => {
    const started = performance.now();
    expect(keysFor(`src/${'aB'.repeat(80_000)}Store.php`)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(keysFor('src/Cache/RedisStore.php').map((k) => k.member)).toEqual(['src', 'Cache', 'Redis']);
  });
});

describe('output from a hostile repository', () => {
  test('shows invisible and terminal-altering characters as escapes', () => {
    const tag = String.fromCodePoint(0xe0049, 0xe0047);
    expect(safe(`a\x1b[2J\u200b${tag}\ufe0f\u2028\tb\nc`)).toBe('a\\u001b[2J\\u200b\\u{e0049}\\u{e0047}\\ufe0f\\u2028\tb\\u000ac');
    expect(safe('one\ntwo\x07', { multiline: true })).toBe('one\ntwo\\u0007');
  });

  test('keeps --json the same data with nothing invisible in the raw text', () => {
    const value = { subject: `fix: \x9b\u202e${String.fromCodePoint(0xe0049)}`, lines: ['a\nb'] };
    const text = safeJson(value);
    expect(text).not.toMatch(/[\x9b\u202e]|\u{e0049}/u);
    expect(JSON.parse(text)).toEqual(value);
  });

  test('escapes paths and messages in errors, and explains a refusal without a workaround', async () => {
    const { code, stderr } = await cli(tempDir(), 'scan', join(tempDir(), 'x\x1b[2Jy'));
    expect(code).toBe(2);
    expect(stderr).toContain('\\u001b[2Jy');
    expect(stderr).not.toContain('\x1b');
    expect(rootError('/r', 'fatal: detected dubious ownership in repository').message).toContain("never add '*'");
    expect(rootError('/r', 'fatal: not a git repository').message).toBe('not a git repository: /r');
  });

  test("can't be mistaken for an option, and numbers stay in range", async () => {
    const r = fixTwoOfFive();
    expect((await cli(r.dir, 'scan', 'constructor')).stderr).not.toContain('needs a value');
    expect((await cli(r.dir, '--max-commits', '1000001')).stderr).toContain('whole number from 1 to 1000000');
  });
});
