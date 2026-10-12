import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIG_FILE = '.half-fixed.json';

// The file comes from the repository being scanned, which may not be yours, so
// it must be a plain file of sensible size, and anything inside it that isn't
// the expected shape is ignored rather than trusted.
export const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_GLOBS = 50;
const MAX_GLOB_LENGTH = 200;
const MAX_REASON_LENGTH = 500;

const isText = (value) => typeof value === 'string' && value.length > 0;
const globs = (value) => (Array.isArray(value) ? value.filter((g) => isText(g) && g.length <= MAX_GLOB_LENGTH).slice(0, MAX_GLOBS) : []);
const count = (value, max) => (Number.isInteger(value) && value > 0 && value <= max ? value : undefined);

/** An exemption with only the fields the scan uses; its reason is one line, as it is shown in reports. */
function exemption(raw) {
  if (!raw || !isText(raw.id)) return null;
  const reason = typeof raw.reason === 'string' ? raw.reason.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH) : '';
  const members = Array.isArray(raw.members) ? raw.members.filter(isText) : undefined;
  return { id: raw.id, members, reason };
}

/**
 * Optional repo config:
 * {
 *   "minMembers": 3,
 *   "maxCommits": 5000,
 *   "include": ["src/**\/*.php"],      // replaces the default code-file filter
 *   "exclude": ["legacy/**"],          // added to the default exclusions
 *   "exempt": [{ "id": "hf-1a2b3c4", "members": ["DeepSeek"], "reason": "API accepts missing parameters" }]
 * }
 */
export function loadConfig(root) {
  const path = join(root, CONFIG_FILE);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return { include: [], exclude: [], exempt: [] };
  }
  if (!stat.isFile()) throw new Error(`${CONFIG_FILE} must be a regular file, not a symlink or a directory`);
  if (stat.size > MAX_CONFIG_BYTES) throw new Error(`${CONFIG_FILE} is larger than ${MAX_CONFIG_BYTES / 1024} KiB`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // The parser's message quotes the file, so it's left out.
    throw new Error(`${CONFIG_FILE} is not valid JSON`);
  }
  return {
    minMembers: count(raw?.minMembers, 1000),
    maxCommits: count(raw?.maxCommits, 1_000_000),
    include: globs(raw?.include),
    exclude: globs(raw?.exclude),
    exempt: Array.isArray(raw?.exempt) ? raw.exempt.map(exemption).filter(Boolean) : [],
  };
}
