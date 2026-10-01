const CODE_EXT = new Set([
  'c', 'cc', 'cpp', 'cs', 'cxx', 'clj', 'dart', 'erl', 'ex', 'exs', 'fs', 'go', 'groovy', 'h', 'hpp',
  'hs', 'java', 'jl', 'js', 'jsx', 'kt', 'kts', 'lua', 'm', 'mjs', 'cjs', 'ml', 'mm', 'nim', 'php',
  'pl', 'py', 'r', 'rb', 'rs', 'scala', 'sh', 'sql', 'svelte', 'swift', 'tf', 'ts', 'tsx', 'vue', 'zig',
]);

export const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/generated/**',
  '**/__generated__/**',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/spec/**',
  '**/fixtures/**',
  '**/testdata/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*_test.*',
  '**/*Test.*',
  '**/*.min.js',
  '**/*.d.ts',
];

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function matcher(globs) {
  const res = globs.map(globToRegExp);
  return (path) => res.some((re) => re.test(path));
}

function extOf(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Every sibling-group key a path could belong to, with the path's member name in that group.
 *
 * - Directory siblings: one directory segment varies, the rest of the path is identical.
 *   `src/Providers/Groq/Maps/ToolMap.php` -> `src/Providers/*\/Maps/ToolMap.php`, member `Groq`.
 * - Suffix siblings: files in one directory that share a name suffix.
 *   `src/Cache/RedisStore.php` -> `src/Cache/*Store.php`, member `Redis`.
 */
export function keysFor(path) {
  const keys = [];
  const segs = path.split('/');
  for (let i = 0; i < segs.length - 1; i++) {
    const pattern = [...segs.slice(0, i), '*', ...segs.slice(i + 1)].join('/');
    keys.push({ pattern, member: segs[i] });
  }

  const base = segs[segs.length - 1];
  const dot = base.lastIndexOf('.');
  if (dot > 0) {
    const stem = base.slice(0, dot);
    const ext = base.slice(dot);
    const m = stem.match(/^(.*?[a-z0-9])([-_.]?)([A-Z][a-z0-9]{2,}|[a-z0-9]{3,})$/);
    if (m && m[1] && (m[2] || /[A-Z]/.test(m[3][0]))) {
      const dir = segs.slice(0, -1).join('/');
      const suffix = `${m[2]}${m[3]}${ext}`;
      keys.push({ pattern: `${dir ? `${dir}/` : ''}*${suffix}`, member: m[1] });
    }
  }
  return keys;
}

/**
 * Find sibling groups among the files at a revision.
 * Returns Map(pattern -> { pattern, members: Map(member -> path) }).
 */
export function discoverGroups(files, { minMembers = 3, include = [], exclude = [] } = {}) {
  const excluded = matcher([...DEFAULT_EXCLUDE, ...exclude]);
  const included = matcher(include);
  const groups = new Map();

  for (const file of files) {
    if (!(include.length ? included(file) : CODE_EXT.has(extOf(file)))) continue;
    if (excluded(file)) continue;
    for (const { pattern, member } of keysFor(file)) {
      let group = groups.get(pattern);
      if (!group) groups.set(pattern, (group = { pattern, members: new Map() }));
      group.members.set(member, file);
    }
  }

  for (const [pattern, group] of groups) {
    if (group.members.size < minMembers) groups.delete(pattern);
  }
  return groups;
}
