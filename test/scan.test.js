import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listGroups, scan } from '../src/scan.js';
import { GIT_ENV, Repo, WRAPPED_PARAMETERS, fixTwoOfFive, providerFiles, tempDir, toolMap } from './helpers.js';

describe('scan', () => {
  test('finds a fix that reached two siblings but not the other three', async () => {
    const result = await scan(fixTwoOfFive().dir);
    expect(result.findings).toHaveLength(1);
    const [f] = result.findings;
    expect(f.group).toBe('src/Providers/*/Maps/ToolMap.php');
    expect(f.confidence).toBe('high');
    expect(f.kind).toBe('replacement');
    expect(f.size).toBe(5);
    expect(f.fixedIn.map((x) => x.member).sort()).toEqual(['Alpha', 'Bravo']);
    expect(f.missing.map((m) => m.member)).toEqual(['Charlie', 'Delta', 'Echo']);
    expect(f.missing[0]).toEqual({ member: 'Charlie', path: 'src/Providers/Charlie/Maps/ToolMap.php', line: 15, needs: [] });
  });

  test('ignores whitespace-only changes', async () => {
    const r = new Repo();
    r.commit('feat: providers', providerFiles());
    r.commit('fix: reindent alpha', { 'src/Providers/Alpha/Maps/ToolMap.php': toolMap('Alpha').replace(/ {4}/g, '\t') });
    expect((await scan(r.dir)).findings).toHaveLength(0);
  });

  test('does not report siblings that already have the new code', async () => {
    const r = fixTwoOfFive();
    r.commit('fix(charlie): same fix', { 'src/Providers/Charlie/Maps/ToolMap.php': toolMap('Charlie', WRAPPED_PARAMETERS) });
    const [f] = (await scan(r.dir)).findings;
    expect(f.missing.map((m) => m.member)).toEqual(['Delta', 'Echo']);
    expect(f.fixedIn).toHaveLength(3);
    expect(f.confidence).toBe('high');
  });

  test('drops a fix that was later reverted where it was made', async () => {
    const r = fixTwoOfFive();
    r.commit('revert alpha and bravo', providerFiles());
    expect((await scan(r.dir)).findings).toHaveLength(0);
  });

  test('ranks a single feature commit as low confidence', async () => {
    const [f] = (await scan(fixTwoOfFive('feat(alpha|bravo): optional parameters').dir)).findings;
    expect(f.confidence).toBe('low');
  });

  test('ranks the same change made in two separate feature commits as medium', async () => {
    const r = fixTwoOfFive('feat(alpha|bravo): optional parameters');
    r.commit('feat(charlie): optional parameters', { 'src/Providers/Charlie/Maps/ToolMap.php': toolMap('Charlie', WRAPPED_PARAMETERS) });
    const [f] = (await scan(r.dir)).findings;
    expect(f.confidence).toBe('medium');
  });

  test('marks changes that depend on names only the fixed file has', async () => {
    const r = new Repo();
    r.commit('feat: providers', providerFiles());
    const renamed = toolMap('Alpha')
      .replace("'description' => $tool->description(),", "'description' => $summary,")
      .replace("=> [\n            'type'", "=> [\n            'summary' => $summary = $tool->description(),\n            'type'");
    r.commit('fix(alpha): reuse summary', { 'src/Providers/Alpha/Maps/ToolMap.php': renamed });
    const { findings } = await scan(r.dir);
    const f = findings.find((x) => x.new.some((l) => l.includes("'description' => $summary")));
    expect(f.missing[0].needs).toEqual(['$summary']);
    expect(f.confidence).toBe('medium');
  });

  test('finds a fix that only added a line', async () => {
    const r = new Repo();
    r.commit('feat: providers', providerFiles());
    const guarded = toolMap('Alpha').replace(
      '        return array_map(',
      '        $tools = array_values(array_filter($tools, fn ($tool) => $tool instanceof Tool));\n\n        return array_map(',
    );
    r.commit('fix(alpha): skip non-tool entries', { 'src/Providers/Alpha/Maps/ToolMap.php': guarded });
    const [f] = (await scan(r.dir)).findings;
    expect(f.kind).toBe('addition');
    expect(f.confidence).toBe('medium');
    expect(f.missing).toHaveLength(4);
  });

  test('finds suffix siblings in one directory', async () => {
    const r = new Repo();
    const store = (name, body) => `<?php\nclass ${name}Store\n{\n    public function get(string $key)\n    {\n${body}\n    }\n}\n`;
    const old = '        $value = $this->client->get($this->prefix.$key);\n        return unserialize($value);';
    const fixed = '        $value = $this->client->get($this->prefix.$key);\n        return $value === null ? null : unserialize($value);';
    r.commit('feat: stores', {
      'src/Cache/RedisStore.php': store('Redis', old),
      'src/Cache/MemcachedStore.php': store('Memcached', old),
      'src/Cache/DynamoStore.php': store('Dynamo', old),
    });
    r.commit('fix(redis): missing keys return null', { 'src/Cache/RedisStore.php': store('Redis', fixed) });
    const [f] = (await scan(r.dir)).findings;
    expect(f.group).toBe('src/Cache/*Store.php');
    expect(f.missing.map((m) => m.member)).toEqual(['Dynamo', 'Memcached']);
  });

  test('skips siblings deleted since and fixes made to removed members', async () => {
    const r = fixTwoOfFive();
    r.git('rm', '-q', 'src/Providers/Echo/Maps/ToolMap.php', 'src/Providers/Bravo/Maps/ToolMap.php');
    r.commit('chore: drop echo and bravo');
    const [f] = (await scan(r.dir, { minMembers: 3 })).findings;
    expect(f.missing.map((m) => m.member)).toEqual(['Charlie', 'Delta']);
  });

  test('honours exemptions in .half-fixed.json', async () => {
    const r = fixTwoOfFive();
    const [f] = (await scan(r.dir)).findings;

    writeFileSync(join(r.dir, '.half-fixed.json'), JSON.stringify({ exempt: [{ id: f.id, members: ['Echo'], reason: 'echo omits parameters' }] }));
    const partial = await scan(r.dir);
    expect(partial.findings[0].missing.map((m) => m.member)).toEqual(['Charlie', 'Delta']);

    writeFileSync(join(r.dir, '.half-fixed.json'), JSON.stringify({ exempt: [{ id: f.id, reason: 'intentional' }, { id: f.id }] }));
    const full = await scan(r.dir);
    expect(full.findings).toHaveLength(0);
    expect(full.dismissed).toHaveLength(1);
    expect(full.dismissed[0].reason).toBe('intentional');
  });

  test('reads include, exclude, and limits from .half-fixed.json', async () => {
    const r = fixTwoOfFive();
    r.write({ '.half-fixed.json': JSON.stringify({ exclude: ['src/Providers/Echo/**'], minMembers: 4, maxCommits: 10 }) });
    expect((await scan(r.dir)).findings[0].missing.map((m) => m.member)).toEqual(['Charlie', 'Delta']);

    r.write({ '.half-fixed.json': JSON.stringify({ include: ['**/*.md'] }) });
    expect((await scan(r.dir)).groupsScanned).toBe(0);
  });

  test('rejects a config file that is not JSON', async () => {
    const r = fixTwoOfFive();
    r.write({ '.half-fixed.json': '{ nope' });
    await expect(scan(r.dir)).rejects.toThrow('.half-fixed.json');
  });

  test('limits the scan to a branch with base', async () => {
    const r = fixTwoOfFive();
    const base = r.git('rev-parse', 'HEAD').trim();
    expect((await scan(r.dir, { base })).findings).toHaveLength(0);

    const partial = toolMap('Charlie').replace("'type' => 'function',", "'type' => 'function',\n            'strict' => true,");
    r.commit('feat(charlie): strict mode', { 'src/Providers/Charlie/Maps/ToolMap.php': partial });
    const { findings, commitsScanned, base: shown } = await scan(r.dir, { base });
    expect(commitsScanned).toBe(1);
    expect(shown).toBe(base);
    expect(findings[0].fixedIn.map((f) => f.member)).toEqual(['Charlie']);
  });

  test('filters groups, history window, and revision', async () => {
    const r = fixTwoOfFive();
    expect((await scan(r.dir, { group: 'Nothing' })).groupsScanned).toBe(0);
    expect((await scan(r.dir, { group: 'ToolMap' })).groupsScanned).toBe(1);
    expect((await scan(r.dir, { since: '2021-01-01' })).commitsScanned).toBe(0);
    expect((await scan(r.dir, { rev: 'HEAD~1' })).findings).toHaveLength(0);
  });

  test('ignores test files', async () => {
    const r = new Repo();
    const files = {};
    for (const [path, content] of Object.entries(providerFiles())) files[path.replace(/^src/, 'tests')] = content;
    r.commit('test: providers', files);
    r.commit('fix: alpha test', { 'tests/Providers/Alpha/Maps/ToolMap.php': toolMap('Alpha', WRAPPED_PARAMETERS) });
    expect((await scan(r.dir)).groupsScanned).toBe(0);
  });

  test('warns on a shallow clone', async () => {
    const source = fixTwoOfFive();
    const shallow = join(tempDir(), 'shallow');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${source.dir}`, shallow], { env: GIT_ENV });
    const result = await scan(shallow);
    expect(result.warnings[0]).toContain('shallow clone');
  });

  test('fails outside a git repository and on a bad revision', async () => {
    await expect(scan(tempDir())).rejects.toThrow('not a git repository');
    const r = fixTwoOfFive();
    expect(() => listGroups(r.dir, { rev: 'no-such-rev' })).toThrow();
    await expect(scan(r.dir, { base: 'no-such-rev' })).rejects.toThrow('git log failed');
  });

  test('lists groups sorted with their members', () => {
    const r = fixTwoOfFive();
    r.commit('feat: drivers', { 'lib/c/driver.js': 'c', 'lib/a/driver.js': 'a', 'lib/b/driver.js': 'b' });
    const result = listGroups(r.dir);
    expect(result.groups).toEqual([
      { pattern: 'lib/*/driver.js', members: ['a', 'b', 'c'] },
      { pattern: 'src/Providers/*/Maps/ToolMap.php', members: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] },
    ]);
  });
});
