#!/usr/bin/env node
// Installs the package the way npm users get it, then runs it. Every other
// check runs from the git checkout, so none of them would notice a file that
// is missing from the tarball, or one that shouldn't be in it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUNDLE, ROOT, readJson, run, script } from './lib.js';

const MUST_SHIP = ['package.json', 'LICENSE', 'README.md', 'bin/half-fixed.js', 'src/cli.js', 'skills/half-fixed/SKILL.md', BUNDLE];

script(() => {
  const pkg = readJson('package.json');
  const listed = (path) => path === 'package.json' || pkg.files.some((entry) => path === entry || path.startsWith(`${entry}/`));
  const work = mkdtempSync(join(tmpdir(), 'half-fixed-pack-'));

  try {
    const [tarball] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work]));
    const shipped = tarball.files.map((file) => file.path);
    const extra = shipped.filter((path) => !listed(path));
    if (extra.length > 0) throw new Error(`The tarball has files that package.json "files" doesn't list: ${extra.join(', ')}`);
    const missing = MUST_SHIP.filter((path) => !shipped.includes(path));
    if (missing.length > 0) throw new Error(`The tarball is missing ${missing.join(', ')}`);

    const app = join(work, 'app');
    mkdirSync(app);
    writeFileSync(join(app, 'package.json'), '{ "private": true }\n');
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(work, tarball.filename)], { cwd: app });

    const bin = join(app, 'node_modules', '.bin', 'half-fixed');
    const printed = run(bin, ['--version'], { cwd: app }).trim();
    if (!printed.includes(pkg.version)) throw new Error(`half-fixed --version printed "${printed}", expected ${pkg.version}`);
    run(bin, ['--help'], { cwd: app });
    run(process.execPath, [join(app, 'node_modules', 'half-fixed', BUNDLE), '--version'], { cwd: app });
    // A real scan of this checkout. Exit 1 only means it found something.
    try {
      run(bin, ['scan', ROOT, '--all'], { cwd: app });
    } catch (error) {
      if (error.status !== 1) throw error;
    }

    console.log(`${tarball.filename} (${shipped.length} files) installs, scans, and reports ${pkg.version}.`);
  } catch (error) {
    throw new Error(`Package check failed: ${error.stderr || error.message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
