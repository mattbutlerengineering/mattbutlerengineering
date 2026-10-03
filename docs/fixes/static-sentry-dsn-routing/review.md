---
stage: review
run: maintenance:static-sentry-dsn-routing
date: 2026-10-02
head: 403c10d98
assumptions:
  - "Severity arbitration came from autorun-brief.md and the orchestrator's five adjudication questions. No live user arbitrated. Majors would have been fixed in-stage (the skill's default). None were found, so nothing needed a defer decision from the user."
  - "Maintenance run, patch-sized diff: a lighter pass per the protocol's Run scale section. The regression test Verify ran (deploy-static-sentry-env.test.mjs, 4 of 10 failing on origin/main and 10 of 10 passing on the branch) is the floor. Review did not re-run it beyond what the reviewer subagent chose to run."
  - "docs/standards.json does not exist in this repo, so no finding cites a standard."
---

# Review: marketing and rialto-web report to the hospitality Sentry project

## Scope

`git diff origin/main...HEAD` on `fix/static-sentry-dsn-routing` (PR #5990), commits
`1e3a3ac9f`, `012a8ee37`, `b7963864b` and `403c10d98`:

- `.github/workflows/deploy-static.yml`: per-app DSN and project for marketing and
  rialto-web, plus a `Require deploy secrets` guard step in both jobs.
- `scripts/__tests__/deploy-static-sentry-env.test.mjs`: routing and guard assertions.
- `scripts/check-workflow-paths-coverage.mjs`: one new ALLOWLIST entry.
- `docs/backlog.md`: one seed, the hospitality CSP `eval` issue. It is out of scope and
  carried from Capture.
- Run docs.

Read alongside the diff:

- the full `deploy-static.yml` job graph (`detect-changes`, `verify`, `rollback`,
  `report-health`)
- `circuit-breaker.yml`
- `apps/{marketing,rialto-web,hospitality}/vite.config.ts`
- `infrastructure/worker/csp.js`
- `scripts/sentry-heartbeat-targets.mjs`
- `scripts/require-deploy-secrets.mjs`

## Adjudicated questions

1. **Does the guard create a deploy-ordering hazard?** Yes, and it is bounded. It is
   recorded below as Minor 1.
   - **Measured:** `gh secret list` on 2026-10-02 shows no `VITE_SENTRY_DSN_MBE`.
   - **What fails if the secret is missing:** after merge, every `deploy-static` run
     fails `deploy-marketing` and `deploy-rialto-web` at the guard step. That includes
     runs triggered by other PRs that touch `apps/marketing/**`, `apps/rialto-web/**`
     or `packages/rialto/**`, and any dispatch.
   - **Hospitality is not affected.** `deploy-hospitality` has `needs: detect-changes`
     only, so it still builds and deploys. `verify` runs whenever any deploy job
     succeeds, and it passes, because the old marketing and rialto-web workers still
     answer 200. `rollback` needs `verify` to fail, so it does not fire.
   - **The circuit breaker stays closed.** `circuit-breaker.yml` triggers on
     `workflow_run` of `Deploy Services` only.
   - **Visible effect:** `report-health` writes `deploy/static = failure`. The failure
     is loud and confined to two apps that would otherwise have shipped a Sentry SDK
     that reports nothing. That is the design intent.
2. **Does sentryVitePlugin pick up the new project?** Yes.
   - All three `vite.config.ts` files pass `project: process.env.SENTRY_PROJECT`, and
     the workflow sets that variable in the build step's `env:`. The literal
     `mattbutlerengineering` therefore reaches the plugin unchanged.
   - `org` is still `secrets.SENTRY_ORG`, the same org the heartbeat uses
     (`scripts/sentry-heartbeat.mjs:489`).
   - Release: plugin `^5.4.0` derives the release name from the git SHA and injects
     debug IDs. Symbolication does not depend on the release, and Sentry releases are
     org-scoped. A shared SHA release across two projects is valid.
   - No marketing or rialto-web upload still points at `secrets.SENTRY_PROJECT`.
     Hospitality keeps it, and that is correct.
   - The one unmeasured link, the auth token's access to the new project, is Minor 3.
3. **Does the edge CSP allow the new project's ingest host?** Yes. This was measured.
   - Sentry MCP `find_dsns` for `mattbutlerengineering/mattbutlerengineering` returns
     key `3eb05100…`, host `o4510650299842560.ingest.us.sentry.io` and project
     `4511154257526784`.
   - `infrastructure/worker/csp.js:44` sets `SENTRY_INGEST_ORIGIN` to
     `https://o4510650299842560.ingest.us.sentry.io`, and line 58 puts it in
     `connect-src`.
   - The origin is identical, so this is not a critical finding.
4. **The ALLOWLIST entry cites defect.md, not a backlog seed.** This is recorded as
   Minor 2.
5. **Does the heartbeat registry already expect this?** Yes, and it needs no change.
   - `scripts/sentry-heartbeat-targets.mjs` maps `marketing` and `rialto-web` to
     project `mattbutlerengineering`, and `hospitality` to `hospitality`.
   - The diff does not touch that file.

## Findings

No critical or major findings.

### Minor 1: once merged, `deploy-marketing` and `deploy-rialto-web` hard-fail until `VITE_SENTRY_DSN_MBE` exists

- **Scenario:** the PR merges before the secret is created. Next, a PR touching
  `packages/rialto/**` merges and its push triggers `deploy-static`. Marketing and
  rialto-web content changes then do not ship: both jobs exit 1 at `Require deploy
secrets`, and `deploy/static` reports `failure`. Hospitality deploys normally. Nothing
  rolls back and the breaker does not trip (see question 1).
- **Standard:** none.
- **Decision:** accepted with no code change. This is a Ship precondition: create the
  secret with `gh secret set VITE_SENTRY_DSN_MBE --body …` **before** merging. Ship
  already orders it that way (defect.md, release-side step 1). Failing loudly is the
  point of the guard. The alternative, an inert SDK, is the defect class this run
  closes.

### Minor 2: the new ALLOWLIST entry cites a run artifact rather than a `docs/backlog.md` seed

- **Scenario / decayed contract:** the header at
  `scripts/check-workflow-paths-coverage.mjs:74-76` says each entry is "a debt with
  paperwork" via a backlog seed. The new `deploy-static.yml` entry cites
  `docs/fixes/static-sentry-dsn-routing/defect.md` instead. It has no behavioral
  effect, and the check passes.
- **Standard:** none.
- **Decision:** deferred.
  - **Precedent:** the existing `deploy-services.yml` entry for the same script cites
    `docs/fixes/backend-observability-blackout/breakdown.md`. The new entry matches
    that precedent.
  - **No real debt:** the gap is not an unwatched surface. Both
    `deploy-static-sentry-env.test.mjs` and `require-deploy-secrets.test.mjs` run on
    every PR, so a backlog seed would record debt that does not exist.
  - **Follow-up:** if anyone wants the header and the two entries reconciled, the
    header wording should change, not these entries.

### Minor 3: source-map upload to `mattbutlerengineering` is unverified

- **Scenario:** the `SENTRY_AUTH_TOKEN` value is masked, and its scope was not
  measured. If the token cannot write releases or artifacts to the
  `mattbutlerengineering` project, the upload fails. sentryVitePlugin does not fail the
  build by default, so events arrive with minified stack traces. This would be quiet
  but not blind: the heartbeat still passes.
- **Standard:** none.
- **Decision:** deferred to the existing "confirm source maps upload" backlog seed, as
  defect.md Notes already scopes it.
  - **Cheap check for Ship:** read the `pnpm build --filter=@mbe/marketing` step log of
    the post-merge dispatch for the plugin's upload or error lines.

## Passes with no findings

- **Correctness:**
  - The guard runs after checkout and before `pnpm/action-setup`.
    `require-deploy-secrets.mjs` imports only `node:url`, so the runner's preinstalled
    Node is enough.
  - `set -euo pipefail` is present.
  - `envValue` and `runsSecretGuard` skip comment lines. They match the key by exact
    equality and never build a regex from it.
  - `jobBlock` scopes the guard assertion to each job, so one job's guard cannot
    satisfy the other.
- **Design:**
  - The diff mirrors the `deploy-services.yml` guard pattern.
  - The hospitality job has no hunk.
  - The project slug is a literal rather than a secret, consistent with the literal org
    slug in `sentry-heartbeat.mjs`.
- **Security:**
  - The DSN stays in a secret. A DSN is semi-public, since it ships in the bundle, but
    it is still not committed.
  - The guard checks presence only and never echoes the value.
  - No new permissions or tokens.

## Reviewer subagent

The repo `reviewer` subagent ran on 2026-10-02 against head `403c10d98`, with defect.md
work items 1–4 as its acceptance criteria. It used its own scratch dir,
`scratchpad/review-5990-reviewer-a7f3/`.

- **Verdict:** PASS. **Score:** 9/10. **Issues:** none.
- **Criteria:** all four acceptance criteria were met, with file and line evidence.
- **Commands it ran:**
  - `node scripts/check-workflow-paths-coverage.mjs` → PASS.
  - `deploy-static-sentry-env`, `check-workflow-paths-coverage` and
    `require-deploy-secrets` tests → 46/46 passed.
- **References and tests:** no hallucinated references and no weakened tests.
- **Merge precondition it raised:** the `VITE_SENTRY_DSN_MBE` secret does not exist
  yet, so nothing should merge or arm `--auto` until it is created. This is the same
  point as Minor 1.

## Verdict

**Ready to ship.** No critical or major findings, and none of the three minors blocks.

The one hard precondition belongs to Ship: create `VITE_SENTRY_DSN_MBE` (DSN
`https://3eb05100…@o4510650299842560.ingest.us.sentry.io/4511154257526784`, from Sentry
project `mattbutlerengineering`) with `gh secret set … --body` **before** merging.
Then dispatch `deploy-static.yml`, then dispatch `sentry-heartbeat.yml`.

CI Gate is red only because of the external basic-ftp `pnpm audit` advisory (#5966).
That is not a finding against this change.
