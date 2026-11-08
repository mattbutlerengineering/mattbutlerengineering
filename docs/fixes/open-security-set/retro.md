---
stage: operate
run: maintenance:open-security-set
date: 2026-11-07
users-observed: 0
signal-source: "none identifiable for people. Read 2026-11-07: `gh pr list --head fix/open-security-set --state all` (PR #6185, MERGED 2026-10-10T16:02:07Z, merge commit dfae5518a); `gh issue view 6027|5369|5995|5962 --json state,createdAt,closedAt,comments`; `gh api repos/mattbutlerengineering/mattbutlerengineering/dependabot/alerts?per_page=100 --paginate` (159 alerts ever, 1 open); `gh api .../code-scanning/alerts?state=open` (4 open) and `?state=all --paginate` (115 total); `gh run list --workflow deploy-services.yml|deploy-static.yml|post-deploy-check.yml --created 2026-10-10T15:50Z..20:00Z`; `git -C $W log origin/main -- <touched paths>`; Sentry MCP `search_errors` on reservations-api, 90d, query `message:*permission denied* OR message:*row-level security* OR message:*app_reservations*` (count 0 of 96 total events in the project) and 14d on the same project/query (no results). No analytics, no per-endpoint traffic data, no request sent to the deployed `/public/v1/venues/:slug/guest-risk` route"
assumptions:
  - "Soft gate: `release.md` says 'Prepared and stopped', but `gh` shows PR #6185 merged 2026-10-10T16:02:07Z and `deploy-services.yml` / `deploy-static.yml` both succeeded on dfae5518a at 16:02:09Z. Treated as Ship-complete."
  - "`autorun-brief.md` has no Operate section and no minimum signal, so nothing is reported against one. The brief's `## Success` section is used as the intent list."
  - "Population is 0. The surfaces are a public booking-widget endpoint and a database role switch. No record shows a person using either, and a request the widget sent is the sample, not a person. The Owner's use is not recorded anywhere I read."
  - "Which CI job executes `scripts/__tests__/http-cache-semantics-override.test.mjs` was not read. `vitest.config.ts` lists `scripts/vitest.config.mjs` as a project, so root vitest includes it."
  - "`gh api .../dependabot/alerts?state=all` returned `[]` (not a valid state value), so the totals use the unfiltered, paginated call."
---

# Retro: public guest-risk disclosure, venue RLS backstop, http-cache-semantics ignore

`release.md` ends "Prepared and stopped" with the PR URL not recorded. The PR is #6185, `fix(security): hide public guest risk score and force venue RLS`, merged 2026-10-10T16:02:07Z (`dfae5518a`). It is 28 days past release. Both deploy workflows succeeded on that SHA two seconds later.

## Outcomes vs. intent

Population is 0 (frontmatter), so every outcome is `unobserved`. Each records state, not use. Intent is from `autorun-brief.md` § Success.

### A regression test fails before the #6027 change and passes after: public guest-risk JSON has no `riskScore`, and `requiresDeposit` still reflects risky vs not

- What happened: on `origin/main`, `services/reservations/src/routes/public-guest-risk.ts` sends `{ data: { requiresDeposit } }` only (lines 85, 89-93: `requiresDeposit: riskScore === "risky"`). `public-guest-risk.test.ts:57-58` asserts `"riskScore" in body.data` is false and that the raw payload does not contain the string. Staff `Guest.riskScore` is still in `packages/types/src/schemas/guest.ts:26`, as intended. The deployed route was not probed. Verify never saw the test red against the old handler (`verification.md` § Not verified), so "fails before" is claimed, not shown.
- Defect recurrence since release: none found. `git log origin/main --since=2026-10-10 -- services/reservations/src/routes/public-guest-risk.ts packages/types/src/schemas/guest.ts` shows only refactors (#6814 `fastify.services`, #6610 `venueScoped` slug resolution, #8095 win-back). No issue created after 2026-10-10 matches `guest-risk`, `riskScore` or `requiresDeposit`. The key is not back in the public body.
- Signal strength: unobserved

### #5369 has an architecture decision recorded before any FORCE or role-switch code; the app's queries are subject to the venue RLS policies

- What happened: `architecture.md` precedes the code, and the role migration (`20261009000000_create_app_reservations_role`, one `DO` block) and grant-plus-FORCE migration (`20261009000100_grant_app_reservations_and_force_rls`) are on main. `deploy-services.yml` succeeded on `dfae5518a`, so the migrations were deployed by the pipeline. Whether the live reservations process actually runs as `app_reservations` was not checked: `release.md` post-release checks were "Not run", and I did not query production. Sentry `reservations-api`, 90 days: 0 events matching `permission denied`, `row-level security` or `app_reservations`, out of 96 events in the project. That is the only runtime evidence, and it is absence on a project with little traffic. Later reservation-table migrations carry FORCE too (`f861b3954`, `ef94849d2`, `149ce059e`), so the pattern was kept.
- Signal strength: unobserved
- CI: `.github/workflows/ci.yml` `rls-integration` (line 838) runs `rls-app-reservations.integration.test.ts` and `rls-owner-enforcement.integration.test.ts` against a real Postgres, so the proof that was a local scratch run in Verify is now a CI job. Last `ci.yml` run on main (2026-11-07T20:36Z): success.

### #5995 is either overridden to a published patched version, or explicitly left open because no patch exists

- What happened: neither branch of the brief held literally. 4.3.0 exists, but Review found it does not touch the `max-stale` path, so the scoped override `"http-cache-semantics@<=4.2.0": "^4.3.0"` and the `ignoreGhsas` entry for `GHSA-ch52-4w7c-c8xp` both stand on main (`package.json:157,164`), and `pnpm-lock.yaml` resolves 4.3.0 (line 7047). Two follow-up PRs (#6195, #6260) re-tried the removal on the false premise and were closed. #5995 was then closed 2026-10-16T22:18:08Z as "Risk accepted" by Owner decision, not left open. The close comment says Dependabot / `pnpm audit` will resurface the advisory when upstream patches. Measured: Dependabot has raised no alert for this package or this GHSA (159 alerts ever, 0 for `http-cache-semantics`), and `pnpm audit` skips the GHSA by design. Neither will resurface it.
- Signal strength: unobserved

### Security alert counts versus what the run closed

- What happened: the run closed no Dependabot or code-scanning alert, because it was filed against tracker issues, not alerts. Today, Dependabot: 159 ever, 157 fixed, 1 auto-dismissed, 1 open. The open one is #173 (`deepmerge`, low, created 2026-10-27T22:51Z). It is not this run's: 17 days after release, and a different package. Code scanning: 115 ever, 4 open (#119, #125, #133, #136), none in a path this run touched. #133 (`actions/untrusted-checkout/high`, `.github/workflows/tier-classifier.yml`, created 2026-11-03) is the only `error`-level one.
- Signal strength: measured (counts), unobserved (users)

## Open debt

The run's own debt. Counts toward nothing.

- #6027, #5369, #5995, #5962: the tracker issues, all CLOSED. #6027 2026-10-10T16:02:08Z (by the merge), #5369 2026-10-10T17:03:50Z (closer not identified), #5995 2026-10-16 (risk accepted, above), #5962 2026-10-17 (excluded from this run and not its debt).
- Review minor, deploy order: the old booking widget fails open on a response without `riskScore` (a Zod parse failure is caught and returns `false`, so a risky guest sees no deposit step). Review deferred it with "deploy the widget before the API"; `release.md` repeats it as prose. No issue was filed. Current state: `deploy-static.yml` and `deploy-services.yml` both ran on `dfae5518a` at 16:02:09Z with no ordering between them, so the window was never closed by procedure. Whether it opened is not known.
- Review minor, lockfile merge: resolved. Main's lockfile carries `http-cache-semantics@4.3.0` and `package.json` still has the override and the ignore. No issue was ever needed.

## Run retrospective

- Keep: Review read the published `http-cache-semantics@4.2.0` and `@4.3.0` sources and refuted the brief's "bump removes the finding" shortcut. The 4.3.0 diff does not touch `max-stale`. Without that, `ignoreGhsas` would have been deleted and `pnpm audit` would have gone green over an open advisory. Two later PRs and a conductor batch re-made exactly that mistake, because their premise was never checked.
- Keep: the migration review caught two defects that only a real-cluster mental model finds: `CREATE ROLE` is cluster-global and not replayable, and schema-wide default privileges would have handed `app_reservations` DML on the users and agent tables.
- Keep: the RLS proof ran as a non-superuser. The first run as the container superuser failed (`rolsuper`, `rolbypassrls` true), and the failure was recorded, not worked around.
- Change: the deploy order was written down and left to a human. A public response-shape change needs either the client tolerant first or the two deploys ordered. Here both deploy workflows fired on the same push, so the written order could not be followed.
- Change: the brief's success for #5995 had two outcomes and the real one was a third (override kept, ignore kept, risk accepted). State the "neither" case when the premise is a claim about an external registry.
- Change: Release said "prepared and stopped" and never recorded the PR URL, so an Operate reader has to find the PR by branch name.
- Stop: nothing worth stopping. The three work items were proportionate.

## Environment

Sources: `verification.md` § Failures ("none") and § Not verified, `review.md` § Findings, `breakdown.md` § Notes.

| Mistake                                                                                                                                                                             | Evidence                                                                | Class      | Proposed carrier                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolving `http-cache-semantics` to 4.3.0 and deleting the ignore would have hidden an unpatched advisory                                                                           | `review.md` § Findings (first major); `breakdown.md` § Notes 2026-10-08 | mechanical | `scripts/__tests__/http-cache-semantics-override.test.mjs`, which now requires the ignore. It exists; running it in a CI job was not verified.                                                                                                                                                                                    |
| `CREATE ROLE` migration not replayable on a shared cluster (42710 on a second run)                                                                                                  | `review.md` § Findings (second major)                                   | mechanical | `.github/workflows/ci.yml` `rls-integration`, which does one `migrate deploy` on a fresh scratch database. No check replays a migration on a cluster where the role already exists, so this class is caught by a person reading it. Finding: a second `migrate deploy` against a second database in the same step would catch it. |
| Schema-wide `ALTER DEFAULT PRIVILEGES ... TO app_reservations` would grant DML on later users and agent tables                                                                      | `review.md` § Findings (third major)                                    | mechanical | `services/reservations/src/services/rls-force-coverage.test.ts` already parses the migration SQL for FORCE. A case failing on `ALTER DEFAULT PRIVILEGES` naming `app_reservations` fits there. Nothing checks it today.                                                                                                           |
| Old booking widget fails open on a response without `riskScore` when the API ships first                                                                                            | `review.md` § Findings (first minor)                                    | judgement  | `.github/workflows/deploy-static.yml` and `deploy-services.yml`: no ordering between them exists. No current carrier; it needs a decision on ordered deploys versus a tolerant client.                                                                                                                                            |
| Branch behind main on `pnpm-lock.yaml`; a merge could put 4.2.0 back                                                                                                                | `review.md` § Findings (second minor)                                   | mechanical | `scripts/__tests__/http-cache-semantics-override.test.mjs` (same test as row 1). It rejects a lockfile resolving 4.2.0. Landed correctly; main resolves 4.3.0.                                                                                                                                                                    |
| RLS proof first run as container superuser (`rolsuper`, `rolbypassrls`) failed and the connection was not subject to FORCE                                                          | `breakdown.md` § Notes 2026-10-09                                       | mechanical | `.github/workflows/ci.yml` `rls-integration` (lines 883-891): `rls-owner-enforcement.integration.test.ts` asserts the connection is the table owner with `rolsuper=false` and `rolbypassrls=false`. In place.                                                                                                                     |
| The #6027 regression test was never seen failing on the old handler; the typechecks for `packages/types`, `packages/api-client` and `apps/hospitality` and `pnpm lint` were not run | `verification.md` § Not verified                                        | judgement  | No carrier for "test fails first". The `Typecheck` and `Lint` jobs in `.github/workflows/ci.yml` cover the second half on the PR.                                                                                                                                                                                                 |

## Idea seeds

- Report the swallowed Zod parse failure in the booking widget's `fetchGuestRisk` (`apps/hospitality/src/components/booking-widget/useBookingFlow.ts`) to the hospitality Sentry project instead of returning `false` silently, then count events per day after the next public response-shape change; today a fail-open deposit step is invisible (from: maintenance:open-security-set)
- Decide how a public response-shape change deploys safely: order `deploy-static.yml` before `deploy-services.yml`, or ship the tolerant client one release earlier. Measure by whether the two workflows' start times on one SHA are still within the same minute (they were, 16:02:09Z on `dfae5518a`) (from: maintenance:open-security-set)
- Add a CI check that runs the reservations migrations a second time against a second database in the same cluster, so a cluster-global statement (`CREATE ROLE`) that fails on replay is caught by a job, not by review (from: maintenance:open-security-set)
- Add a case to `rls-force-coverage.test.ts` failing on any migration that runs `ALTER DEFAULT PRIVILEGES` for `app_reservations`, and measure by running it against the review-fixed grant migration's earlier form (from: maintenance:open-security-set)
- Verify the deployed reservations process runs as `app_reservations`: add one post-deploy assertion (`current_user` inside a request transaction) and record its result, since neither Verify nor Ship checked production (from: maintenance:open-security-set)
- Give `GHSA-ch52-4w7c-c8xp` in `package.json` `pnpm.auditConfig.ignoreGhsas` a recheck date and owner, because #5995's close comment says Dependabot or `pnpm audit` will resurface it while neither can (0 Dependabot alerts for the package, the audit skips it by design); measure the advisory's `first_patched_version` on that date (from: maintenance:open-security-set)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run.
