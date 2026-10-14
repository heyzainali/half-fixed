# half-fixed

> Read by Claude Code as CLAUDE.md and by Codex and other agents as AGENTS.md (a symlink).

A git-history scanner that finds fixes made to some sibling implementations but not the others, shipped as Agent Skills. Bun for development, a Node 18+ runtime for the shipped CLI.

## Quick reference

```bash
bun install
bun run test                                  # bun:test suites
bun run test:coverage                         # 100% line and function coverage of src/, then check:fallback
bun run check:metadata                        # versions, Bun pin, skill frontmatter in step
bun run build:fallback                        # rebuild the scanner bundled in the half-fixed skill
bun run build:zip -- vX.Y.Z                   # Codex plugin ZIP for OpenAI's plugin directory
bun run half-fixed -- scan /path/to/repo      # run the CLI from source
```

## Layout

```
bin/half-fixed.js                # npm bin, wires runCli to the process
src/
├── cli.js                       # arguments, commands, exit codes
├── scan.js                      # the scan itself, confidence, exemptions
├── diff.js                      # git log -p parser, change blocks, window selection
├── groups.js                    # sibling group discovery, glob matching
├── normalize.js                 # whitespace normalization, window search
├── git.js                       # git helpers, cached file reads at a revision
├── config.js                    # .half-fixed.json
├── report.js                    # text output
└── version.js                   # VERSION, bumped by the release script
plugins/half-fixed/              # the plugin: all that Claude Code and Codex install, and the directories list
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── assets/logo.png              # from assets/logo.svg, see scripts/render-readme-art.js
├── README.md, LICENSE           # LICENSE is a copy of the root one
└── skills/
    ├── half-fixed/
    │   ├── SKILL.md             # agent workflow: scan, triage, fix
    │   ├── references/          # triage.md, fixing.md (loaded on demand)
    │   └── scripts/half-fixed.js  # bundled CLI (bun build --target=node), committed, never edited by hand
    └── house-style/SKILL.md     # match a repo's PR and commit conventions
skills -> plugins/half-fixed/skills  # keeps the old path working
.claude-plugin/marketplace.json  # Claude Code marketplace; .agents/plugins/marketplace.json is Codex's
scripts/                         # build, check, and release tooling (plain Node, shared helpers in lib.js)
test/                            # bun:test suites that build throwaway git repos
```

## Rules

- **Zero runtime dependencies.** Copied skills run the bundle with plain `node`, so there's no install step. Node 18 is the floor: don't use APIs newer than that in `src/`.
- **Only plugin files go in `plugins/half-fixed/`.** Directory scanners read everything in it, and installs copy all of it. Maintainer tooling stays outside.
- **Every `git` call is synchronous.** Under Bun, an async child process whose exit overlaps a synchronous spawn can lose its `close` event and hang. See `gitLines` in `src/git.js`.
- After changing anything in `src/` or `bin/`, run `bun run build:fallback` and commit the regenerated bundle. CI fails if it's stale.
- The scanner reports candidates. Judgement lives in the skill instructions, not in more heuristics.
- Every heuristic change gets a test in `test/scan.test.js` that builds the repository shape it's about, and a before-and-after scan of a real repository (prism-php/prism is the reference case).
- Conventional Commits. No version bumps outside `bun run release`. User-visible changes get a CHANGELOG entry under Unreleased.
