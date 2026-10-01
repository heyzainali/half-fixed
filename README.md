<div align="center">

# half-fixed

**Your bug was fixed. Just not everywhere.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-SKILL.md-blue)](https://agentskills.io)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

</div>

Codebases are full of siblings: provider adapters, database drivers, cache stores, payment gateways, platform ports. Someone hits a bug in one of them, fixes it, and moves on. The other siblings have the same code and the same bug, and nobody notices until a user does.

half-fixed reads your git history and finds those gaps. It gives your coding agent a workflow for checking each one and fixing the real ones with tests. It also drafts the pull request in the target project's own style.

## What it finds

This is a real run on [prism-php/prism](https://github.com/prism-php/prism), a PHP library with ten LLM provider integrations:

```text
$ half-fixed scan --group Maps/ToolMap.php
3 half-fixed changes found (24 commits, 1 sibling group, at upstream/main)

src/Providers/*/Maps/ToolMap.php
  hf-5505660  high  fixed in 2 of 10, still old in 4
    fixed    DeepSeek, OpenRouter 9447c71 2025-10-14 fix(DeepSeek|OpenRouter): Fix exceptions during tool conversion without parameters (#661)
    missing  Groq:21, Mistral:21, XAI:21, Z:21
    + ...$tool->hasParameters() ? [
    + ] : [],
```

In October 2025, a fix stopped DeepSeek and OpenRouter from failing on tools that take no parameters. Groq, Mistral, xAI and Z kept the old code, so a parameterless tool sent `"properties": []` and their APIs rejected the request. The fix for all four is [prism-php/prism#1038](https://github.com/prism-php/prism/pull/1038).

A full scan of Prism reads 337 commits across 46 sibling groups in about two seconds and reports 25 high-confidence candidates.

## Quick start

**As an agent skill.** In Claude Code:

```text
/plugin marketplace add zain534102/half-fixed
/plugin install half-fixed@half-fixed
```

For Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode, and any other agent that reads `SKILL.md`:

```bash
npx skills add zain534102/half-fixed
```

Then ask: *"Find half-fixed bugs in this repo"*, or *"Did my last fix reach every provider?"*

**As a CLI.** You need Node 18 or newer. There's nothing else to install:

```bash
npx half-fixed scan
```

## How it works

1. **Find siblings.** Files whose paths differ in exactly one directory form a group (`src/Providers/*/Maps/ToolMap.php`). So do files in one directory that share a name suffix (`src/Cache/*Store.php`). Tests, vendored code, and build output are skipped.
2. **Replay history.** For every commit that changed only some members of a group, half-fixed takes the code the commit replaced, plus just enough surrounding lines to pin it down. A fix that wraps old code instead of deleting it still counts.
3. **Check the rest.** If another member still has that exact code (ignoring whitespace) and doesn't have the replacement, that member is reported as missing the change.
4. **Rank.** Fix commits rank above features and refactors. A change that relies on names only the fixed file has, like a renamed local variable, ranks lower, because no sibling could take it as-is.

Everything is deterministic and works offline. There are no models, no network calls, and no dependencies. The judgement calls are left to the agent, guided by the skill.

## The skills

| Skill | What it does | Try saying |
|---|---|---|
| **half-fixed** | Runs the scan, triages every finding as `gap`, `intentional`, `handled-elsewhere`, `obsolete` or `unsure` with evidence, then fixes confirmed gaps test-first | *"Find half-fixed bugs in this repo"* |
| **house-style** | Learns a repository's conventions from its contributing guide, PR template, CI, and recently merged PRs. Checks for duplicate PRs, scope creep, and AI-contribution policies, then drafts the commit and PR to match | *"Draft the PR for this fix in their style"* |

The scanner finds candidates. It can't tell a missed fix from a deliberate difference. In Prism it also flags DeepSeek for not taking a later OpenRouter change that always sends `parameters`. History shows DeepSeek's own fix was to omit `parameters` (the same commit, `9447c71`), so the difference is deliberate. The triage step exists to make calls like that one.

## Check your own branch

Pass `--base` to look only at your branch's commits. It catches the moment you change two siblings and forget the third:

```bash
half-fixed scan --base origin/main --confidence low
```

Run on the branch behind prism-php/prism#1038, this flags the change for leaving out DeepSeek and OpenAI. The PR description explains that exclusion, and it's the kind of thing a reviewer will ask about.

In CI, exit code 1 means findings and 2 means an error:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npx half-fixed scan --base origin/${{ github.base_ref }} --confidence low
```

## CLI

```text
half-fixed scan [path]        list changes made to some siblings but missing from others
half-fixed show <id> [path]   full detail for one finding
half-fixed groups [path]      list the sibling groups that will be compared

--rev <rev>          revision to check (default HEAD)
--base <rev>         only commits after this one
--since <date>       only read history after this date
--max-commits <n>    history depth (default 5000)
--min-members <n>    smallest sibling group to consider (default 3)
--group <text>       only groups whose pattern contains this text
--confidence <lvl>   lowest confidence to report: high (default), medium, low
--all                same as --confidence low
--json               machine-readable output
```

## Exemptions

When a difference is deliberate, record it in `.half-fixed.json` at the repository root:

```json
{
  "exempt": [
    { "id": "hf-ca17de4", "members": ["DeepSeek"], "reason": "DeepSeek omits parameters on purpose, see 9447c71" }
  ],
  "exclude": ["legacy/**"]
}
```

Dismissed findings are still counted in the output, so they don't disappear silently. The file also accepts `minMembers`, `maxCommits`, and `include`.

## Limits

- It needs history. In a shallow clone, run `git fetch --unshallow` first.
- It matches code exactly, apart from whitespace. A sibling with the same bug written differently won't be found.
- Siblings are found by path and file name. Two implementations living in unrelated places aren't compared.
- Renamed directories break the link between old commits and current files.

## Found with half-fixed

| Project | Gap | PR |
|---|---|---|
| prism-php/prism | Empty tool properties sent as `[]` to Groq, Mistral, xAI and Z | [#1038](https://github.com/prism-php/prism/pull/1038) |

Found one? Open a PR adding it to this table.

## Development

You need [Bun](https://bun.sh) (the version pinned in `package.json`) and Node 18 or later.

```bash
bun install
bun run test
bun run half-fixed -- scan /path/to/repo
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the layout, the checks CI runs, and the rules for changing detection.

## License

[MIT](LICENSE)
