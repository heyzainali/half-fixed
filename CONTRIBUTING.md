# Contributing to half-fixed

Thanks for helping. [`AGENTS.md`](AGENTS.md) holds the same rules for coding agents.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately, as described in [`SECURITY.md`](SECURITY.md), not in a public issue.

## Set up

Install the exact Bun version pinned by `packageManager` in `package.json` (currently `bun@1.4.2`), and Node 18 or later. Then:

```shell
bun install
bun run half-fixed -- --help
bun run half-fixed -- scan /path/to/some/repo
```

There are no runtime dependencies, and there must not be any. The scanner ships inside the skill folder and agents run it with plain `node`.

## How the code is laid out

- `src/` holds the scanner: `cli.js` (arguments and output), `scan.js` (the scan, confidence, exemptions), `diff.js` (the `git log -p` parser and change windows), `groups.js` (sibling discovery), `normalize.js`, `git.js`, `config.js`, `report.js`, and `version.js`.
- `bin/half-fixed.js` is the npm bin.
- `skills/half-fixed/scripts/half-fixed.js` is a single-file bundle of the CLI, built with `bun build --target=node` and committed. Copied skill installs run it with Node. Never edit it by hand.
- `skills/*/SKILL.md` are the agent instructions. Long material lives in `references/`.
- `scripts/` holds the build, check, and release tooling.

## Change detection

The scanner reports candidates, and the skill does the judging. Before adding a heuristic, check that the problem can't be handled in the skill's triage instructions.

1. Add a test in `test/scan.test.js` that builds the repository shape the change is about.
2. Run the scan on a real repository with sibling implementations before and after, and compare the high-confidence list. [prism-php/prism](https://github.com/prism-php/prism) is the reference case: `hf-5505660` must stay `high` at `5d6cc65`, the commit before prism-php/prism#1038 fixed `9447c71`'s gap.
3. Rebuild the fallback: `bun run build:fallback`, then `bun run check:fallback`. Commit the regenerated bundle with the change.
4. If the scan output changes, regenerate the README demo from a prism checkout at `5d6cc65`: `bun run build:demo -- /path/to/prism`. Commit `docs/demo/scan.svg` with the change.

## Add a skill

1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter holding `name` (equal to the directory name) and `description` (what it does and when to use it, under 1024 characters).
2. Write the instructions for the agent: what to read, what to run, and when to ask the user.
3. Run `bun run check:metadata`.
4. Add the skill to the skills table in the [README](README.md#the-skills).

## Run the checks

Run what CI runs, in this order, before you open a pull request:

```shell
bun run check:metadata
bun run test
bun run test:coverage
node skills/half-fixed/scripts/half-fixed.js --help
node scripts/check-package.js
```

`test:coverage` requires every line and function in `src/` to be covered, and also runs `check:fallback`. CI also runs the CLI and the bundled fallback on Node 18, 20, and 22.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: add --since option`, `fix: handle quoted paths in diffs`, `docs: update triage examples`.
- Keep each commit to one logical change.
- Update a branch by rebasing onto `main`, not by merging `main` in. Force-push a rebased branch only with `--force-with-lease`.
- Do not bump version numbers. The release script does that.

## Changelog

Add an entry under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) for any change a user would notice, using the Keep a Changelog headings (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`). Always add one for a change to scanner output, confidence, flags, or the skill instructions. Internal refactors, tests, and CI changes need no entry.

## Releasing

`bun run release <patch|minor|major|X.Y.Z>` (add `--dry-run` first) checks the branch, the changelog, npm, and GitHub, runs the checks, bumps every version file, moves the Unreleased entries under the new version, rebuilds the fallback, commits, tags, pushes, and creates the GitHub release. The tag push runs `.github/workflows/publish.yml`, which publishes to npm through trusted publishing. Configure the package's trusted publisher on npmjs.com before the first release.
