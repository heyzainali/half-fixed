# Triage

For each finding, decide whether the missing siblings really need the change. Work through the questions in order and stop when you have a verdict you can back up.

## 1. What did the original change fix?

```bash
node <this-skill-dir>/scripts/half-fixed.js show <id>
git show <sha>                 # the whole commit, tests included
gh pr view <number>            # when the subject ends in (#123) and gh is available
```

Write one sentence: "When X happens, the old code does Y; the fix makes it do Z." If the commit is a feature or a refactor rather than a fix, say so. Those are usually `intentional` or `obsolete`.

## 2. Can the sibling hit the same input?

The old code being present isn't enough on its own. The sibling also has to be reachable with the input that broke the fixed member.

- Does the sibling talk to a service, format, or platform that behaves differently? Check its API docs, or the sibling's own tests and fixtures, for the field or case in question.
- Is the input filtered out earlier in the sibling's code path, for example by a guard in the caller or a different request shape?
- Does the sibling's existing test suite already cover this case? If it does, it passes for a reason. Find the reason.

## 3. Is it already handled some other way?

Search the sibling for the same idea written differently: a different null check, a shared helper, a base class, a middleware. A gap you think you've found is often handled one call up.

## 4. Verdict

| Verdict | Meaning | Evidence you need |
|---|---|---|
| `gap` | The sibling has the bug the fix removed | The failing input and why the sibling reaches the old code with it |
| `intentional` | The difference is deliberate | The doc, comment, test, or API behaviour that makes it deliberate |
| `handled-elsewhere` | The sibling is safe through other code | The file and line that handles it |
| `obsolete` | The change was a refactor, rename, or feature that doesn't apply | What the change actually did |
| `unsure` | You can't tell without running it or asking | What you'd need to find out |

Prefer `unsure` over a confident guess. A wrong `gap` turns into a PR that wastes a maintainer's time.

## Examples from Prism (prism-php/prism)

- **gap:** `hf-5505660`. The commit "Fix exceptions during tool conversion without parameters" changed DeepSeek and OpenRouter. Groq, Mistral, xAI and Z still sent `"properties": []` for a parameterless tool, and those APIs require an object. One PR covers all four: prism-php/prism#1038.
- **intentional:** `hf-ca17de4`. A later OpenRouter fix always sends `parameters` because gpt-5 through OpenRouter rejected tools without them. The scanner flags DeepSeek, which still omits `parameters` for parameterless tools. But omitting them was DeepSeek's own fix (commit `9447c71`, "Fix exceptions during tool conversion without parameters"), so the difference is deliberate, and an exemption citing that commit is the right answer. If you can show DeepSeek now fails the other way, it becomes a `gap`.
- **intentional:** Anthropic's handler defaults `max_tokens` to 64000 because Anthropic's API requires the field. Other providers treat it as optional, so the missing default isn't a bug there.

## Output

For each finding, report:

```
hf-5505660  src/Providers/*/Maps/ToolMap.php  missing: Groq, Mistral, XAI, Z
verdict: gap
why: parameterless tools encode properties as [] and these APIs require an object; same failure #661 fixed for DeepSeek/OpenRouter
```
