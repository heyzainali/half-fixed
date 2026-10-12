# Fixing a confirmed gap

Only start once triage gave the finding a `gap` verdict and the user wants it fixed.

## 1. Reproduce first

Add a test to the sibling's existing test file, modelled on the test the original fix added. `git show <sha> --stat` lists the test files it touched. Run that test and confirm it fails, and that it fails for the reason triage gave, not because of a typo or a missing fixture.

If the project has no tests for that sibling, create the test file where its neighbours' tests live, following their naming and structure.

## 2. Apply the change, adapted

- Follow the shape the fixed siblings already use, so the siblings converge instead of growing a third variant.
- Check `needs` in the finding. Every name listed there has to exist in the sibling, through an import, a local variable, or an equivalent, before the code can work.
- When three or more siblings need identical code, a shared helper in the type they all use is often the cleanest fix. For example, `Tool::parametersAsJsonObject()` replaced three hand-written variants in Prism. It does widen the change, so ask the user before choosing it for someone else's repository.

## 3. Verify like CI does

Read the CI workflow (`.github/workflows/*`, or the CI config the project uses) and run the same commands locally: formatter, static analysis, tests. Keep any changes the formatter makes to your files. Don't reformat files you didn't touch.

Those commands run the project's own code, including its install scripts and tests. In a repository the user doesn't trust, say what you're about to run and wait for a go-ahead.

## 4. Re-scan

Run the scan again. The finding should be gone, or reduced to members you deliberately left out. If a new finding appears that points at your own change, it means you changed some siblings and not others. Either cover the rest or be ready to explain why you didn't.

## 5. Hand off

For a contribution to someone else's project, continue with the `house-style` skill. In the PR description, name the original fix ("same failure as #661, which fixed DeepSeek and OpenRouter"). Maintainers review faster when they can see the precedent.
