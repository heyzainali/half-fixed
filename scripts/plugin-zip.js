#!/usr/bin/env node
// Packs the Codex plugin into the ZIP that OpenAI's plugin directory takes:
//
//   node scripts/plugin-zip.js [rev]    rev defaults to HEAD
//
// The ZIP comes from `git archive`, so it holds exactly what is committed at
// that revision, with the plugin root at the top of the archive. It carries the
// Codex manifest, the skills, the license, and every image the manifest names.
// Skill or listing changes need a new upload, so build one from each release tag.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run, script } from './lib.js';

const MANIFEST = '.codex-plugin/plugin.json';
const IMAGE_FIELDS = ['logo', 'composerIcon'];

/** A ./ path from the manifest as a repository path, refusing anything outside the plugin. */
function inside(path, field) {
  if (typeof path !== 'string' || !path.startsWith('./') || path.split('/').includes('..')) {
    throw new Error(`${MANIFEST} ${field} must be a ./ path inside the plugin, got ${JSON.stringify(path)}`);
  }
  return path.slice(2).replace(/\/$/, '');
}

script(([rev = 'HEAD']) => {
  let commit;
  try {
    commit = run('git', ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).trim();
  } catch {
    throw new Error(`Unknown revision: ${rev}`);
  }
  const manifest = JSON.parse(run('git', ['show', `${commit}:${MANIFEST}`]));

  // OpenAI can't take lifecycle hooks or app references yet.
  for (const key of ['hooks', 'apps', 'mcpServers']) {
    if (key in manifest) throw new Error(`${MANIFEST} has "${key}", which a skills-only directory submission can't include`);
  }
  const listing = manifest.interface || {};
  const paths = [MANIFEST, 'LICENSE', inside(manifest.skills, 'skills')];
  for (const field of IMAGE_FIELDS) paths.push(inside(listing[field], `interface.${field}`));
  const unique = [...new Set(paths)];

  // ls-tree names only what exists at the revision, so a missing file fails here.
  const present = run('git', ['ls-tree', '--name-only', commit, '--', ...unique]).split('\n').filter(Boolean);
  const absent = unique.filter((path) => !present.includes(path));
  if (absent.length > 0) throw new Error(`Not committed at ${rev}: ${absent.join(', ')}`);

  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const out = `dist/${manifest.name}-${manifest.version}-codex.zip`;
  run('git', ['archive', '--format=zip', `--output=${join(ROOT, out)}`, commit, '--', ...unique]);
  const files = run('git', ['ls-tree', '-r', '--name-only', commit, '--', ...unique]).split('\n').filter(Boolean);
  console.log(`Wrote ${out}: ${files.length} files from ${rev} (${commit.slice(0, 7)}), version ${manifest.version}.`);
});
