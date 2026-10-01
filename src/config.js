import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIG_FILE = '.half-fixed.json';

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
  if (!existsSync(path)) return { include: [], exclude: [], exempt: [] };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${CONFIG_FILE}: ${err.message}`);
  }
  return {
    minMembers: raw.minMembers,
    maxCommits: raw.maxCommits,
    include: Array.isArray(raw.include) ? raw.include : [],
    exclude: Array.isArray(raw.exclude) ? raw.exclude : [],
    exempt: Array.isArray(raw.exempt) ? raw.exempt.filter((e) => e && typeof e.id === 'string') : [],
  };
}
