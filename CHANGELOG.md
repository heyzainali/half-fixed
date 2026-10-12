# Changelog

All notable changes to half-fixed are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add an entry under `## [Unreleased]` in the same pull request as any change a user would notice, especially changes to scanner output, confidence, flags, and skill instructions. Users of copied skill installs run the bundled fallback CLI, so they need to know when its behaviour changes. `bun run release` refuses to release while `Unreleased` is empty, and moves its entries under the new version. See [CONTRIBUTING.md](CONTRIBUTING.md#changelog).

## [Unreleased]

## [0.1.0] - 2026-10-12

### Added

- `half-fixed scan` finds changes that git history made to some members of a sibling group (files that differ in one directory, like `src/Providers/*/Maps/ToolMap.php`, or share a name suffix, like `src/Cache/*Store.php`) while other members still contain the old code. Matching ignores whitespace and widens the context around a change until it identifies it, so fixes that wrap old code instead of deleting it are found too.
- Findings are ranked `high`, `medium`, or `low` from the commit type and how many independent commits made the change, and drop a level when the new code relies on names only the fixed file has. Commits about lint, types, or formatting don't count as fixes. Siblings that already contain every line a change introduced aren't reported, and different additions at the same place are separate findings. `--confidence` and `--all` choose what to show.
- `half-fixed show <id>` prints one finding in full, with the file and line in each sibling. `half-fixed groups` lists the sibling groups.
- `--base <rev>` checks only a branch's commits, `--rev`, `--since`, `--max-commits`, `--min-members`, and `--group` narrow a scan, and `--json` gives machine-readable output. Exit codes are 0 for nothing found, 1 for findings, and 2 for errors.
- `.half-fixed.json` records exemptions with reasons, and sets `minMembers`, `maxCommits`, `include`, and `exclude`.
- `half-fixed` skill: scan, triage every finding with evidence, and fix confirmed gaps test-first.
- `house-style` skill: draft commits and pull requests that follow a repository's written rules and its recently merged pull requests.

### Security

Scanning someone else's repository means reading text and settings that its authors control, so half-fixed treats all of it as untrusted:

- `--rev` and `--base` are resolved to commits before git sees them, and a value that starts with `-` is refused, so it can't reach git as an option such as `--output=<file>`.
- Text from the scanned repository, such as commit subjects, paths, and code, is printed with terminal control characters and bidirectional overrides escaped, so it can't rewrite your terminal or disguise code. `--json` output was already escaped.
- Globs in `.half-fixed.json` are matched in linear time, and values of the wrong type are ignored, so a hostile config can't stall a scan.
- The scan runs `git log` with `--no-textconv` and `--no-ext-diff`, so it never starts a diff or text-conversion program.
- Both skills treat a repository's documents, issues, and pull requests as data, and ask before running a project's install, build, or test commands in a repository you don't trust.

[Unreleased]: https://github.com/heyzainali/half-fixed/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/heyzainali/half-fixed/releases/tag/v0.1.0
