#!/usr/bin/env node
// Cuts a release from main:
//
//   bun run release <patch|minor|major|X.Y.Z> [--dry-run]
//
// Everything is checked before anything is written: the branch, the working
// tree, the tag, GitHub, npm, the changelog, and every check CI runs. Then the
// version moves in each file that holds it, the Unreleased changelog entries
// become the new version's section, the bundle is rebuilt, and the release
// commit and its tag are pushed together. The GitHub release uses the same
// changelog entries as its notes. Pushing the tag starts
// .github/workflows/publish.yml, which publishes to npm with provenance.
// --dry-run stops once the checks pass.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE, PLUGIN, ROOT, readJson, readText, run, script } from './lib.js';

const BRANCH = 'main';
const REPO = 'https://github.com/heyzainali/half-fixed';
const CHANGELOG = 'CHANGELOG.md';
const USAGE = 'Usage: bun run release <patch|minor|major|X.Y.Z> [--dry-run]';
const CHECKS = ['check:metadata', 'test:coverage', 'check:node-help', 'check:package'];

// Each file holds the version exactly once, written like this.
const VERSION_FILES = {
  'package.json': (version) => `"version": "${version}"`,
  [`${PLUGIN}/.claude-plugin/plugin.json`]: (version) => `"version": "${version}"`,
  [`${PLUGIN}/.codex-plugin/plugin.json`]: (version) => `"version": "${version}"`,
  'src/version.js': (version) => `export const VERSION = "${version}";`,
};

// No leading zeros: npm would publish 1.02.0 as 1.2.0, and the tag would no longer match.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const git = (...args) => run('git', args).trim();

function numbers(version) {
  const match = SEMVER.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function nextVersion(current, request) {
  const now = numbers(current);
  if (!now) throw new Error(`package.json version ${current} is not MAJOR.MINOR.PATCH.`);
  const [major, minor, patch] = now;
  if (request === 'major') return `${major + 1}.0.0`;
  if (request === 'minor') return `${major}.${minor + 1}.0`;
  if (request === 'patch') return `${major}.${minor}.${patch + 1}`;
  const wanted = numbers(request);
  if (!wanted) throw new Error(`"${request}" is not patch, minor, major, or a MAJOR.MINOR.PATCH version without leading zeros.\n${USAGE}`);
  const first = wanted.findIndex((value, index) => value !== now[index]);
  if (first === -1 || wanted[first] < now[first]) throw new Error(`${request} is not newer than ${current}.`);
  return request;
}

/** Moves the Unreleased entries under a dated heading for `version` and updates the compare links. */
function promote(text, previous, version, date) {
  const lines = text.split('\n');
  const heading = lines.indexOf('## [Unreleased]');
  if (heading === -1) throw new Error(`${CHANGELOG} has no "## [Unreleased]" heading.`);
  if (lines.some((line) => line.startsWith(`## [${version}]`))) throw new Error(`${CHANGELOG} already has a ${version} section.`);

  // The section runs to the next version heading or the link list at the foot.
  let end = heading + 1;
  while (end < lines.length && !lines[end].startsWith('## [') && !/^\[[^\]]+\]: /.test(lines[end])) end += 1;
  const entries = lines.slice(heading + 1, end);
  while (entries.length > 0 && entries[0].trim() === '') entries.shift();
  while (entries.length > 0 && entries[entries.length - 1].trim() === '') entries.pop();
  if (!entries.some((line) => /^[-*] \S/.test(line))) {
    throw new Error(`${CHANGELOG} has nothing under "## [Unreleased]". Add the changes users will notice first.`);
  }

  const result = [...lines.slice(0, heading), '## [Unreleased]', '', `## [${version}] - ${date}`, '', ...entries, '', ...lines.slice(end)];
  const since = previous === '0.0.0' ? `${REPO}/releases/tag/v${version}` : `${REPO}/compare/v${previous}...v${version}`;
  const links = [`[Unreleased]: ${REPO}/compare/v${version}...HEAD`, `[${version}]: ${since}`];
  const unreleased = result.findIndex((line) => line.startsWith('[Unreleased]: '));
  if (unreleased === -1) {
    while (result.length > 0 && result[result.length - 1] === '') result.pop();
    result.push('', ...links, '');
  } else {
    result.splice(unreleased, 1, ...links);
  }
  return { text: result.join('\n'), notes: `${entries.join('\n')}\n` };
}

function bumpFile(file, from, to) {
  const text = readText(file);
  const current = VERSION_FILES[file](from);
  const count = text.split(current).length - 1;
  if (count !== 1) throw new Error(`${file} should contain ${current} once, and has it ${count} times.`);
  return text.replace(current, VERSION_FILES[file](to));
}

function absentOnGitHub(tag) {
  try {
    run('gh', ['release', 'view', tag, '--json', 'tagName']);
  } catch (error) {
    if (/release not found/i.test(String(error.stderr))) return;
    throw new Error(`Couldn't check GitHub for release ${tag}: ${String(error.stderr || error.message).trim()}`);
  }
  throw new Error(`GitHub already has a release ${tag}.`);
}

function absentOnNpm(name, version) {
  let printed;
  try {
    printed = run('npm', ['view', `${name}@${version}`, 'version']).trim();
  } catch (error) {
    // E404 means the package has never been published.
    if (/\bE404\b/.test(String(error.stderr))) return;
    throw new Error(`Couldn't check npm for ${name}@${version}: ${String(error.stderr || error.message).trim()}`);
  }
  if (printed !== '') throw new Error(`${name}@${version} is already on npm.`);
}

script((argv) => {
  const dryRun = argv.includes('--dry-run');
  const rest = argv.filter((arg) => arg !== '--dry-run');
  if (rest.length !== 1 || rest[0].startsWith('-')) throw new Error(USAGE);

  const pkg = readJson('package.json');
  const version = nextVersion(pkg.version, rest[0]);
  const tag = `v${version}`;
  console.log(`Releasing ${pkg.name} ${pkg.version} -> ${version}`);

  const branch = git('branch', '--show-current');
  if (branch !== BRANCH) throw new Error(`Releases are cut from ${BRANCH}, and this checkout is on ${branch || 'a detached HEAD'}.`);
  if (git('status', '--porcelain') !== '') throw new Error('The working tree has changes. Commit or stash them first.');
  git('fetch', '--quiet', 'origin', BRANCH);
  if (git('rev-parse', 'HEAD') !== git('rev-parse', `origin/${BRANCH}`)) throw new Error(`${BRANCH} and origin/${BRANCH} differ. Pull or push first.`);
  if (git('tag', '--list', tag) !== '' || git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '') {
    throw new Error(`Tag ${tag} already exists.`);
  }
  absentOnGitHub(tag);
  absentOnNpm(pkg.name, version);

  const changelog = promote(readText(CHANGELOG), pkg.version, version, new Date().toISOString().slice(0, 10));
  const bumped = Object.keys(VERSION_FILES).map((file) => [file, bumpFile(file, pkg.version, version)]);

  for (const check of CHECKS) {
    console.log(`\n$ bun run ${check}`);
    run('bun', ['run', check], { show: true });
  }

  if (dryRun) {
    console.log(`\nDry run: every check passed. ${tag} would be released with these notes:\n\n${changelog.notes}`);
    return;
  }

  writeFileSync(join(ROOT, CHANGELOG), changelog.text);
  for (const [file, text] of bumped) writeFileSync(join(ROOT, file), text);
  // The bundle inlines src/version.js, so every release rebuilds it.
  run('bun', ['run', 'build:fallback'], { show: true });
  run('bun', ['run', 'check:metadata'], { show: true });

  git('add', CHANGELOG, BUNDLE, ...Object.keys(VERSION_FILES));
  git('commit', '--quiet', '-m', `chore: release ${version}`);
  git('tag', '--annotate', tag, '--message', tag);
  // With --atomic the remote takes both refs or neither, so a tag can never
  // be published for a commit that main didn't get.
  git('push', '--atomic', '--quiet', 'origin', BRANCH, tag);
  console.log(`\nPushed ${BRANCH} and ${tag}.`);

  const url = run('gh', ['release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file', '-'], { input: changelog.notes }).trim();
  console.log(`GitHub release: ${url}`);
  console.log(`npm publish: ${REPO}/actions/workflows/publish.yml`);
});
