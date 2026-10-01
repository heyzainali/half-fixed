import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runCli } from '../src/cli.js';

const SAFE = ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'init.defaultBranch=main'];
export const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
  // Fixed dates keep history windows (--since) deterministic.
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
};

const tempDirs = [];

export function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'half-fixed-'));
  tempDirs.push(dir);
  return dir;
}

// Called once after every test file by test/setup.js.
export function removeTempDirs() {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export class Repo {
  constructor(dir = tempDir()) {
    this.dir = dir;
    this.git('init', '-q');
  }

  git(...args) {
    return execFileSync('git', [...SAFE, ...args], { cwd: this.dir, env: GIT_ENV, encoding: 'utf8' });
  }

  write(files) {
    for (const [path, content] of Object.entries(files)) {
      const full = join(this.dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return this;
  }

  commit(message, files = {}) {
    this.write(files);
    this.git('add', '-A');
    this.git('commit', '-q', '--allow-empty', '-m', message);
    return this.git('rev-parse', 'HEAD').trim();
  }
}

/** Run the CLI in-process and capture what it writes. */
export async function cli(cwd, ...argv) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd,
    stdout: { write: (s) => (stdout += s), isTTY: false },
    stderr: { write: (s) => (stderr += s) },
    env: {},
  });
  return { code, stdout, stderr };
}

/** A PHP tool map in the shape Prism's providers use. */
export function toolMap(provider, parameters = OLD_PARAMETERS) {
  return `<?php

namespace App\\Providers\\${provider}\\Maps;

use App\\Tool;

class ToolMap
{
    public static function map(array $tools): array
    {
        return array_map(fn (Tool $tool): array => [
            'type' => 'function',
            'function' => [
                'name' => $tool->name(),
                'description' => $tool->description(),
${parameters}
            ],
        ], $tools);
    }
}
`;
}

export const OLD_PARAMETERS = `                'parameters' => [
                    'type' => 'object',
                    'properties' => $tool->parametersAsArray(),
                    'required' => $tool->requiredParameters(),
                ],`;

// The fix wraps the old block instead of replacing it, so the old lines survive inside it.
export const WRAPPED_PARAMETERS = `                ...$tool->hasParameters() ? [
                    'parameters' => [
                        'type' => 'object',
                        'properties' => $tool->parametersAsArray(),
                        'required' => $tool->requiredParameters(),
                    ],
                ] : [],`;

export const PROVIDERS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];

export function providerFiles(overrides = {}) {
  const files = {};
  for (const p of PROVIDERS) files[`src/Providers/${p}/Maps/ToolMap.php`] = overrides[p] || toolMap(p);
  return files;
}

/** Providers, then a fix that reaches Alpha and Bravo only. */
export function fixTwoOfFive(message = 'fix(alpha|bravo): tools without parameters') {
  const r = new Repo();
  r.commit('feat: providers', providerFiles());
  r.commit(message, {
    'src/Providers/Alpha/Maps/ToolMap.php': toolMap('Alpha', WRAPPED_PARAMETERS),
    'src/Providers/Bravo/Maps/ToolMap.php': toolMap('Bravo', WRAPPED_PARAMETERS),
  });
  return r;
}
