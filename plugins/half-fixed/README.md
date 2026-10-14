# half-fixed

Agent skills that find bug fixes which reached some sibling implementations but not the others, like a fix made to one provider adapter, database driver, cache store, or platform port that its siblings still need. The agent triages each finding, fixes confirmed gaps with a test, and drafts the contribution in the target repository's own style.

## Skills

| Skill | What it does |
| --- | --- |
| `half-fixed` | Scans git history for changes made to some members of a sibling group while the others still have the old code, then walks the agent through triaging and fixing each finding. |
| `house-style` | Writes the commit, branch, and pull request the way that repository's maintainers expect, learned from its contributing guide, templates, CI, and recently merged pull requests. |

## What runs on your machine

- `skills/half-fixed/scripts/half-fixed.js` is the scanner: one readable file with no dependencies, run with Node.js 18 or newer. It runs only `git`, reads history and files without running any of the repository's code, and makes no network calls.
- The skills wait for your go-ahead before pushing, opening a pull request, or commenting, and before running a command that executes a project's own code, such as its install, build, or tests.
- Nothing is collected or sent anywhere. Files change only when you ask the agent to fix a finding: it edits that repository's code and tests, and may record deliberate differences in an optional `.half-fixed.json` in a repository you maintain. See [PRIVACY.md](https://github.com/heyzainali/half-fixed/blob/main/PRIVACY.md).

## Requirements

`git` and Node.js 18 or newer.

## More

Source, documentation, and the npm CLI (`npx half-fixed scan`): https://github.com/heyzainali/half-fixed

MIT licensed. See [LICENSE](LICENSE).
