# Project instructions

## Context and requirements

Before changing tests, read `.agents/qa-project-context.md` and `CONTRIBUTING.md`.
Use `README.md` for the product contract and `docs/qa-coverage-matrix.md` for
requirement coverage. When behavior or coverage changes, update the relevant
documentation and matrix.

Keep dependency versions in package manifests and configuration, and test counts
in the QA context. Do not duplicate them here.

## Container-only verification

Run all automated tests, lint checks and focused/debug runs through the Compose
`tests` service. Do not execute them directly on the host or CI runner.
The full verification command is:

```sh
docker compose --profile test run --build --rm tests
```

For focused runs, override the command of the same service. Rebuild the test image
after changing source files or dependencies. See `CONTRIBUTING.md` for commands.

## Test design

- Use expected values independent of application code. Do not call product
  calculation helpers to derive expected prices.
- Assert calculation components when an aggregate total could hide compensating
  errors. Include relevant boundaries and failure paths.
- Define independent data examples as separate tests at module scope. Keep a
  failure-and-recovery sequence together when the transition is the behavior under test.
- Give parameterized cases names that differ in words, not just punctuation.
  Use names such as "empty object", "empty array", "decimal point" and "decimal comma".
  Playwright sanitizes artifact directory names, so punctuation-only differences
  can make parallel tests share a directory.
- For a defect fix, demonstrate a failing regression test before the fix and a
  passing test afterward. Do not hide failures with retries, skips or weaker assertions.

## Allure reporting

Every Playwright test must call `reportScenario(feature, story)` from
`tests/report.ts`. Use named `test.step` blocks describing the action and expected
result in Russian. Keep failure details, screenshots and traces available.

## Completion evidence

Report which checks actually ran, their results and any unverified areas.
Distinguish local container verification from a confirmed GitHub Actions run.
Do not describe a prepared workflow, artifact upload or history cache as verified
until the corresponding execution has been observed.

## Agent skills

### Issue tracker
Tasks and specifications are stored in local Markdown files.
Before working with them, read `docs/agents/issue-tracker.md`.

### Triage labels
Five standard labels are used.
Before triage, read `docs/agents/triage-labels.md`.

### Domain docs
Use a single root-level `GLOSSARY.md` and `docs/adr/` directory.
Before domain research, read `docs/agents/domain.md`.

No em-dashes anywhere in this repo's prose (SKILL.md files, docs, README.md, CHANGELOG.md, ADRs, changesets, code comments). Where a sentence reaches for one, rewrite it instead with a comma, colon, period, parentheses, or a conjunction, whichever the sentence actually wants; never do a blind character substitution.
