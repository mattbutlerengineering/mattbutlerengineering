---
stage: ship
run: maintenance:browser-sentry-env-release
date: 2026-10-04
assumptions:
  - "Scale: maintenance run, single squash merge plus one CI deploy dispatch. Per the protocol's Run scale section this is the light pre-flight: verification, review, secrets and backend-diff checks, with no migrations."
  - "Release authorization is the brief's (Matt, 2026-10-04): squash-merge once the reviewer passed, CI Gate was green on the final head and no critical was open; dispatch deploy-static.yml; read Sentry; dispatch sentry-heartbeat.yml once. No step went beyond it."
  - "Re-running the failed Deploy Marketing job once is inside the authorization. It is the same deploy-static.yml dispatch, and the failure was a runner DNS miss on us.sentry.io, not anything the diff touches. The rerun was the only retry; a second failure would have stopped the run."
  - 'Visual Regression (hospitality) and Visual Regression (rialto-web) were red on the PR head. Both are advisory (required contexts on main are ["CI Gate"] only), and both fail the same way on main, so Ship did not block on them.'
  - "Sentry project inbound filters could not be read: the Sentry MCP exposes no inbound-filter tool, and there is no local SENTRY_AUTH_TOKEN. They are recorded as unmeasured. Indirect evidence: all three production browser heartbeat events were accepted and stored."
---

# Release: browser Sentry events report the real environment and release

## Pre-flight

- [x] **Verification green.** `verification.md` has 8 PASS, 0 FAIL, and 1 PENDING. The pending item is the live-event proof, which can only happen after deploy; it is settled under Post-release checks below. `review.md` scored it 9/10 PASS with no critical or major findings. Minor 1 was fixed in Review, Minor 2 is this stage's live proof, and Minor 3 needs no action.
- [x] **CI Gate green on the final head.** The PR head `5852e06929913fc301dda0d592a46a0c3a22ce92` matched local `HEAD` and `origin/fix/browser-sentry-env-release`. Its check-runs showed `CI Gate completed success`, and so did Build, Lint, Typecheck, Test (Node 22), Integrity, Architecture Audit, Gitleaks Secret Scan and Hospitality/Marketing E2E. Two checks were red and both are advisory:
  - `Visual Regression (hospitality)`: the two `dashboard` specs. They fail identically on main (run `37213913183`, per review.md).
  - `Visual Regression (rialto-web)` (run `37224248467`): `light / button-sizes`, `input-states`, `textarea-states`, `numberinput-states`. The `Rialto Web E2E` workflow has failed on main for its last five runs (latest `37179071012` at `4402db761`). This is pre-existing drift; the diff renders no UI.
- [x] **No secrets in the diff.** Gitleaks passed. The diff adds an `environment` option and the literal `import.meta.env.MODE`, nothing else.
- [x] **Backend untouched.** On the merged commit, `git diff fcd4be0a1^ fcd4be0a1 --stat -- packages/sentry/src/config.ts packages/sentry/src/node.ts packages/service-bootstrap services | wc -c` printed `0`. So no `deploy-services.yml` run is needed, and the brief's STOP condition does not apply.
- [x] **Target config present.** `deploy-static.yml` already supplies the DSN and `SENTRY_AUTH_TOKEN` to the builds. Nothing new was needed.
- [x] **Migrations/data.** None.
- [x] **Alert rules checked (open item from Capture).** `find_alert_rules` (org `mattbutlerengineering`, `kind: all`) returned 6 issue rules and 0 metric rules. Every rule has `environment: null`. Rules `3248808` and `3450626`, inspected in full, are the default "Send a notification for high priority issues" template: triggers are `new_high_priority_issue` / `existing_high_priority_issue`, action filters have no conditions, and the action is an email to issue owners. The other four share that name and creation batch, except `5797911` ("pull requests are ready"). No rule filters on `environment` or `release`, so changing browser events from `development` to `production` neither starts nor stops any alert. `scripts/sentry-heartbeat*.mjs` and `.github/workflows/sentry-heartbeat.yml` contain no `environment`/`release` reference. Inbound filters were not measured (see assumptions).
- [x] **Rollback plan concrete** (below).

## Rollback plan

The change is browser-only and has no data side effects. To undo it:

```bash
git fetch origin
git switch -c revert/browser-sentry-env-release origin/main
git revert --no-edit fcd4be0a125aa140f1ddb4383a787b359a9730de
git push -u origin revert/browser-sentry-env-release
gh pr create --base main --title "revert: browser sentry env/release (#6035)" --body "Rollback of #6035"
# once CI Gate is green:
gh pr merge <N> --squash --subject "revert: browser sentry env/release (#6035)"
# packages/sentry/** is NOT in deploy-static.yml's push paths filter, so redeploy explicitly:
gh workflow run deploy-static.yml --ref main
```

Then confirm the deploy run's job-level conclusions (Deploy Marketing / Hospitality / Rialto Web). Reverting only brings back the old mislabelling (`development` / `null`). Error capture itself never depended on this change.

## Release log

1. `gh pr ready 6035` → `✓ Pull request ...#6035 is marked as "ready for review"`.
2. `gh pr merge 6035 --squash --subject "fix(sentry): report real environment and release from browser bundles (#6035)" --match-head-commit 5852e0692…` → rc 0. The PR then showed `state: MERGED`, `mergedAt: 2026-10-04T20:03:22Z`, merge commit `fcd4be0a125aa140f1ddb4383a787b359a9730de`. `git log origin/main -1` → `fcd4be0a1 fix(sentry): report real environment and release from browser bundles (#6035)`.
3. `gh workflow run deploy-static.yml --ref main` → run **`37230635100`**, `headSha fcd4be0a125aa140f1ddb4383a787b359a9730de`, created `2026-10-04T20:03:31Z`.
4. **Hiccup, attempt 1:** workflow `failure`. Jobs: Circuit Breaker Check success, Detect Changes success, **Deploy Marketing failure**, Deploy Hospitality success, Deploy Rialto Web success, Post-Deploy Verification success, Report Deploy Health success, Rollback Failed Deploys skipped. Cause, from `--log-failed`: the `sentryVitePlugin` source-map upload (`sourcemaps upload ... --release fcd4be0a125aa140f1ddb4383a787b359a9730de`) died with `API request failed ... [6] Could not resolve hostname (Could not resolve host: us.sentry.io)`. That is a runner DNS failure, unrelated to the diff.
5. `gh run rerun 37230635100 --failed` → **attempt 2: workflow `success`**. Deploy Marketing success, plus attempt-1 successes for Hospitality, Rialto Web, Post-Deploy Verification and Report Deploy Health. Deployed SHA: `fcd4be0a125aa140f1ddb4383a787b359a9730de` for all three sites.
6. `gh workflow run sentry-heartbeat.yml --ref main` (dispatched once) → run **`37231131431`**, `completed success`. Its issue step printed `none` for users-api, reservations-api, agent-api, hospitality and mattbutlerengineering, so every target round-tripped and no issue was filed.

## Post-release checks

- **Live bundles.** Resolved through `dig @1.1.1.1` (`mattbutlerengineering.com` → `172.67.222.73`) and fetched with `curl --resolve` to avoid the LAN DNS sinkhole. All three pages returned 200. Each entry chunk contains both the new init literal and the plugin's release snippet for the deployed SHA:

  | Site        | Entry chunk                             | init                                                                  | release snippet                                                      |
  | ----------- | --------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
  | marketing   | `/assets/index-DZJNbhfg.js`             | ``…ingest.us.sentry.io/4511154257526784`,environment:`production`})`` | ``e.SENTRY_RELEASE={id:`fcd4be0a125aa140f1ddb4383a787b359a9730de`}`` |
  | rialto-web  | `/rialto/assets/index-DiZZL5k1.js`      | ``…ingest.us.sentry.io/4511154257526784`,environment:`production`})`` | ``e.SENTRY_RELEASE={id:`fcd4be0a125aa140f1ddb4383a787b359a9730de`}`` |
  | hospitality | `/hospitality/assets/index-B2HLe4Ar.js` | ``…ingest.us.sentry.io/4511413547040768`,environment:`production`})`` | ``e.SENTRY_RELEASE={id:`fcd4be0a125aa140f1ddb4383a787b359a9730de`}`` |

  Marketing and rialto-web also carry the shipped `react.ts` spread: `environment:e.environment??t.environment,...t.release!==void 0&&{release:t.release}`.

- **Live events (the proof Review deferred as Minor 2).** Sentry MCP `search_events` (errors, last 1h, `message:"*mbe-round-trip-20261004T201210094Z-ot2e3i*"`) returned 6 events:

  | Target           | Project               | environment  | release                                    |
  | ---------------- | --------------------- | ------------ | ------------------------------------------ |
  | marketing        | mattbutlerengineering | `production` | `fcd4be0a125aa140f1ddb4383a787b359a9730de` |
  | rialto-web       | mattbutlerengineering | `production` | `fcd4be0a125aa140f1ddb4383a787b359a9730de` |
  | hospitality      | hospitality           | `production` | `fcd4be0a125aa140f1ddb4383a787b359a9730de` |
  | users-api        | users-api             | `production` | (none)                                     |
  | reservations-api | reservations-api      | `production` | (none)                                     |
  | agent-api        | agent-api             | `production` | (none)                                     |

  The browser releases equal the deployed SHA, which is the same `--release` the source maps were uploaded under in step 4/5. The browser events' culprit frames resolve to package source paths (`@sentry+browser@11.4.0/.../helpers`), not minified offsets.

- **Backend baseline unchanged.** The three service events still show `environment: production` with no release, the same as Capture's pre-fix measurement. Nothing about the backend moved.

## Outcome

Shipped, with one hiccup. On attempt 1 of deploy run `37230635100`, Deploy Marketing failed on a runner DNS miss resolving `us.sentry.io` during the source-map upload. A single `--failed` rerun went green. Production browser events from all three static sites now carry `environment: production` and `release: fcd4be0a…`, matching the deployed SHA and the source-map release. The defect is closed. Next stage: Operate.

### Open items (out of scope, for Matt / later runs)

- **Backend `release: null`.** Services don't set `SENTRY_RELEASE`, so backend events can't be tied to a deploy. Seeded in `docs/backlog.md` by this PR.
- **`deploy-static.yml` paths filter omits `packages/sentry/**`.** This release had to be dispatched by hand. Already seeded (`docs/backlog.md`, "Add `packages/sentry/**` to `deploy-static.yml`'s push `paths:` filter").
- **`verify-push-sha` hook residual worktree case.** Already seeded (`docs/backlog.md`, "Close the residual worktree case in `.claude/hooks/verify-push-sha.sh`").
- **Advisory visual baselines red on main:** hospitality `dashboard` and rialto-web form-control specs. Not touched here.
- **Sentry inbound filters unmeasured.** Reading them needs Sentry UI access or a token with `project:read`.
- **Source-map upload is a hard build dependency on Sentry DNS/API.** A transient Sentry or DNS failure fails the whole site deploy (attempt 1 here). Not seeded; flagged for Operate to weigh.
