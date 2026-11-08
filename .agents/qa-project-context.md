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
- Runtime: Dockerfile and compose.yaml, non-root node user, local port 3000.
- No external business APIs, accounts, credentials, database or monorepo.
- Version evidence: installed package metadata, package.json and package-lock.json.

## Test Stack

- node:test: tests/quote.test.ts and tests/routes.test.ts (6 unit cases).
- node:test + Fastify.inject: tests/api.test.ts (34 integration cases, not real HTTP).
- Playwright 1.65.0 installed: tests/ui.spec.ts, playwright.config.ts, 6 browser cases.
- Browser: Chromium. UI config starts a local Node server at port 3100.
- npm test passed 2026-11-09: 40 server tests and 6 browser tests.
- Reporter: list; trace retained on failure. No persistent HTTP API suite against Docker.
- TypeScript 7.0.2 installed; typecheck is tsc --noEmit.

## CI/CD

No workflow or enforced CI gates found. GitHub Actions and HTML reports are proposed
next steps in docs/qa-strategy.md, not existing infrastructure. No sharding.

## Environments

- Local Docker demo: http://127.0.0.1:3000.
- Local Playwright-managed server: http://127.0.0.1:3100.
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

- Existing node:test files: tests/*.test.ts; browser suite: tests/ui.spec.ts.
- Prefer getByRole/getByLabel with exact names; use existing test IDs for results.
- No fixed sleeps. Fresh browser context per test, parallel execution.
- Deterministic small fixtures, literal price expectations independent of product helpers.
- Temporary configuration copies under ignored work/, never modify shared live data.
- Preserve current tests before considering a migration. No new framework selected.
- Russian product/docs; code identifiers in English. No em dash in repository prose.
- Local Markdown issue workflow: docs/agents/issue-tracker.md.
- Strategy: docs/qa-strategy.md; traceability: docs/qa-coverage-matrix.md.
