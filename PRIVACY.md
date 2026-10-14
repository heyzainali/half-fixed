# Privacy

half-fixed collects nothing. This covers the `half-fixed` CLI on npm and the half-fixed plugin for Claude Code and Codex, including both of its skills.

## What runs on your machine

- The scanner runs `git` against the repository you point it at and reads that repository's history and files. It prints its report to your terminal or to your agent. It has no telemetry and makes no network requests.
- Nothing is stored or sent anywhere by half-fixed. When you ask your agent to fix a finding, the skills guide it to change that repository's code and tests, like any change you ask for, and to record deliberate differences in an optional `.half-fixed.json`, only in a repository you maintain.

## What the skills ask your agent to do

The skills run inside your coding agent, under your accounts:

- To check a contribution against a project's conventions, the `house-style` skill may have the agent read that project's public pull requests and issues with your own `gh` CLI.
- The skills wait for your go-ahead before pushing, opening a pull request, or commenting, and before running a command that executes a project's own code, such as its install, build, or tests.
- What your agent sends to its model provider is covered by that provider's privacy policy, not by half-fixed.

## Contact

Open an issue at https://github.com/heyzainali/half-fixed/issues, or report a security problem privately as described in [SECURITY.md](SECURITY.md).
