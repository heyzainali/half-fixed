import { describe, expect, test } from 'bun:test';
import { changeBlocks, parseLog, pickWindow } from '../src/diff.js';
import { discoverGroups, globMatch, keysFor } from '../src/groups.js';
import { indexOfWindow, isNoise, normalizeText } from '../src/normalize.js';
import { changedLines, palette, renderGroups, renderScan, renderShow, safe, trim } from '../src/report.js';
import { isFixCommit } from '../src/scan.js';

async function collect(gen) {
  const out = [];
  for await (const x of gen) out.push(x);
  return out;
}

async function* lines(text) {
  for (const line of text.split('\n')) yield line;
}

describe('groups', () => {
  test('derives directory and suffix sibling keys', () => {
    expect(keysFor('src/Providers/Groq/Maps/ToolMap.php')).toEqual([
      { pattern: '*/Providers/Groq/Maps/ToolMap.php', member: 'src' },
      { pattern: 'src/*/Groq/Maps/ToolMap.php', member: 'Providers' },
      { pattern: 'src/Providers/*/Maps/ToolMap.php', member: 'Groq' },
      { pattern: 'src/Providers/Groq/*/ToolMap.php', member: 'Maps' },
      { pattern: 'src/Providers/Groq/Maps/*Map.php', member: 'Tool' },
    ]);
    expect(keysFor('lib/drivers/redis-driver.js').at(-1)).toEqual({ pattern: 'lib/drivers/*-driver.js', member: 'redis' });
    expect(keysFor('pkg/cache/redis_backend.py').at(-1)).toEqual({ pattern: 'pkg/cache/*_backend.py', member: 'redis' });
    expect(keysFor('RedisStore.php')).toEqual([{ pattern: '*Store.php', member: 'Redis' }]);
    expect(keysFor('src/toolmap.js')).toHaveLength(1);
    expect(keysFor('Makefile')).toEqual([]);
  });

  test('keeps groups with enough members and skips excluded paths', () => {
    const groups = discoverGroups([
      'src/a/x.js', 'src/b/x.js', 'src/c/x.js',
      'src/a/y.js', 'src/b/y.js',
      'tests/a/z.js', 'tests/b/z.js', 'tests/c/z.js',
      'docs/a/x.md', 'docs/b/x.md', 'docs/c/x.md',
      'bin/a/run', 'bin/b/run', 'bin/c/run',
    ]);
    expect([...groups.keys()]).toEqual(['src/*/x.js']);
    expect([...discoverGroups(['a/x.md', 'b/x.md', 'c/x.md'], { include: ['**/*.md'] }).keys()]).toEqual(['*/x.md']);
  });

  test('matches globs', () => {
    expect(globMatch('**/vendor/**', 'vendor/a/b.php')).toBe(true);
    expect(globMatch('**/vendor/**', 'x/vendor/b.php')).toBe(true);
    expect(globMatch('**/x', 'ax')).toBe(false);
    expect(globMatch('a/**/b', 'a/b')).toBe(true);
    expect(globMatch('a**b', 'a/x/b')).toBe(true);
    expect(globMatch('src/*.js', 'src/a.js')).toBe(true);
    expect(globMatch('src/*.js', 'src/a/b.js')).toBe(false);
    expect(globMatch('src/?.js', 'src/a.js')).toBe(true);
    expect(globMatch('src/?.js', 'src//.js')).toBe(false);
    expect(globMatch('a.b+c', 'a.b+c')).toBe(true);
    expect(globMatch('a.b+c', 'axbbc')).toBe(false);
  });

  test('matches globs in linear time, so a hostile .half-fixed.json cannot stall a scan', () => {
    const started = performance.now();
    expect(globMatch(`${'**b'.repeat(30)}**c`, 'b'.repeat(200))).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('normalize', () => {
  test('drops blank lines and keeps original line numbers', () => {
    expect(normalizeText('a\n\n  b   c\n')).toEqual({ lines: ['a', 'b c'], lineNos: [1, 3] });
  });

  test('finds consecutive windows only', () => {
    expect(indexOfWindow(['a', 'b', 'c'], ['b', 'c'])).toBe(1);
    expect(indexOfWindow(['a', 'b', 'x', 'c'], ['b', 'c'])).toBe(-1);
    expect(indexOfWindow(['a'], [])).toBe(-1);
  });

  test('recognizes imports and comments', () => {
    expect(isNoise('use Foo\\Bar;')).toBe(true);
    expect(isNoise("import { x } from 'y';")).toBe(true);
    expect(isNoise("const x = require('y');")).toBe(true);
    expect(isNoise('// note')).toBe(true);
    expect(isNoise('* @param string $x')).toBe(true);
    expect(isNoise('#[Override]')).toBe(false);
    expect(isNoise('$x = 1;')).toBe(false);
  });
});

describe('commits', () => {
  test('lets a conventional type decide', () => {
    expect(isFixCommit('fix(openai): handle empty tools')).toBe(true);
    expect(isFixCommit('bug(openai): add cache usage')).toBe(true);
    expect(isFixCommit('feat(mistral): rate limit exception and meta')).toBe(false);
    expect(isFixCommit('Handle null finish reason')).toBe(true);
    expect(isFixCommit('Add streaming support')).toBe(false);
  });

  test('treats lint, type, and formatting commits as tooling, not fixes', () => {
    expect(isFixCommit('fix(lint): Partly fix LIT issues')).toBe(false);
    expect(isFixCommit('fix(proxy): satisfy TypeSafe CI gates')).toBe(false);
    expect(isFixCommit('fix(xai): satisfy type-discipline gate on web search billing')).toBe(false);
    expect(isFixCommit('fix(types|ci): narrow return types')).toBe(false);
    expect(isFixCommit('Fix phpstan errors')).toBe(false);
    expect(isFixCommit('fix: handle content type header')).toBe(true);
    expect(isFixCommit('fix(DeepSeek|OpenRouter): Fix exceptions during tool conversion')).toBe(true);
  });
});

describe('diff', () => {
  test('parses hunks by line count, so code that looks like a header stays code', async () => {
    const log = [
      'noise before the first commit',
      '\x01abc123\x1f2025-01-01\x1fAda\x1ffix: sql comment',
      '',
      'diff --git a/q.sql b/q.sql',
      'index 1..2 100644',
      '--- a/q.sql',
      '+++ b/q.sql',
      '@@ -1,3 +1,3 @@',
      ' select 1;',
      '--- old comment',
      '+-- new comment',
      '',
      '\\ No newline at end of file',
      'diff --git "a/sp ace.sql" "b/sp ace.sql"',
      '--- "a/sp ace.sql"\t',
      '+++ "b/sp ace.sql"\t',
      '@@ broken header @@',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      '\x01def456\x1f2025-01-02\x1fAda\x1f',
      'diff --git a/new.sql b/new.sql',
      '--- /dev/null',
      '+++ b/new.sql',
      '@@ -0,0 +1,2 @@',
      '+one',
      'unexpected',
    ].join('\n');
    const commits = await collect(parseLog(lines(log)));
    expect(commits).toHaveLength(2);
    expect(commits[0].files[0].hunks[0]).toEqual([
      { t: ' ', text: 'select 1;' },
      { t: '-', text: '-- old comment' },
      { t: '+', text: '-- new comment' },
      { t: ' ', text: '' },
    ]);
    expect(commits[0].files[1]).toMatchObject({ oldPath: 'sp ace.sql', newPath: 'sp ace.sql' });
    expect(commits[0].files[1].hunks).toEqual([[{ t: '-', text: 'a' }, { t: '+', text: 'b' }]]);
    expect(commits[1]).toMatchObject({ sha: 'def456', subject: '' });
    expect(commits[1].files[0].oldPath).toBe(null);
    expect(commits[1].files[0].hunks[0]).toEqual([{ t: '+', text: 'one' }]);
  });

  test('widens context until the old code is gone from the new side', () => {
    const hunk = [
      { t: ' ', text: "'description' => $tool->description()," },
      { t: '-', text: "'parameters' => $tool->parameters()," },
      { t: '+', text: '...$tool->hasParameters() ? [' },
      { t: '+', text: "    'parameters' => $tool->parameters()," },
      { t: '+', text: '] : [],' },
      { t: ' ', text: '],' },
    ];
    const { blocks, newSide } = changeBlocks(hunk);
    const w = pickWindow(blocks[0], newSide);
    expect(w.old).toEqual(["'description' => $tool->description(),", "'parameters' => $tool->parameters(),", '],']);
    expect(w.kind).toBe('replacement');
  });

  test('skips trivial, noisy, and undistinguishable changes', () => {
    const pick = (hunk) => {
      const { blocks, newSide } = changeBlocks(hunk);
      return pickWindow(blocks[0], newSide);
    };
    expect(pick([{ t: '-', text: '  return $x;' }, { t: '+', text: 'return   $x;' }])).toBe(null);
    expect(pick([{ t: '-', text: 'use A\\B;' }, { t: '+', text: 'use A\\C;' }])).toBe(null);
    expect(pick([{ t: '-', text: 'x' }, { t: '+', text: 'y' }])).toBe(null);
    expect(pick([{ t: '+', text: 'return $this->somethingQuiteLong();' }])).toBe(null);
  });
});

describe('report', () => {
  const finding = {
    id: 'hf-1234567',
    group: 'src/*/x.js',
    size: 4,
    kind: 'replacement',
    confidence: 'medium',
    old: ['keep', 'a1', 'a2', 'a3', 'a4'],
    new: ['keep', 'b1', 'b2', 'b3', 'b4'],
    fixedIn: [
      { member: 'one', path: 'src/one/x.js', commit: 'aaaaaaaaaaaa', date: '2025-01-01', subject: 'fix: a' },
      { member: 'two', path: 'src/two/x.js', commit: 'aaaaaaaaaaaa', date: '2025-01-01', subject: 'fix: a' },
    ],
    missing: [{ member: 'three', path: 'src/three/x.js', line: 3, needs: ['$y'] }],
  };

  test('colours only when asked', () => {
    expect(palette(true).red('x')).toBe('\x1b[31mx\x1b[0m');
    expect(palette(false).red('x')).toBe('x');
  });

  test('previews only the changed lines and trims long ones', () => {
    expect(changedLines(finding).map((d) => `${d.t}${d.l}`)).toEqual(['-a1', '-a2', '-a3', '-a4', '+b1', '+b2', '+b3', '+b4']);
    expect(trim('x'.repeat(120))).toHaveLength(100);
    expect(trim('short')).toBe('short');
  });

  test('renders a scan with hidden and dismissed counts', () => {
    const text = renderScan({
      rev: 'HEAD', base: null, commitsScanned: 1, groupsScanned: 1, warnings: ['shallow'],
      findings: [finding, { ...finding, id: 'hf-7654321', confidence: 'low' }], hidden: 2, dismissed: [{}],
    });
    expect(text).toContain('warning: shallow');
    expect(text).toContain('2 half-fixed changes found (1 commit, 1 sibling group, at HEAD)');
    expect(text).toContain('fixed    one, two aaaaaaa 2025-01-01 fix: a');
    expect(text).toContain('… 2 more lines, run: half-fixed show hf-1234567');
    expect(text).toContain('2 lower-confidence changes hidden');
    expect(text).toContain('1 dismissed by .half-fixed.json');
    expect(text.match(/src\/\*\/x\.js/g)).toHaveLength(1);
  });

  test('escapes terminal control sequences and bidirectional overrides from the repository', () => {
    expect(safe('a\x1b]0;title\x07b\tc\u202ed\x9b')).toBe('a\\u001b]0;title\\u0007b\tc\\u202ed\\u009b');
    const hostile = {
      ...finding,
      group: 'src/*/\x1b[2Jx.js',
      old: ['keep', 'a1 \x1b]52;c;cGF5bG9hZA==\x07'],
      new: ['keep', 'b1 \u202e'],
      fixedIn: [{ ...finding.fixedIn[0], member: 'o\x1bne', path: 'p\x1b', subject: 'fix: \x1b]0;pwned\x07' }],
      missing: [{ member: 't\x1bhree', path: 'q\x1b', line: 3, needs: ['$\x1b'] }],
    };
    const outputs = [
      renderScan({ rev: 'HEAD\x1b', base: null, commitsScanned: 1, groupsScanned: 1, warnings: [], findings: [hostile], dismissed: [] }),
      renderShow(hostile, 'why\x1b'),
      renderGroups({ rev: 'HEAD', groups: [{ pattern: 'a/\x1b/b.js', members: ['x\x1b'] }] }),
    ];
    for (const text of outputs) {
      expect(text).not.toContain('\x1b');
      expect(text).not.toContain('\u202e');
    }
    expect(outputs[0]).toContain('fix: \\u001b]0;pwned\\u0007');
  });

  test('renders a dismissed finding and groups', () => {
    expect(renderShow(finding, '')).toContain('dismissed: no reason given');
    expect(renderShow(finding, 'why')).toContain('dismissed: why');
    expect(renderShow(finding)).toContain('three  src/three/x.js:3  (fix uses $y, not in this file)');
    expect(renderGroups({ rev: 'HEAD', groups: [{ pattern: 'a/*/b.js', members: ['x', 'y', 'z'] }] })).toBe(
      '1 sibling group at HEAD\n  a/*/b.js  3: x, y, z',
    );
  });
});
