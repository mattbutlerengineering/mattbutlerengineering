---
stage: ship
run: maintenance:otlp-localhost-default
date: 2026-09-03
assumptions:
  - "Release authorization is taken from `autorun-brief.md` § Release authorization — merge on green via CI, no manual deploy. It is not re-confirmed here; no new authorization was sought or given during the run."
  - "`CI Gate` is treated as the only required check, per `.claude/rules/gotchas.md` § CI. Advisory checks (codecov/patch, Hospitality E2E) are not merge blockers."
  - "Completed 2026-09-09 by the autorun Ship stage with no live user. The merge (release log step 8) had already happened by hand on 2026-09-05; this stage recorded what happened rather than performing it, and opened and merged nothing."
  - "`dffa3945c` is treated as the commit that carried this release. DigitalOcean builds `main` HEAD at `create-deployment` time, not the SHA of the workflow run that called it, so the deployment the `f9ee20a05` run created reports the next merge's SHA. Accepted because `git merge-base --is-ancestor` proves `f9ee20a05` is its ancestor and the two commits are adjacent on `main`."
  - "The refutation test is judged against container-swap boundaries as well as the draft's 20.7-hour inter-burst gap, because every one of the 11 pre-fix events aligns to within 20 s of a DigitalOcean deployment going ACTIVE. That alignment was measured here for the first time and was not part of the criterion the draft set, so both readings are reported and the stricter one is not silently substituted."
surfaced:
  - "`pnpm audit --audit-level=high` never ran locally (three socket timeouts to npm's audit endpoint). CI runs it inside `pnpm repo-audit`, so the gate is not skipped overall — but it was not independently confirmed before the merge decision."
  - "Which of the three OTLP exporters actually produced the production events is unresolvable, because all three close in the same branch. Post-deploy silence cannot attribute; it can only refute."
  - "Step 8 deviated from the plan. The PR was merged directly, not via `gh pr merge --auto`: the issue timeline carries no `auto_merge_enabled` event, only `merged` / `closed` / `head_ref_deleted` at 2026-09-05T04:53:57Z, 24 h 32 min after `CI Gate` went green. The gate the brief required (`CI Gate` success before merge) was satisfied, so this is a record deviation, not an authorization breach. Who pressed merge is not recorded here."
  - "The boot notice from the 2026-09-05 deployment itself is unrecoverable. `doctl apps logs <app> <component> --type run` returns only the current deployment's process output (13, 23 and 14 lines for the three services, all from 2026-09-09T21:32Z onward). The notice is proven on today's ACTIVE deployment, whose commit contains `f9ee20a05` — not on the deployment that first shipped it."
  - "The three Sentry issues (`RESERVATIONS-API-7`, `AGENT-API-8`, `USERS-API-7`) are still `unresolved` with 11 events between them. Nothing in this run resolves them — the brief authorizes no tracker interaction and Sentry state was not treated as an exception to that. Left for Operate or a human; resolving them would also arm Sentry's regression detection on exactly this signature."
  - "Deploy-boundary alignment is a new finding about the mechanism. 11 of 11 events sit within 20 s of a container swap; 6 of 6 Sentry-observable pre-fix swaps produced a burst; 0 of 10 post-fix swaps did. The final burst came entirely from the outgoing pre-fix processes (`app_start_time` 2026-09-04T22:05Z); the first burst, per `defect.md`, came from one 56-second-old process and one 40-minute-old process. That points at the swap itself — shutdown flush and/or first export after ingress cut-over — not at a 30-second tick or per-request log traffic. Recorded as evidence here; interpretation belongs to Operate."
  - "Two `deploy-services.yml` runs raced on 2026-09-05 (`33945783241` for `f9ee20a05` at 04:54:00Z, `33945822458` for `dffa3945c` at 04:54:55Z) and each created its own DigitalOcean deployment of the same commit (`be2ca73a`, then `c347e4e7` superseding it nine minutes later). Pre-existing behaviour of the deploy workflow, not caused by this run; noted because a naive reading of the deployment list would misattribute the second one."
---

# Release: stop three OTLP exporters defaulting to localhost:4318

## Pre-flight

- [x] **Verification green.** `verification.md` passes, with an appended
      amendment recording the Review finding and the re-verification. No
      unresolved failures. Gates after the review fixes: 8 test files /
      124 tests passed, `tsc --noEmit` exit 0, `eslint src/` exit 0,
      `pnpm regen --check` "All generated artifacts are up to date",
      `git status --short` clean.
- [x] **No secrets in diff.** Scanned all added lines across the 16 changed
      files for `sk_live`/`pk_live`/`rk_live`, `AKIA`/`ASIA`, PEM private-key
      headers, JWTs, and inline password/secret assignments — no matches. The
      boot notice is structurally incapable of printing a value: `reason`
      interpolates only module-level key-name constants, enforced by a
      sentinel-value test.
- [x] **Target config present.** Nothing new is required in the target
      environment. The change makes the _absence_ of `OTEL_EXPORTER_OTLP_*`
      the safe path, which is exactly production's current state. The two
      signal-specific keys added to `PLATFORM_VARS` are pre-registered, not
      required.
- [x] **Migrations/data changes.** None. No Prisma schema, no migration SQL,
      no data backfill. Confirmed by path scan of the diff.
- [x] **Rollback plan concrete.** Below.

**Re-confirmed 2026-09-09**, before completing this record: `review.md` still
carries one critical finding and it is marked fixed in-branch (`547238ef8`);
no unfixed critical exists. `verification.md`'s amended verdict is still
Pass. Neither file changed between the draft and the merge —
`git diff --stat 7c0f4e7e0 origin/main -- docs/fixes/otlp-localhost-default/`
is empty.

## Rollback plan

```bash
# 1. Find the squash commit on main
git log --oneline -5 origin/main

# 2. Revert it and push (branch first if protection requires)
git revert --no-edit <squash-sha>
git push origin main
```

Reverting restores the previous behaviour exactly: three OTLP exporters
pointed at `http://localhost:4318`, which is production's state today. There
is no migration to unwind, no external system to notify, no published
artifact to yank, and no configuration to restore — the change is confined to
one package's SDK construction plus one scanner allowlist. Deploy happens
through GitHub Actions on merge to `main`, so the revert redeploys by the same
path with no manual `doctl`/`wrangler` step.

**Rollback trigger:** any service failing to boot after deploy, or a new error
signature replacing the `AggregateError`. Note that the boot notice makes this
diagnosable for the first time — `[telemetry] mode=…` appears in the logs of
every service on every boot.

The squash commit turned out to be `f9ee20a0569386fe406b387e608ca5e748e90943`.
Neither trigger fired (see Post-release checks); the plan was not run.

## Release log

1. Review findings fixed in-branch rather than deferred →
   `547238ef8` (logs signal), `190a9646c` (root llms regen).
2. `docs/fixes/otlp-localhost-default/review.md` written, `verification.md`
   amended → `3bb05414e`.
3. `docs/backlog.md` seed claimed in place with
   `(claimed: maintenance:otlp-localhost-default)` → `7c0f4e7e0`.
   Deferred from Capture to Ship deliberately, so the claim lands with the
   fix rather than marking a seed a run might not finish.
4. `git push origin fix/otlp-localhost-default` → landed. Verified by SHA
   comparison rather than by exit code (a piped push masks its status):
   `local == remote == 7c0f4e7e0db923f80438ad95731023613ee5d360`, confirmed
   against `git ls-remote` as well as the cached ref.
5. `gh pr create` → **PR #4969**.
6. CI dispatched automatically on the `pull_request` event — run
   `33835604992` on head `7c0f4e7e0`. Confirmed the run exists rather than
   inferring green from an absence of failures: a missing `CI Gate` is a real
   observed state in this repo and is indistinguishable from success under a
   naive check. This PR is authored by `mattbutlerengineering`, not
   `GITHUB_TOKEN`, so the anti-recursion trap does not apply.
7. `CI Gate` conclusion → **SUCCESS**. Read back 2026-09-09 from
   `gh pr view 4969 --json statusCheckRollup` (the head branch is deleted, so
   `gh run list --branch` cannot see it): the `CI Gate` check run on run
   `33835604992` is `status: COMPLETED, conclusion: SUCCESS, completedAt:
2026-09-04T04:22:03Z`, and the commit **status** of the same name (the
   rollup-visible one from #4025) is `state: SUCCESS` at `04:22:01Z`. The
   rollup holds 37 entries: 31 `SUCCESS`, 5 `SKIPPED` by design (Dependabot
   auto-merge, RCA loop, Accessibility AI Attribution, Report CI Health) or
   `NEUTRAL` (Trivy), 0 failed. Advisory `codecov/patch` was also `SUCCESS`.
8. Merge → **MERGED 2026-09-05T04:53:57Z**, `mergeCommit.oid`
   `f9ee20a0569386fe406b387e608ca5e748e90943` (single parent — a squash),
   `mergedBy: mattbutlerengineering` (`is_bot: false`), head ref deleted at
   `04:53:58Z`. **Not via `--auto` as planned.** The issue timeline
   (`gh api …/issues/4969/timeline`) contains no `auto_merge_enabled` event,
   only `merged`, `closed` and `head_ref_deleted`, all by
   `mattbutlerengineering`; and the merge landed 24 h 32 min after the gate
   went green, which an armed auto-merge would not have waited for. The
   brief's condition — `CI Gate` success before merge — held. Recorded in
   `surfaced:` as a deviation from the plan, not a breach of it.
9. Deploy (added 2026-09-09) → `deploy-services.yml` run `33945783241`,
   `headBranch: main`, `headSha: f9ee20a05…`, created `04:54:00Z`, concluded
   `success` at `05:14:47Z`. Jobs: Circuit Breaker Check success; Wait for CI
   success (`05:07:15Z`); Deploy Blocked skipped; Deploy API Services
   success (`05:07:18Z → 05:14:30Z`); Post-Deploy Verification success
   (`05:14:37Z`); Report Deploy Health success.

## Post-release checks

All run 2026-09-09 (local, PDT) by the autorun Ship stage. Every timestamp
below is UTC, and the UTC clock had already rolled to `2026-09-10T00:24Z`
when the probes ran.

- **DigitalOcean deployment that carried the merge — Phase and Cause, not
  just a health code.** `doctl apps get-deployment 5dbdcf45-… be2ca73a-…`:

  ```
  id            be2ca73a-3e8b-418c-8d35-64d01dd998de
  cause         manual                       # doctl create-deployment from the run above
  created_at    2026-09-05T05:07:32Z         # 14 s into "Deploy API Services"
  progress      success_steps 21 / total_steps 21, error_steps null
  phase         SUPERSEDED (phase_last_updated_at 2026-09-05T05:23:59Z)
  source_commit_hash  dffa3945c1ff43adca7d7e6fded95968bc40185c  (identical on users-api, reservations-api, agent-api)
  ```

  It went **ACTIVE at 05:14:23Z** — the instant its predecessor `3d4ce346`
  flipped to `SUPERSEDED` — seven seconds before the workflow's deploy job
  completed, and stayed active until `c347e4e7` (created `05:18:49Z`, also
  21/21, also `dffa3945c`) replaced it at `05:23:59Z`. `SUPERSEDED` is the
  expected terminal phase of a deployment that succeeded and was later
  replaced; an unsuccessful one reads `ERROR` or `CANCELED`, as the 2026-09-02
  entries in the same list do.

  The commit is one merge _after_ the squash, because DigitalOcean built
  `main` HEAD at `create-deployment` time and PR #5009 had merged 55 s behind
  this one. Proven to contain the fix rather than assumed:

  ```
  $ git merge-base --is-ancestor f9ee20a05… dffa3945c…   → f9ee20a05 IS ancestor of dffa3945c
  dffa3945c 2026-09-04T21:54:52-07:00 fix(reservations): scope floor-plan table writes to the owning venue (#5009)
  f9ee20a05 2026-09-04T21:53:56-07:00 fix(observability): stop three OTLP exporters defaulting to localhost:4318 in production
  ```

- **What is running now.** ACTIVE deployment at check time is `e9e2c38b`
  (created `2026-09-09T21:27:33Z`, ACTIVE `21:33:28Z`, 21/21,
  `source_commit_hash 65fcd2deb`), and `65fcd2deb` is `origin/main` HEAD,
  of which `f9ee20a05` is an ancestor (`git merge-base --is-ancestor` → true).
  Ten manual deployments have gone ACTIVE since the fix first did; every one
  of them carried it.

- **Boot notice — first-ever evidence the fix is live.**
  `doctl apps logs 5dbdcf45-… <component> --type run | grep telemetry`, all
  three services, one match each, and it is the first line of each log:

  ```
  users-api        2026-09-09T21:32:54.165Z [telemetry] mode=unconfigured — no OTLP destination — OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT and OTEL_EXPORTER_OTLP_METRICS_ENDPOINT are all unset
  reservations-api 2026-09-09T21:32:56.729Z [telemetry] mode=unconfigured — no OTLP destination — OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT and OTEL_EXPORTER_OTLP_METRICS_ENDPOINT are all unset
  agent-api        2026-09-09T21:33:06.734Z [telemetry] mode=unconfigured — no OTLP destination — OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT and OTEL_EXPORTER_OTLP_METRICS_ENDPOINT are all unset
  ```

  These are the boots of deployment `e9e2c38b`, 5–12 s before it went ACTIVE.
  The mode is `unconfigured`, which is the state this run exists to make
  inert, and the reason names keys only — no value printed, as designed.
  **Honest limit:** DigitalOcean's run log holds only the current
  deployment's output (13 / 23 / 14 lines, nothing before `21:32:54Z`), so the
  boot line from the 2026-09-05 deployment itself has rotated away and is not
  claimed. What is proven is that the code running in production today emits
  it, on all three services.

- **Live probe.**
  `curl -s -o /dev/null -w '%{http_code}\n' https://api.mattbutlerengineering.com/api/v1/users/health`
  → `200` at `2026-09-10T00:24:53Z`. Body: `"status":"ok"`, `database` ok
  (latency 9 ms, a real `$queryRaw`), `auth0` ok (12 ms), `slow_queries` ok,
  `rate_limits` ok, `pool` ok, `error_rates.degraded: false`. This is the DB-
  backed endpoint, not the liveness-only `/health`.

- **Refutation test — the honest one.** Re-ran
  `search_events(dataset="errors", query="error.type:AggregateError", period="7d")`
  against org `mattbutlerengineering` via the Sentry MCP tools. Result:
  **9 events** in the window, sorted newest first:

  | Timestamp (UTC)          | Issue                | Relation to the fix                                         |
  | ------------------------ | -------------------- | ----------------------------------------------------------- |
  | `2026-09-05T05:14:40.5Z` | `RESERVATIONS-API-7` | outgoing pre-fix process (`app_start_time` 09-04T22:05:38Z) |
  | `2026-09-05T05:14:37.5Z` | `AGENT-API-8`        | outgoing pre-fix process (`app_start_time` 09-04T22:05:46Z) |
  | `2026-09-05T05:14:30.8Z` | `USERS-API-7`        | outgoing pre-fix process (`app_start_time` 09-04T22:05:35Z) |
  | `2026-09-04T22:06:32Z`   | `AGENT-API-8`        | pre-fix                                                     |
  | `2026-09-04T15:40:37Z`   | `RESERVATIONS-API-7` | pre-fix                                                     |
  | `2026-09-03T21:14:41Z`   | `AGENT-API-8`        | pre-fix (baseline)                                          |
  | `2026-09-03T21:14:22Z`   | `RESERVATIONS-API-7` | pre-fix (baseline)                                          |
  | `2026-09-03T21:14:20Z`   | `USERS-API-7`        | pre-fix (baseline)                                          |
  | `2026-09-03T00:33:37Z`   | `RESERVATIONS-API-7` | pre-fix (baseline)                                          |

  The 7-day window opens at about `2026-09-03T00:25Z`, so the two
  `2026-09-02T23:19:32Z` baseline events fall outside it; the per-issue totals
  (`search_issues` → 5 + 4 + 2 = **11** all-time) reconcile with 9 in-window
  plus those two. Against the draft's baseline of 6 events, **5 more arrived
  before the fix was live** and **0 after**.

  The three newest are the decisive ones. They fired 7–17 s after the fixed
  deployment `be2ca73a` went ACTIVE at `05:14:23Z`, and each event's
  `app.app_start_time` (read with `get_sentry_resource` on the issue's latest
  event) is `2026-09-04T22:05:3x–4xZ` — processes born with deployment
  `3d4ce346` (created `22:00:02Z`, ACTIVE `22:06:18Z`, pre-fix commit
  `bc4ac5125`). Those are the containers being torn down at the swap, not the
  new ones. **Count since `2026-09-05T05:15:00Z`: 0. Count from any process
  running the fix: 0.** A free-text `4318` search over the same 7 days
  returned no results, so no differently-grouped ECONNREFUSED signature is
  hiding behind a new `error.type` either.

  Judged the way the draft said to: the last event is `05:14:40Z` on
  2026-09-05 and the query ran at `00:25Z` on 2026-09-10 — **115 h 10 min of
  silence, 5.6× the 20.7-hour inter-burst gap.** Judged a stricter way the
  data suggested only now — every one of the 11 events lies within 20 s of a
  DigitalOcean deployment going ACTIVE (offsets −12 s to +17 s across six
  swaps: `23:19:18Z` 09-02, `00:33:24Z` and `21:14:32Z` 09-03, `15:40:30Z`
  and `22:06:18Z` 09-04, `05:14:23Z` 09-05) — **6 of 6 Sentry-observable
  pre-fix swaps produced a burst; 0 of the 10 post-fix swaps did**
  (`c347e4e7`, `8df5ce11`, `bb7065cb`, `a8af6753`, `07b7a0e4`, `253bb494`,
  `1a366e97`, `ffae6374`, `242a7614`, `e9e2c38b`, from `05:23:59Z` 09-05 to
  `21:33:28Z` 09-09). Continued events of the same shape would have refuted
  the root-cause hypothesis; their absence across ten of the exact boundary
  that previously fired every time is consistent with it, and stronger than
  wall-clock silence alone. It still does not prove it.

- **Rollback-trigger sweep — no new signature.**
  `search_issues(query="firstSeen:-5d")` → 10 issues, all on `users-api`, all
  `HTTP 429: GET /<scanner path>` (`/.claude/.credentials.json`, `/.auth.json`,
  `/actuator/env`, `/graphql`, …), 1 event each, first seen one day ago:
  rate-limited vulnerability-scanner traffic being reported as it should be,
  unrelated to telemetry. No service failed to boot (three consecutive
  21/21 deployments, `Post-Deploy Verification` success). Neither trigger in
  the rollback plan fired.

- **What cannot be checked.** The `exporting` path has never run against a
  real collector, because none exists yet. That path is verified structurally
  only, and nothing since the merge has changed that.

## Outcome

_Completed 2026-09-09 by the autorun Ship stage; the draft above was written
2026-09-03 with CI in flight and its "see Outcome" steps are now filled from
real results._

**Shipped cleanly, with one hiccup in the record: the merge was done by hand
rather than via `--auto`.** The gate it was supposed to wait for had been
green for a day; nothing was bypassed.

Proven, each by a command quoted above:

- PR #4969 passed `CI Gate` (`2026-09-04T04:22:03Z`) and merged as squash
  `f9ee20a05` on 2026-09-05T04:53:57Z.
- `deploy-services.yml` run `33945783241` deployed it: DigitalOcean deployment
  `be2ca73a`, 21/21 steps, ACTIVE at `05:14:23Z`, built from `dffa3945c`,
  which contains `f9ee20a05`.
- The fix is running in production today on all three services — the boot
  notice `[telemetry] mode=unconfigured` is the first line of every service's
  current log, from a deployment whose commit contains the squash — and the
  DB-backed health endpoint answers `200 / status: ok`.
- No process running the fix has emitted the `AggregateError`, or anything
  mentioning port 4318, in 4 d 19 h and across ten container swaps. The last
  three events came from the pre-fix containers as they were replaced.

Consistent-with only — stated so the next stage does not inherit it as fact:

- That the three OTLP exporters _were_ the source of the production events.
  The refutation test passed; a passed refutation test is not attribution,
  and which exporter it was is permanently unresolvable (all three closed
  together).
- That the `exporting` mode works. It has never met a collector.

Not done here, deliberately: the three Sentry issues remain `unresolved`, and
the deploy-boundary alignment is handed to Operate as evidence rather than
interpreted. Next stage is Operate.
