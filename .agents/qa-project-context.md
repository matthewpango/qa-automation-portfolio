# QA Project Context: ParcelQuote

Updated: 2026-11-09. Sources are repository files and the confirmed conversation.
team_maturity: startup (scope of a small learning project, not a claim about a company).

## Product

Russian-language intercity parcel price calculator for a QA Automation Engineer portfolio.
User chooses two of ten cities, enters weight/dimensions and selects delivery options.
The server resolves fictional distances; identical cities are rejected.
Critical journeys: valid quote, option changes, invalid input, forbidden route,
parameter changes while waiting, network failure and recovery, keyboard use.
Requirements: README.md and docs/superpowers/specs/2026-11-09-intercity-routes.md.

## Tech Stack

- Backend: Node.js 24+, TypeScript, REST/JSON, Fastify 5.12.8 installed.
- Frontend: native HTML/CSS/JavaScript in public/, served by the same app.
- Storage: none; cities/distances and tariffs are local JSON configuration.
- Runtime: Dockerfile and compose.yaml, non-root app user, local port 3000. Dockerfile.tests supplies Node24, Playwright1.65.0 and Chromium for the tests service.
- No external business APIs, accounts, credentials, database or monorepo.
- Version evidence: installed package metadata, package.json and package-lock.json.

## Test Stack

- node:test: tests/quote.test.ts and tests/routes.test.ts (6 unit cases).
- node:test + Fastify.inject: tests/app.test.ts (2 internal integration cases: 500 and tariff configuration).
- Playwright 1.65.0 installed: tests/api/*.spec.ts (63 HTTP API cases), tests/ui.spec.ts (11 browser cases), playwright.config.ts.
- Projects: api (request fixture, no browser) and chromium (UI). BASE_URL selects an existing server; otherwise Playwright starts Node on port 3100.
- npm test passed 2026-11-09 locally and against Docker: 6 unit, 2 internal integration, 63 HTTP API, 11 UI tests; total 82.
- Reporters: list + HTML (playwright-report/) + allure-playwright 3.14.0 with Allure 3.33.0. Trace and screenshot retained on failure. Failure exit code and artifacts verified with deliberate faults in an isolated copy. HTTP suite verified against Docker at http://127.0.0.1:3000.
- TypeScript 7.0.2 installed; typecheck is tsc --noEmit.
- ESLint 10.14.0 + eslint-plugin-playwright 2.12.2: npm run lint checks tests/**/*.spec.ts and tests/api/**/*.ts, with flat recommended and strict no-wait-for-timeout/no-force-option/no-element-handle/no-page-pause. Warnings fail. expectQuote/expectErrors are registered assertion helpers. Babel parser parses TS syntax without type analysis because typescript-eslint does not support TS7; tsc checks types separately.
- Linux compatibility: all 82 checks passed in isolated Linux with Node24.22.2 and Playwright1.65.0 against the Docker app. This does not establish a real GitHub Actions run.

## CI/CD

Workflow .github/workflows/tests.yml exists and passes actionlint locally. All automated checks run INSIDE the tests Compose service, never directly on the runner. No setup-node, npm ci or browser install on the host; build and run Dockerfile.tests instead. Branch pushes run workflow lint + ESLint + type/unit/internal integration checks; PR, default-branch push and manual runs also build Docker and run API/UI. Artifacts retained 14 days; cleanup runs always. No retries or sharding. GitHub execution and required status checks are NOT verified: repository has no remote.

## Environments

- Local Docker demo: http://127.0.0.1:3000.
- Primary test command: docker compose --profile test run --build --rm tests. Internal app URL: http://web:3000; depends_on requires healthy app.
- Reports bind-mounted to host playwright-report/, test-results/ and allure/. Allure covers 74 Playwright tests; eight node:test checks remain in logs. Allure run generates reports even on failure and preserves exit code. History: allure/history.jsonl, CI cache per ref. Two genuine full runs and an isolated failure verified; viewer on port 8080 verified in container Chromium. Container exit=1 and host HTML/trace/screenshot verified with a deliberately failing test. Container report viewer verified on host port 9323.
- Automated tests, including focused/debug runs, must execute through the tests container. No native test execution is part of the supported workflow.
- Production and staging: none established. No deployment service identified.
- Network failures/delays are controlled with browser routes; normal quotes use real API.

## Quality Goals

The user wants demonstrable automation knowledge, reproducible Docker execution,
then CI/CD and reporting. Numeric targets, coverage baselines and schedules were
not agreed. Proposed targets and their status are in docs/qa-strategy.md.

## Risk Areas

| Area | Evidence / concern | Assessment |
|---|---|---|
| Pricing and precision | Branches in quote.ts, prior precision regression fixed | Proposed high risk; scores in strategy |
| Route and API validation | Recent city migration, client distance forbidden | Proposed high risk; scores in strategy |
| Async form state | Revision counter, network recovery and input changes | Proposed high risk; scores in strategy |

No production incident history, measured flakiness or coverage percentage is available.

## Team

Project owner is a QA Automation Engineer using TypeScript and Playwright.
Team size, roles beyond owner, budget, release cadence and deadlines: not specified.

## Conventions

- node:test: tests/*.test.ts; API Playwright: tests/api/*.spec.ts; UI: tests/ui.spec.ts.
- Prefer getByRole/getByLabel with exact names; use existing test IDs for results.
- No fixed sleeps. Fresh browser context per test, parallel execution.
- Deterministic small fixtures, literal price expectations independent of product helpers.
- Temporary configuration copies under ignored work/, never modify shared live data.
- Public API checks migrated from inject after equivalent HTTP coverage passed; keep internal 500/config tests. No new framework or dependency added.
- Russian product/docs; code identifiers in English. No em dash in repository prose.
- Local Markdown issue workflow: docs/agents/issue-tracker.md.
- Strategy: docs/qa-strategy.md; traceability: docs/qa-coverage-matrix.md.
