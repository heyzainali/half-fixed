#!/usr/bin/env node
// Several files repeat the same facts: the version, the Bun pin, the plugin
// name, and each skill's name. This fails when any copy disagrees, and when the
// changelog has no section for the current version.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, bunPin, readJson, readText, script } from './lib.js';

// Limits from the Agent Skills specification (agentskills.io).
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

/** Top-level `key: value` lines of a SKILL.md frontmatter block, or null without one. */
function frontmatter(markdown) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
  if (!block) return null;
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (field) fields[field[1]] = field[2].trim();
  }
  return fields;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

script(() => {
  const problems = [];
  const same = (what, actual, expected) => {
    if (actual !== expected) problems.push(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  };
  const pkg = readJson('package.json');

  // One version and one name everywhere.
  for (const file of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const manifest = readJson(file);
    same(`${file} "version"`, manifest.version, pkg.version);
    same(`${file} "name"`, manifest.name, pkg.name);
  }
  const cli = /^export const VERSION = "([^"]*)";$/m.exec(readText('src/version.js'));
  if (cli) same('src/version.js VERSION', cli[1], pkg.version);
  else problems.push('src/version.js has no `export const VERSION = "x.y.z";` line');

  // Each marketplace lists exactly this plugin, at a folder holding that agent's manifest.
  const marketplaces = [
    ['.claude-plugin/marketplace.json', '.claude-plugin/plugin.json', (source) => source],
    ['.agents/plugins/marketplace.json', '.codex-plugin/plugin.json', (source) => source.path],
  ];
  for (const [file, manifest, folderOf] of marketplaces) {
    const plugins = readJson(file).plugins;
    same(`${file} plugin names`, plugins.map((plugin) => plugin.name).join(', '), pkg.name);
    for (const plugin of plugins) {
      const folder = folderOf(plugin.source);
      if (typeof folder !== 'string' || !existsSync(join(ROOT, folder, manifest))) {
        problems.push(`${file} points ${plugin.name} at ${JSON.stringify(folder)}, which has no ${manifest}`);
      }
    }
  }

  // The bundle is an ES module, and a copied skill may land under a CommonJS package.json.
  same('skills/half-fixed/scripts/package.json "type"', readJson('skills/half-fixed/scripts/package.json').type, 'module');

  // Skills follow the Agent Skills naming rules.
  for (const name of readdirSync(join(ROOT, 'skills')).sort()) {
    if (!statSync(join(ROOT, 'skills', name)).isDirectory()) continue;
    const file = `skills/${name}/SKILL.md`;
    if (!existsSync(join(ROOT, file))) {
      problems.push(`skills/${name} has no SKILL.md`);
      continue;
    }
    const fields = frontmatter(readText(file));
    if (!fields) {
      problems.push(`${file} has no frontmatter`);
      continue;
    }
    same(`${file} "name"`, fields.name, name);
    if (!SKILL_NAME.test(name) || name.length > MAX_NAME) {
      problems.push(`skills/${name}: a skill name is at most ${MAX_NAME} lowercase letters, digits, and single hyphens`);
    }
    if (!fields.description) problems.push(`${file} has no description`);
    else if (fields.description.length > MAX_DESCRIPTION) {
      problems.push(`${file} description is ${fields.description.length} characters, the limit is ${MAX_DESCRIPTION}`);
    }
  }

  // CI and the contributor guide use the Bun version the bundle is built with.
  const pin = bunPin(pkg.packageManager);
  if (!pin) {
    problems.push(`package.json "packageManager" is ${JSON.stringify(pkg.packageManager)}, expected an exact pin such as "bun@1.4.2"`);
  } else {
    const ci = [...readText('.github/workflows/ci.yml').matchAll(/^\s*bun-version:\s*(\S+)\s*$/gm)].map((match) => match[1]);
    if (ci.length === 0) problems.push('.github/workflows/ci.yml sets no bun-version');
    for (const version of new Set(ci)) same('.github/workflows/ci.yml bun-version', version, pin);
    const guide = [...readText('CONTRIBUTING.md').matchAll(/`bun@([^`]+)`/g)].map((match) => match[1]);
    if (guide.length === 0) problems.push(`CONTRIBUTING.md doesn't name the Bun pin as \`bun@${pin}\``);
    for (const version of new Set(guide)) same('CONTRIBUTING.md Bun pin', version, pin);
  }

  // The changelog has an Unreleased section, and a dated, linked one for this version.
  const changelog = readText('CHANGELOG.md');
  if (!/^## \[Unreleased\]$/m.test(changelog)) problems.push('CHANGELOG.md has no "## [Unreleased]" heading');
  if (pkg.version !== '0.0.0') {
    const version = escape(pkg.version);
    if (!new RegExp(`^## \\[${version}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm').test(changelog)) {
      problems.push(`CHANGELOG.md has no "## [${pkg.version}] - YYYY-MM-DD" heading`);
    }
    if (!new RegExp(`^\\[${version}\\]: \\S`, 'm').test(changelog)) problems.push(`CHANGELOG.md has no [${pkg.version}] link`);
    if (!new RegExp(`^\\[Unreleased\\]: \\S+/compare/v${version}\\.\\.\\.HEAD$`, 'm').test(changelog)) {
      problems.push(`CHANGELOG.md's [Unreleased] link doesn't compare v${pkg.version}...HEAD`);
    }
  }

  if (problems.length > 0) throw new Error(`Metadata is out of step:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  console.log(`Metadata agrees on ${pkg.name} ${pkg.version} and Bun ${pin}.`);
});
