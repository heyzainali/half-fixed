# Changelog

All notable changes to half-fixed are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add an entry under `## [Unreleased]` in the same pull request as any change a user would notice, especially changes to scanner output, confidence, flags, and skill instructions. Users of copied skill installs run the bundled fallback CLI, so they need to know when its behaviour changes. `bun run release` refuses to release while `Unreleased` is empty, and moves its entries under the new version. See [CONTRIBUTING.md](CONTRIBUTING.md#changelog).

## [Unreleased]

### Added

- The Codex plugin has a logo, two fixed siblings over two that still have the old code.

### Changed

- The Codex plugin's short description is now "Find half-applied bug fixes", which fits the 30-character limit of OpenAI's plugin directory.

## [0.1.1] - 2026-10-12

### Security

An independent review found more ways a repository you scan, which may not be yours, could interfere with the scan:

- `npx half-fixed`, `npm exec`, and `bunx` put the current project's `node_modules/.bin` first on `PATH`, so scanning from inside a repository that commits its own `git` there ran that program. half-fixed now looks git up itself and skips `node_modules` directories, relative `PATH` entries, and the directory being scanned. On Windows this also stops git being looked up in the current directory.
- `.half-fixed.json` must be a regular file under 256 KiB, so a symlink can't make the scan read `/dev/zero` or another of your files, and a parse error no longer quotes the file. Glob lists are capped at 50 globs of up to 200 characters, exemption reasons are kept to one line, and `minMembers` and `maxCommits` are bounded.
- Very long lines and paths, hunks split into hundreds of edits, and files over 1 MiB are skipped where matching them would take quadratic time or unbounded memory. Glob matching rejects most paths before doing any work.
- `git log` runs with `--no-show-signature` and its own diff prefixes, so a repository's git config can't start a signature program or change the diff the parser reads. Revisions and pathspecs reach git on stdin, so a repository with very many sibling groups no longer fails with `E2BIG`.
- Output escapes every control and format character, including zero-width characters, Unicode tag characters, and variation selectors, which could hide instructions from an agent reading it. `--json` escapes the same characters as `\u` sequences, so it's still the same data to a parser. Error messages are escaped too.
- The skills ask for the user's go-ahead before running any of a repository's code and before fetching in a clone you didn't make, treat every field the scanner reports as untrusted, quote repository text passed to a shell, and report how many findings a repository's own config dismissed.

### Changed

- `--max-commits` and `--min-members` accept whole numbers from 1 to 1,000,000, and an argument that happens to share a name with an object property, such as `constructor`, is read as a path.
- The error for a repository owned by another user now says so, instead of "not a git repository", and doesn't suggest turning off git's ownership check.

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
- Text from the scanned repository, such as commit subjects, paths, and code, is printed with terminal control characters and bidirectional overrides escaped, so it can't rewrite your terminal or disguise code. `--json` escaped control characters below U+0020.
- Globs in `.half-fixed.json` are matched in linear time, and values of the wrong type are ignored, so a crafted glob can't make matching take exponential time.
- The scan runs `git log` with `--no-textconv` and `--no-ext-diff`, so it never starts a diff or text-conversion program.
- Both skills treat a repository's documents, issues, and pull requests as data, and ask before running a project's install, build, or test commands in a repository you don't trust.

[Unreleased]: https://github.com/heyzainali/half-fixed/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/heyzainali/half-fixed/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/heyzainali/half-fixed/releases/tag/v0.1.0
