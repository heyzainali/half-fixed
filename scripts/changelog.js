// Adapted from danjdewhurst/story-skills (MIT).
// CHANGELOG.md follows Keep a Changelog. Changes land under `## [Unreleased]`,
// and the release script moves them into a dated section for the new version.

export const CHANGELOG_FILE = "CHANGELOG.md";
const REPO_URL = "https://github.com/heyzainali/half-fixed";
const UNRELEASED_HEADING = /^## \[Unreleased\][^\n]*\n/m;

function unreleasedBounds(text) {
  const heading = UNRELEASED_HEADING.exec(text);
  if (!heading) {
    return null;
  }
  const start = heading.index + heading[0].length;
  const rest = text.slice(start);
  // The section ends at the next release heading or the link references.
  const next = /^(## \[|\[[^\]]+\]: )/m.exec(rest);
  return { headingStart: heading.index, start, end: next ? start + next.index : text.length };
}

// The list items under `## [Unreleased]`, so an empty `### Added` heading
// alone does not count as an entry.
export function unreleasedEntries(text) {
  const bounds = unreleasedBounds(text);
  if (!bounds) {
    return [];
  }
  return text
    .slice(bounds.start, bounds.end)
    .split("\n")
    .filter((line) => /^[-*] \S/.test(line));
}

// Move the Unreleased entries under `## [next] - date`, leave an empty
// Unreleased section above it, and update the links at the foot. The first
// release (from 0.0.0) links to its tag rather than a compare view.
export function promoteUnreleased(text, current, next, date) {
  const bounds = unreleasedBounds(text);
  if (!bounds) {
    throw new Error(`${CHANGELOG_FILE} has no "## [Unreleased]" section.`);
  }
  if (unreleasedEntries(text).length === 0) {
    throw new Error(`${CHANGELOG_FILE} has no entries under "## [Unreleased]".`);
  }
  if (new RegExp(`^## \\[${next.replaceAll(".", "\\.")}\\]`, "m").test(text)) {
    throw new Error(`${CHANGELOG_FILE} already has a section for ${next}.`);
  }
  const body = text.slice(bounds.start, bounds.end).trim();
  let result = `${text.slice(0, bounds.headingStart)}## [Unreleased]\n\n## [${next}] - ${date}\n\n${body}\n\n${text.slice(bounds.end)}`;
  const versionLink = current === "0.0.0" ? `${REPO_URL}/releases/tag/v${next}` : `${REPO_URL}/compare/v${current}...v${next}`;
  const links = `[Unreleased]: ${REPO_URL}/compare/v${next}...HEAD\n[${next}]: ${versionLink}`;
  const unreleasedLink = /^\[Unreleased\]: .*$/m;
  result = unreleasedLink.test(result) ? result.replace(unreleasedLink, links) : `${result.trimEnd()}\n\n${links}\n`;
  return result;
}
