<a id="readme-top"></a>

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/hero-dark.svg">
  <img src="assets/readme/hero-light.svg" alt="half-fixed" width="560">
</picture>

<p><b>Your bug was fixed. Just not everywhere.</b><br>
half-fixed finds fixes that reached some sibling implementations but not the others,<br>
then helps your agent check them and finish the job.</p>

<p>
  <a href="https://www.npmjs.com/package/half-fixed"><img src="https://img.shields.io/npm/v/half-fixed?style=flat-square&color=e8590c&label=npm" alt="npm version"></a>
  <a href="https://github.com/heyzainali/half-fixed/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/heyzainali/half-fixed/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status"></a>
  <a href="#quick-start"><img src="https://img.shields.io/node/v/half-fixed?style=flat-square&color=e8590c" alt="Node version"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/dependencies-0-e8590c?style=flat-square" alt="Zero dependencies"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-e8590c?style=flat-square" alt="MIT license"></a>
</p>

<p>
  <a href="#quick-start"><b>Quick start</b></a>
  &nbsp;·&nbsp;
  <a href="#bugs-it-has-found"><b>Bugs found</b></a>
  &nbsp;·&nbsp;
  <a href="#how-it-works"><b>How it works</b></a>
  &nbsp;·&nbsp;
  <a href="#skills"><b>Skills</b></a>
  &nbsp;·&nbsp;
  <a href="#cli"><b>CLI</b></a>
  &nbsp;·&nbsp;
  <a href="docs/evidence/README.md"><b>Evidence</b></a>
  &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md"><b>Contributing</b></a>
</p>

<br>

<img src="assets/readme/demo.svg" width="876" alt="A terminal running npx half-fixed scan --group ToolMap on prism-php/prism. It reports hf-5505660: a fix made to the DeepSeek and OpenRouter tool maps in commit 9447c71 that the Groq, Mistral, xAI and Z tool maps never got. The last line notes that the gap is fixed in prism-php/prism#1038.">

</div>

<br>

Most codebases have siblings: provider adapters, database drivers, cache stores, payment gateways, platform ports. Each one does the same job its own way. When a bug turns up in one of them, someone fixes that one and moves on. The siblings often have the same code and the same bug, and nobody notices until a user hits it.

half-fixed reads your git history and finds those gaps. It's a fast, offline scanner and two Agent Skills: one checks which findings are real bugs and fixes them with tests, and the other writes the pull request the way the project's maintainers expect.

<table>
  <tr>
    <td width="33%" valign="top">
      <p><img src="assets/readme/icon-history.svg" width="40" height="40" alt=""></p>
      <p><b>Learns from your own fixes</b><br>
      Every fix in your history is a test case. half-fixed checks whether each one reached all the code that needed it.</p>
    </td>
    <td width="33%" valign="top">
      <p><img src="assets/readme/icon-bug.svg" width="40" height="40" alt=""></p>
      <p><b>Finds real bugs</b><br>
      Its findings became fixes in Prism and LiteLLM. In LiteLLM, one high-confidence finding in five was a real gap.</p>
    </td>
    <td width="33%" valign="top">
      <p><img src="assets/readme/icon-fast.svg" width="40" height="40" alt=""></p>
      <p><b>Fast and offline</b><br>
      5,000 commits in about a minute. It runs <code>git</code> and nothing else: no model, no network, no telemetry.</p>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <p><img src="assets/readme/icon-evidence.svg" width="40" height="40" alt=""></p>
      <p><b>Evidence, not autofix</b><br>
      The skill has your agent check each finding against the original fix and back every verdict before it touches code.</p>
    </td>
    <td width="33%" valign="top">
      <p><img src="assets/readme/icon-agents.svg" width="40" height="40" alt=""></p>
      <p><b>Works with your agent</b><br>
      Plugins for Claude Code and Codex, skills for any agent that reads <code>SKILL.md</code>, and a standalone CLI.</p>
    </td>
    <td width="33%" valign="top">
      <p><img src="assets/readme/icon-pull-request.svg" width="40" height="40" alt=""></p>
      <p><b>Catches it in review</b><br>
      <code>--base</code> flags a branch that fixes two siblings and forgets the third, before a reviewer has to.</p>
    </td>
  </tr>
</table>

## Quick start

**Claude Code.** Type these inside a Claude Code session, not a shell:

```shell
/plugin marketplace add heyzainali/half-fixed
/plugin install half-fixed@half-fixed
```

**Codex**

```shell
codex plugin marketplace add heyzainali/half-fixed
codex plugin add half-fixed@half-fixed
```

**Any other agent that supports `SKILL.md`** can use the Agent Skills CLI:

```shell
npx skills add heyzainali/half-fixed   # or: bunx skills add heyzainali/half-fixed
```

Then ask your agent to **"Find half-fixed bugs in this repo"**.

- **Only want the scanner?** Run `npx half-fixed scan` in any git repository. It needs Node 18 or newer and nothing else.
- **Rather your agent did the install?** Paste the prompt below into it.

<details>
<summary><b>Install prompt for your agent</b></summary>

```text
Install the half-fixed skills from https://github.com/heyzainali/half-fixed.

Work out which agent you are, then use the matching method. If a command fails or you can't run it, tell me the exact command to run myself.

- Claude Code: run `claude plugin marketplace add heyzainali/half-fixed`, then `claude plugin install half-fixed@half-fixed`. If the `claude` CLI isn't available, tell me to type `/plugin marketplace add heyzainali/half-fixed` and then `/plugin install half-fixed@half-fixed` in this session.
- Codex: run `codex plugin marketplace add heyzainali/half-fixed`, then `codex plugin add half-fixed@half-fixed`.
- Any other agent that supports SKILL.md: run `npx skills add heyzainali/half-fixed`. If that doesn't work, clone the repository to a temporary directory and copy both folders in its `skills/` directory into your skills directory.

Prefer a project install unless I asked for a global one. When you're done, tell me what you installed, where, and whether I need to restart you.
```

</details>

## Bugs it has found

| Project | The fix that landed | The sibling that missed it | Pull request |
|---|---|---|---|
| [prism-php/prism](https://github.com/prism-php/prism) | DeepSeek and OpenRouter stopped failing on tools with no parameters ([`9447c71`](https://github.com/prism-php/prism/commit/9447c71d8697950ff1005f2409b95c99afcdcf84)) | Groq, Mistral, xAI and Z still sent `"properties": []`, which their APIs reject | [#1038](https://github.com/prism-php/prism/pull/1038) |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | `disable_custom_api_keys` started honouring `config.yaml` ([#42437](https://github.com/BerriAI/litellm/pull/42437)) | `scope_user_search_to_org` still ignored `config.yaml`, so any logged-in user could list every user while the settings page said they couldn't | [#44925](https://github.com/BerriAI/litellm/pull/44925) |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | Azure's passthrough started reading the value of `stream` ([`df6fb9e`](https://github.com/BerriAI/litellm/commit/df6fb9e5d95e97b7b207cd278d107e82b134fe45)) | vLLM's passthrough still only checked that the key existed, so `"stream": false` on the `/vllm` route crashed with a 500 | [#44936](https://github.com/BerriAI/litellm/pull/44936) |

Each one started as a single finding, like `hf-5505660` in the demo above. Found one yourself? Open a pull request that adds it to this table.

## How it works

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/how-it-works-dark.svg">
    <img src="assets/readme/how-it-works-light.svg" alt="Commit 9447c71 fixed the DeepSeek and OpenRouter tool maps in prism-php/prism. Groq, Mistral, xAI and Z still had the old code, so half-fixed reports hf-5505660: fixed in 2 of 10, still old in 4." width="100%">
  </picture>
</p>

1. **Find siblings.** Files whose paths differ in exactly one directory form a group, like `src/Providers/*/Maps/ToolMap.php`. So do files in one directory that share a name suffix, like `src/Cache/*Store.php`. Tests, vendored code, and build output are skipped.
2. **Replay history.** For every commit that changed only some members of a group, half-fixed takes the code the commit replaced, plus just enough surrounding lines to pin it down. A fix that wraps old code instead of deleting it still counts.
3. **Check the rest.** If another member still has that code, ignoring whitespace, and doesn't already have the new lines, it's reported as missing the change.
4. **Rank.** Fix commits rank above features and refactors. Commits about lint, types, or formatting don't count as fixes. A change that relies on names only the fixed file has, like a renamed local variable, ranks lower, because no sibling could take it as-is.

The only program it runs is `git`, and it never writes to your repository.

### Reading a finding

```text
  hf-5505660  high  fixed in 2 of 10, still old in 4
    fixed    DeepSeek, OpenRouter 9447c71 2025-10-14 fix(DeepSeek|OpenRouter): Fix exceptions during tool conversion without parameters (#661)
    missing  Groq:21, Mistral:21, XAI:21, Z:21
    + ...$tool->hasParameters() ? [
    + ] : [],
```

- **`hf-5505660`** is a stable ID. Pass it to `half-fixed show` for the full old and new code and the line in every sibling, or use it in an exemption.
- **`high`, `medium`, `low`** is the confidence. `high` means a bug-fix commit replaced code that siblings still have, or several fix commits made the same addition. `medium` is a single fix that only added lines, or the same non-fix change made in several commits. `low` is a single feature or refactor commit. Any finding drops a level when no sibling could take the new code as-is. The scan shows `high` by default.
- **`fixed in 2 of 10, still old in 4`** means the change reached 2 of the group's 10 members, and 4 still have the old code. The other 4 differ too much to compare.
- **`missing  Groq:21`** is a sibling and the line where its old code starts.
- **`+` and `-` lines** preview what the fix changed. Here there are only added lines, because `9447c71` wrapped the old block instead of replacing it.

In `show` and `--json` output, a sibling can also list **`needs`**: names the new code uses that the sibling's file doesn't have. A non-empty `needs` means the fix has to be adapted, not copied.

## How accurate is it?

Every high-confidence finding on LiteLLM's main branch at [`b6d587d`](https://github.com/BerriAI/litellm/tree/b6d587d23e1c104340a905b45cb4027d7153a0ad) was checked against the original fix and the sibling's code:

| Verdict | Findings |
|---|---:|
| Real gap: the sibling still has the bug | 13 |
| Fixed another way, or no longer needed | 40 |
| Deliberately different | 12 |
| Unsure | 1 |

So about one in five was a real bug, in a heavily reviewed project with nearly 1,800 contributors. The other four in five are why half-fixed never patches anything on its own: in mature code, most differences between siblings are on purpose. The scanner turns thousands of commits into a short list, and the skill makes your agent read each one and back every verdict with evidence.

| Project | Commits read | Sibling groups | High-confidence findings | Time |
|---|---:|---:|---:|---:|
| [prism-php/prism](https://github.com/prism-php/prism) | 337 | 46 | 24 | 3 s |
| [laravel/framework](https://github.com/laravel/framework) | 1,960 | 90 | 8 | 6 s |
| [django/django](https://github.com/django/django) | 563 | 52 | 7 | 3 s |
| [rails/rails](https://github.com/rails/rails) | 1,569 | 60 | 3 | 5 s |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | 5,000 | 339 | 66 | 69 s |

[The evidence page](docs/evidence/README.md) has every revision, the raw output, and the verdicts with links to the exact lines, so you can check all of it.

## Skills

| Skill | Try saying |
|-------|------------|
| **half-fixed**<br>Runs the scan, then checks every finding against the original fix and the sibling's code and gives it a verdict: `gap`, `intentional`, `handled-elsewhere`, `obsolete`, or `unsure`. Fixes confirmed gaps test-first, and records deliberate differences as exemptions | *"Find half-fixed bugs in this repo"*<br>*"Did my last fix reach every provider?"* |
| **house-style**<br>Learns a repository's conventions from its contributing guide, PR template, CI, and recently merged pull requests. Checks for duplicate PRs, scope creep, and AI-contribution policies, then drafts the commit and PR to match. Never pushes without your go-ahead | *"Draft the PR for this fix in their style"* |

## Check your own branch

`--base` limits the scan to your branch's commits. It catches the moment you change two siblings and forget the third:

```shell
npx half-fixed scan --base origin/main --confidence low
```

Run on the branch behind prism-php/prism#1038, it flags DeepSeek and OpenAI as left out. That was deliberate, because both already omit `parameters` for tools without any, but it's exactly what a reviewer will ask about, so it belongs in the PR description.

In CI, the exit code is 1 when there are findings and 2 on an error:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npx half-fixed scan --base origin/${{ github.base_ref }} --confidence low
```

## CLI

The scanner needs Node 18 or newer and has no dependencies:

```shell
npx half-fixed --help
npm install -g half-fixed   # then: half-fixed --help
```

| Command | Purpose |
|---------|---------|
| `half-fixed scan [path]` | List changes made to some siblings but missing from others |
| `half-fixed show <id> [path]` | Show one finding in full: the old and new code, and the line in every sibling |
| `half-fixed groups [path]` | List the sibling groups that will be compared |

| Option | Purpose |
|--------|---------|
| `--rev <rev>` | Revision to check (default `HEAD`) |
| `--base <rev>` | Only commits after this one |
| `--since <date>` | Only read history after this date |
| `--max-commits <n>` | History depth (default 5000) |
| `--min-members <n>` | Smallest sibling group to consider (default 3) |
| `--group <text>` | Only groups whose pattern contains this text |
| `--confidence <level>` | Lowest confidence to report: `high` (default), `medium`, or `low` |
| `--all` | Same as `--confidence low` |
| `--json` | Machine-readable output |

Exit codes: 0 when nothing is found, 1 when there are findings, 2 on an error.

## Configuration

Put a `.half-fixed.json` at the repository root to record deliberate differences and tune the scan:

```json
{
  "exempt": [
    { "id": "hf-ca17de4", "members": ["DeepSeek"], "reason": "DeepSeek omits parameters on purpose, see 9447c71" }
  ],
  "exclude": ["legacy/**", "django/conf/locale/**"],
  "minMembers": 3,
  "maxCommits": 5000
}
```

- **`exempt`** dismisses a finding, or only some of its members, with a reason. Dismissed findings are still counted in the output, so nothing disappears silently.
- **`exclude`** adds globs to skip on top of the defaults (tests, `vendor`, `node_modules`, build output).
- **`include`** replaces the default filter, which keeps source files in common languages, with your own globs.

## FAQ

**Does it use AI or send my code anywhere?**
The scanner doesn't. It runs `git` locally and prints text. The skills are instructions for the coding agent you already use, and they only decide what to do with the scanner's output.

**How noisy is it?**
In LiteLLM, about one high-confidence finding in five was a real bug, and the rest were deliberate or already handled (see [How accurate is it?](#how-accurate-is-it)). The skill is built around that. Things that differ on purpose, like locale files or backend feature flags, can be excluded or exempted once and they stay quiet.

**Which languages does it support?**
Matching works on lines with whitespace ignored, so it doesn't parse any language. By default it scans source files in about thirty languages, including PHP, Python, Ruby, JavaScript, TypeScript, Go, Java, Kotlin, Rust, C, C++, C#, Swift, and Elixir. For anything else, list your files with `include` in `.half-fixed.json`.

**Why didn't it find a gap I know about?**
Either the sibling's code was already different from the old code, even slightly, or the siblings aren't arranged by path in a way half-fixed recognises. See the limits below.

## Limits

- **It needs history.** In a shallow clone, run `git fetch --unshallow` first, or accept a shorter window.
- **It matches code exactly, apart from whitespace.** A sibling with the same bug written differently won't be found.
- **Siblings are found by path.** Implementations that live in unrelated places, or whose files are named after themselves in different directories (`mysql/mysql-compiler.js`, `pg/pg-compiler.js`), aren't compared.
- **Renaming a directory breaks the link** between older commits and the files as they are now.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md), and report security issues as described in [SECURITY.md](SECURITY.md). User-visible changes are listed in the [changelog](CHANGELOG.md).

```shell
bun install
bun run test
bun run half-fixed -- scan /path/to/repo
```

## License

half-fixed is released under the [MIT License](LICENSE).

<div align="center">
<br>
<sub><a href="#readme-top">Back to top</a></sub>
</div>
