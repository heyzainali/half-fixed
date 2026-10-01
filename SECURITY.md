# Security Policy

## Supported Versions

The latest release tag on the `main` branch is supported. Older tags are supported on a best-effort basis. Please upgrade and confirm the issue reproduces on `main` before reporting.

## Reporting a Vulnerability

Please report vulnerabilities privately via [GitHub Security Advisories](https://github.com/zain534102/half-fixed/security/advisories/new) rather than opening a public issue.

Include, where possible:

- A description of the vulnerability and its impact
- Steps to reproduce or a proof of concept
- The commit or version you tested against

You can expect an initial response within 7 days. If the issue is confirmed, a fix will be released as soon as practical and credited in the release notes unless you prefer to remain anonymous. Please allow up to 90 days of coordinated disclosure before publishing details, and say if you are working to a shorter deadline.

## Safe Harbor

Good-faith security research against this repository is welcome. We will not pursue legal action against researchers who follow this policy, avoid harming users or disrupting services, and give us a chance to fix confirmed issues before disclosing them.

## Scope

This policy covers the code and plugin manifests in this repository (`src/`, `bin/`, `skills/`, `.codex-plugin/`, `.claude-plugin/`, `.agents/`).

The scanner runs `git` against repositories you point it at and reads their history and file contents. Reports about it executing anything other than `git`, writing to the scanned repository, or being steered by crafted commit messages or file contents are especially welcome.
