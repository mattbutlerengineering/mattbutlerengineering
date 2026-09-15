---
stage: ship
run: feature:venue-onboarding-floor-plan
date: 2026-09-09
assumptions:
  - "Review gate 2 (the dead-`isSubmitting` Major, recommended fix-before-Ship) was accepted as satisfied by issue #4824 closing via merged PR #4829 (`009aca779`, 2026-08-31T22:17:56Z) — not by a fresh human arbitration. The autorun brief authorizes merge-on-green; no live user re-graded the finding."
  - "The tracking issue #4751 is closed by this stage. The brief's tracker answer (export breakdown → issues under a tracking parent) and the protocol's tracker-mirror rules close children at Implement boundaries and intake at Ship; a tracking parent is neither, so the orchestrator's instruction to close it at Ship — after every child is confirmed closed — was taken as the rule."
  - "The release mechanism (merge on green → CI deploy) had already run to completion before this stage began: Ship ran 9 days after the last run merge (#4815, 2026-08-31) and 5 days after the last fix (#5044, 2026-09-04), driven by autorun. This stage therefore records and verifies the release from CI evidence; it executed no release step of its own. Nothing was re-deployed or re-dispatched."
  - "Today's `venue-journey.yml` failure (run 34384782119) was classified as an environment failure from its step log — an apt `Hash Sum mismatch` fetching dl.google.com's chrome-stable index during `Install Playwright chromium`; the journey itself never ran. No re-dispatch was made; tomorrow's scheduled run is the retest. The brief does not say whether Ship may dispatch the journey, and the eight consecutive green scheduled runs before it stand as the evidence."
  - "`deploy-services.yml` is recorded as not applicable rather than as a deploy path: none of the 18 squash commits touched any entry of that workflow's `paths:` filter (the union of files is 36 under `apps/hospitality/`, 3 under `packages/api-client/`, plus root `llms*.txt`). The brief named both deploy paths; the run shipped no reservations change."
  - "The eight earlier-stage artifacts (idea, prd, ux, architecture, breakdown, verification, review, autorun-brief) had never been committed — they lived untracked in a stale checkout. They enter git history in this stage's commit alongside `release.md`, under the assumption that committing them together is what the orchestrator intends for a single Ship+Operate PR."
  - "Versioning: `apps/hospitality` carries no version tag convention and `@mbe/api-client` is workspace-private (never published), so the `deploy-static.yml` run ids below are the version record. No `.changeset` is owed — `packages/rialto/src` was untouched (0 files across all 18 commits)."
surfaced:
  - "`deploy-static.yml` does not deploy the hospitality app when only `packages/api-client` changes. Its `on.push.paths` lists `packages/rialto`, `packages/rialto-catalog`, `packages/auth` but not `packages/api-client`, and its dorny `hospitality:` filter is `apps/hospitality/**`, `packages/rialto/**`, `packages/auth/**` only. Measured: `f4eb21bef` (#4826, the activate-400 fix, api-client only) produced no `deploy-static.yml` run at all; the next run (33445149090, `824d48490`, a rialto-web change 19 min later) reported `Deploy Hospitality → skipped`. The fix reached production only because #4829 touched `apps/hospitality/` 25 minutes later (run 33445558426). Had it not, the Critical would have stayed live in production with its fix 'merged'. `apps/hospitality/package.json` also depends on `@mbe/types`, `@mbe/observability`, `@mbe/sentry`, `@mbe/rialto-catalog`, `@mbe/cancellation-policy`, `@mbe/config` — same gap for each. Backlog candidate for Operate."
  - "`venue-journey.yml`'s `Install Playwright chromium` step depends on apt fetching dl.google.com's chrome-stable index (Playwright's `--with-deps` adds the Google repo); a mirror `Hash Sum mismatch` on 2026-09-09 failed the whole daily journey without exercising the feature. One flaky transitive apt source can blank the only live signal for this feature. Candidate: retry `apt-get update` / cache the browser / drop the Google repo dependency."
  - "PR #5044 (`4315cd765`, 2026-09-04) fixed a defect the run's review did not find: `LaunchStep`'s `unmountedRef` was set `true` in cleanup and never reset on mount, so under React 18 StrictMode's dev-only double-invoke `handleLaunch()` always bailed before `setCelebrating(true)`. Production builds do not double-invoke effects, so users were unaffected (per the PR's measurement), but the advisory `Hospitality E2E` job was red on every code PR from 2026-09-01 to 2026-09-04 (#4965, #4967, #5009 per #5017) and nothing blocked on it. The review's Major covered the same ref's suppression path without noticing it was never reset. Two things for Operate: a review-coverage gap (StrictMode is not in the unit harness) and an advisory job that can stay red for days unnoticed."
  - "Migrations: none — but note for the record that `git log --first-parent --diff-filter=A origin/main 35ec7df18^..4315cd765 -- 'services/*/prisma/migrations'` is the check that proves it, and it returned nothing."
---

# Release: venue-onboarding-floor-plan — floor plan inside the new-venue wizard

Shipped as 12 squash merges to `main` on 2026-08-31 (#4767 → #4815) plus six
follow-up merges (#4823, #4826, #4829, #4872, #4861, #5044) between
2026-08-31 and 2026-09-04, each auto-deployed to production by
`deploy-static.yml` (hospitality → Cloudflare Worker
`mattbutlerengineering-hospitality`, served at
`https://mattbutlerengineering.com/hospitality/`). This stage ran on
2026-09-09 — nine days after the last run merge — driven by autorun; every
claim below is a command run in this session with its output quoted. The run's
earlier artifacts were untracked until this stage's commit.

## Pre-flight

- [x] Verification green (no unresolved failures) — see the mapping below;
      all 3 FAIL + 1 PARTIAL from 2026-08-31 resolved by later merges
- [x] No secrets in diff; target config present
- [x] Migrations/data changes have a tested forward path — none exist
- [x] Rollback plan concrete (commands/steps below)

### Soft gate: `review.md` verdict re-checked

`review.md` said **Not ready to ship** behind two gates. Both closed on `main`
before this stage:

| Gate                                                  | Tracker | Fix PR → merge SHA                                                          | Merged (UTC)         | Issue closed         |
| ----------------------------------------------------- | ------- | --------------------------------------------------------------------------- | -------------------- | -------------------- |
| 1. Critical — activate 400s in production             | #4820   | #4826 `f4eb21bef` fix(api-client): send empty JSON object body on setActive | 2026-08-31T21:53:11Z | 2026-08-31T21:53:12Z |
| 2. Major — dead `isSubmitting` guards strand a launch | #4824   | #4829 `009aca779` derive launch-in-flight nav guards, retire dead submit    | 2026-08-31T22:17:56Z | 2026-08-31T22:17:57Z |
| Major (deferred) — Retry desyncs draft from live plan | #4825   | #4872 `2239e91e0` freeze floor-plan draft once launch has created state     | 2026-09-01T05:46:26Z | 2026-09-01T05:46:27Z |
| Minor — M1 drift pin missing                          | #4822   | #4823 `8839ae8a2` pin ONBOARDING_STEPS.length === TOTAL_STEPS               | 2026-08-31T21:48:46Z | 2026-08-31T21:48:47Z |
| Minor — S3 landing E2E + method-blind mocks           | #4817   | #4861 `61c923c1d` E2E cover retry-success handoff + method-guard mocks      | 2026-09-01T20:18:44Z | 2026-09-01T20:18:45Z |

Source (one loop, `gh pr view <n> --json number,state,mergedAt,mergeCommit`):

```
4823	MERGED	2026-08-31T21:48:46Z	8839ae8a2	test(hospitality): pin ONBOARDING_STEPS.length === TOTAL_STEPS
4826	MERGED	2026-08-31T21:53:11Z	f4eb21bef	fix(api-client): send empty JSON object body on setActive to satisfy Fastify content-type check
4872	MERGED	2026-09-01T05:46:26Z	2239e91e0	fix(hospitality): freeze floor-plan draft once launch has created server state
5044	MERGED	2026-09-04T21:10:45Z	4315cd765	fix(hospitality): reset unmountedRef on mount so launch celebration fires
$ gh pr list --state merged --search "4824" …
4829	2026-08-31T22:17:56Z	009aca779	fix(hospitality): derive launch-in-flight nav guards and retire dead submit surface
$ gh pr list --state merged --search "4817" …
4861	2026-09-01T20:18:44Z	61c923c1d	test(hospitality): E2E cover retry-success launch handoff + method-guard onboarding mocks
$ gh issue view <n> --json state,stateReason,closedAt   (4817 4820 4822 4824 4825)
4817	CLOSED	COMPLETED	2026-09-01T20:18:45Z
4820	CLOSED	COMPLETED	2026-08-31T21:53:12Z
4822	CLOSED	COMPLETED	2026-08-31T21:48:47Z
4824	CLOSED	COMPLETED	2026-08-31T22:17:57Z
4825	CLOSED	COMPLETED	2026-09-01T05:46:27Z
```

#4817's timeline shows the `closed` event at 2026-09-01T20:18:45Z, one second
after #4861 merged — closed by a merged fix, not closed without one. #4829's
title covers the two review minors that were folded into gate 2 (the failed-
Retry unhandled rejection and the dead `submit` surface).

### Verification failures → resolution

`verification.md` (2026-08-31, at `ec5d82e92`): 19 PASS, 1 PARTIAL, 3 FAIL.

1. **M7/M16 FAIL — live activate 400** → #4820 → #4826 `f4eb21bef`. Deployed
   to the hospitality Worker by run 33445558426 (`009aca779`, 22:17:59Z —
   the first hospitality build after the fix; see Surfaced for why
   `f4eb21bef` itself produced no deploy). Journey dispatch 33447471520
   (22:42:48Z, head `5fdb5dd9b`) → **success**, then eight consecutive green
   scheduled runs 2026-09-01 → 2026-09-08. **Resolved.**
2. **S3 FAIL — no landing assertion; mocks unexercised** → #4817 → #4861
   `61c923c1d`, deploy run 33554571747 `Deploy Hospitality → success`.
   **Resolved** (test-only change; exercised by the advisory `Hospitality
E2E` job).
3. **M1 drift pin missing (FAIL 3 / PARTIAL)** → #4822 → #4823 `8839ae8a2`,
   deploy run 33443221765 `Deploy Hospitality → success`. **Resolved.**

### Secrets and configuration

Union of files across all 18 squash commits (`git show --pretty=format:
--name-only <sha>` over the list, `sort -u`):

```
files: 41
sensitive-path matches (\.env|secret|credential|wrangler|Pulumi|\.github/|prisma|\.npmrc|\.mcp\.json|services/):
(none)
dirs:
  36 apps/hospitality
   1 llms-full.txt
   1 llms.txt
   3 packages/api-client
secret-literal hits in added lines (sk_live_|pk_live_|rk_live_|AKIA|ASIA|PRIVATE KEY|JWT):
(0 across all 18)
packages/rialto touched: 0
```

No workflow, env, wrangler, Pulumi, or service file changed. Target
configuration: every `Deploy Hospitality` job below built with the workflow's
own `VITE_AUTH_REDIRECT_URI=https://mattbutlerengineering.com/hospitality/callback`
and succeeded, and the live journey authenticates against production Auth0 and
creates real venues — the configuration the feature needs is demonstrably
present.

### Migrations

None. Checks run:

```
$ git log origin/main --oneline --since=2026-08-30 --until=2026-09-05 -- services/reservations/prisma
(empty)
$ git log --first-parent --format='%h %s' --diff-filter=A origin/main 35ec7df18^..4315cd765 -- 'services/*/prisma/migrations'
(empty)
```

No `services/` path appears in the 41-file union. The feature writes only
through existing `POST /venues`, `POST /floor-plans`, `POST /tables`, and
`POST /floor-plans/:id/activate` routes.

## Rollback plan

Everything below goes through the same path the release used: a PR to `main`,
`CI Gate` green, squash merge, `deploy-static.yml` auto-deploys the
hospitality Worker. Manual `wrangler deploy`/`rollback` is not authorized
(deploy via CI only); the workflow's own `Rollback Failed Deploys` job runs
`npx wrangler@3.114.17 rollback --name mattbutlerengineering-hospitality`
automatically if post-deploy verification fails.

```
# From a fresh checkout of origin/main. Reverse main-branch order, newest first.
git switch -c revert/venue-onboarding-floor-plan origin/main
git revert --no-edit 4315cd765   # #5044 reset unmountedRef on mount
git revert --no-edit 61c923c1d   # #4861 E2E retry-success handoff (test-only)
git revert --no-edit 2239e91e0   # #4872 freeze draft after server state
git revert --no-edit 009aca779   # #4829 launch-in-flight nav guards
# f4eb21bef (#4826, api-client setActive body) — DO NOT revert by default:
#   it also fixes the editor's "Set as Active" (broken since #4735); keep it.
git revert --no-edit 8839ae8a2   # #4823 drift-pin test (test-only)
git revert --no-edit ec5d82e92   # #4815 E2E mocks + spec changes
git revert --no-edit 5ffa3adb6   # #4811 size-limit budget
git revert --no-edit 0898c214c   # #4814 docs
git revert --no-edit cc5da01ce   # #4804 wire step into wizard (the keystone)
git revert --no-edit 63d7888dc   # #4802 LaunchStep
git revert --no-edit 856652991   # #4792 LaunchStagePanel
git revert --no-edit c9f8e14b2   # #4790 wizard draft/launch slices
git revert --no-edit 097c8d595   # #4797 FloorPlanStep
git revert --no-edit 0b0ed4db9   # #4783 TemplatePreview
git revert --no-edit 2ccbdea50   # #4781 launch-sequence
git revert --no-edit 5e6d05cec   # #4774 templates
git revert --no-edit 35ec7df18   # #4767 draft model
pnpm build --filter @mbe/cli... && pnpm regen        # llms*.txt drift
pnpm --dir apps/hospitality typecheck && pnpm --dir apps/hospitality test
git push -u origin revert/venue-onboarding-floor-plan
gh pr create --base main --title "revert: venue-onboarding-floor-plan" --body "…"
gh pr merge <N> --auto --squash --delete-branch   # CI Gate green → merge → deploy-static deploys hospitality
```

Minimal rollback (restore the 5-step wizard only): revert `cc5da01ce` (#4804)
plus its dependents `4315cd765`, `2239e91e0`, `009aca779`, `61c923c1d`,
`ec5d82e92` — M1/M2 files are inert without the keystone. If a revert ever
touches only `packages/api-client`, it will NOT redeploy hospitality (Surfaced
#1); run `gh workflow run deploy-static.yml --ref main` (workflow_dispatch
deploys all three apps).

Data: nothing to roll back. Venues created by the six-step wizard are ordinary
venues with an active floor plan and tables — the five-step wizard reads
nothing from them. The daily journey's synthetic venues
(`synthetic-journey-<runId>`) are deleted by the spec or swept by the next
run's "Sweep leftover synthetic venues" step.

## Release log

Release = merge to `main` (auto-merge on `CI Gate`) → `deploy-static.yml`
push run → `Deploy Hospitality` job → `Post-Deploy Verification`. Order is
`git log --first-parent origin/main`, oldest first (merge times UTC from
`gh pr view`; deploy runs from
`gh run list --workflow deploy-static.yml --branch main --limit 120 --json databaseId,conclusion,createdAt,headSha`
and `gh run view <id> --json jobs`).

| #   | PR    | Merge SHA   | Merged (UTC)         | deploy-static run | Run           | Deploy Hospitality | Post-Deploy Verification |
| --- | ----- | ----------- | -------------------- | ----------------- | ------------- | ------------------ | ------------------------ |
| 1   | #4767 | `35ec7df18` | 2026-08-31T05:17:41Z | 33360027843       | success       | success            | success                  |
| 2   | #4774 | `5e6d05cec` | 2026-08-31T17:03:27Z | 33417482680       | success       | success            | success                  |
| 3   | #4781 | `2ccbdea50` | 2026-08-31T17:14:57Z | 33418531341       | success       | success            | success                  |
| 4   | #4783 | `0b0ed4db9` | 2026-08-31T17:22:58Z | 33419254208       | success       | success            | success                  |
| 5   | #4797 | `097c8d595` | 2026-08-31T18:55:42Z | 33427722712       | success       | success            | success                  |
| 6   | #4790 | `c9f8e14b2` | 2026-08-31T18:57:09Z | 33427856573       | **cancelled** | —                  | —                        |
| 7   | #4792 | `856652991` | 2026-08-31T18:57:34Z | 33427901027       | success       | success            | success                  |
| 8   | #4802 | `63d7888dc` | 2026-08-31T19:31:28Z | 33431036238       | success       | success            | success                  |
| 9   | #4804 | `cc5da01ce` | 2026-08-31T20:22:23Z | 33435668364       | success       | success            | success                  |
| 10  | #4814 | `0898c214c` | 2026-08-31T20:46:32Z | 33437856832       | success       | success            | success                  |
| 11  | #4811 | `5ffa3adb6` | 2026-08-31T20:55:48Z | 33438667012       | success       | success            | success                  |
| 12  | #4815 | `ec5d82e92` | 2026-08-31T21:07:53Z | 33439736046       | success       | success            | success                  |
| 13  | #4823 | `8839ae8a2` | 2026-08-31T21:48:46Z | 33443221765       | success       | success            | success                  |
| 14  | #4826 | `f4eb21bef` | 2026-08-31T21:53:11Z | **none**          | —             | —                  | —                        |
| —   | #4828 | `824d48490` | 2026-08-31T22:12:53Z | 33445149090       | success       | **skipped**        | success                  |
| 15  | #4829 | `009aca779` | 2026-08-31T22:17:56Z | 33445558426       | success       | success            | success                  |
| 16  | #4872 | `2239e91e0` | 2026-09-01T05:46:26Z | 33474892686       | success       | success            | success                  |
| 17  | #4861 | `61c923c1d` | 2026-09-01T20:18:44Z | 33554571747       | success       | success            | success                  |
| 18  | #5044 | `4315cd765` | 2026-09-04T21:10:45Z | 33919866450       | success       | success            | success                  |

Hiccups, recorded:

1. **Row 6 cancelled.** #4790 and #4792 merged 25 s apart; the workflow's
   concurrency group cancelled the `c9f8e14b2` run and the `856652991` run
   (row 7) built hospitality from a `main` containing both. No gap in what
   reached production.
2. **Row 14 has no deploy.** `f4eb21bef` touched only `packages/api-client/`,
   which is in neither `deploy-static.yml`'s `on.push.paths` nor its
   `hospitality:` change filter, so no run was created. `gh run list --commit
f4eb21bef…` returns only CI/policy workflows (CI, Secret Scan, ADR check,
   Release, Auto-Merge Policy, Revert Watchdog …) — no `Deploy Static Sites`.
   The next deploy-static run (row —, #4828, a rialto-web change) reported
   `Deploy Hospitality → skipped`. The fix first shipped inside row 15's
   build 25 minutes after its merge. See Surfaced #1.
3. **Row 18 is a post-review fix** (#5044, closes #5017): dev-only StrictMode
   defect that made the advisory `Hospitality E2E` job red on every code PR
   for three days; production behaviour unaffected per the PR's own
   measurement. See Surfaced #3.

`deploy-services.yml`: no run carried any of these SHAs, and none was owed —
no `services/**` or `packages/types/**` path changed (its `paths:` filter was
read this session; the closest runs, `104912570` 2026-09-01T05:55Z and
`e06b2951d` 2026-08-31T03:53Z, are other work).

## Post-release checks

- **Live journey (`venue-journey.yml`, the feature's smoke check against
  production — authenticates via Auth0, walks all six wizard steps, launches a
  real venue, asserts the live celebration, deletes the venue).** From
  `gh run list --workflow venue-journey.yml --limit 15`:

  ```
  34384782119	failure	2026-09-09T17:44:43Z	6c0a54c51	schedule   ← today, see below
  34259572467	success	2026-09-08T17:51:15Z	966baaa3b	schedule
  34152575372	success	2026-09-07T18:40:30Z	11828e0aa	schedule
  34046684073	success	2026-09-06T16:49:38Z	0107641da	schedule
  33978694902	success	2026-09-05T16:42:26Z	734ff8e6e	schedule
  33901045107	success	2026-09-04T17:31:37Z	e7a019cf5	schedule
  33786442386	success	2026-09-03T17:45:32Z	2b7cf4891	schedule
  33663368352	success	2026-09-02T17:48:41Z	0523b0395	schedule
  33539661485	success	2026-09-01T17:45:43Z	85d414a37	schedule
  33447471520	success	2026-08-31T22:42:48Z	5fdb5dd9b	workflow_dispatch   ← first green after #4826/#4829 deployed
  33440536553	failure	2026-08-31T21:17:00Z	ec5d82e92	workflow_dispatch   ← the activate 400 (verification M7/M16, #4820)
  33433100985	failure	2026-08-31T19:54:24Z	63d7888dc	schedule            ← mid-train copy window (verification M16)
  ```

  Nine consecutive successes from the first post-fix run through 2026-09-08.
  → the six-step wizard delivers an active plan in production.

- **Today's failure, run 34384782119, is the environment, not the feature.**
  `gh run view 34384782119 --json jobs`:

  ```
  5	success	Install dependencies
  6	failure	Install Playwright chromium
  7	skipped	Run venue journey
  9	success	Report journey outcome   ("No journey report … nothing to report.")
  ```

  Step 6 log (`gh api …/actions/jobs/102578210581/logs`):

  ```
  E: Failed to fetch https://dl.google.com/linux/chrome-stable/deb/dists/stable/main/binary-amd64/Packages.gz  Hash Sum mismatch
     Hashes of expected file:  SHA256:233e56de019b57db89238fa7bcc3647718dbbea3a40c2dc1c633a8c8952aa9e9
     Hashes of received file:  SHA256:bc1428ab27c6d76ee9bb76de07f1ded0ddb4aaabd958fc72855634ef5894a4b3
  E: Some index files failed to download. They have been ignored, or old ones used instead.
  Failed to install browsers
  Error: Installation process exited with code: 100
  ##[error]Process completed with exit code 1.
  ```

  The browser never installed; the journey never ran; nothing about the
  wizard was exercised. Tomorrow's scheduled run is the retest. See Surfaced #2.

- **Liveness only** (the app is behind Auth0, so a curl proves the Worker
  answers, not that the wizard works — and memory's "prod health 200 ≠ deploy
  succeeded" applies: the green `Deploy Hospitality` jobs above are the
  deploy evidence, not this line):

  ```
  $ curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}B' https://mattbutlerengineering.com/hospitality/
  200 text/html 3730B
  ```

  Route confirmed from `infrastructure/worker/routes-config.json` (`"prefix":
"/hospitality"`, binding `HOSPITALITY`). The direct
  `mattbutlerengineering-hospitality.workers.dev` origin returned `000` — it
  has no A record at `1.1.1.1` or the LAN resolver; it is the Service Binding
  target, not a user path, and is not evidence either way.

- **Tracker mirror.** Every child of tracking issue #4751 confirmed closed
  before closing the parent (`gh issue view <n> --json state,stateReason,closedAt`):

  ```
  4752 CLOSED COMPLETED 2026-08-31T05:17:42Z   4758 CLOSED COMPLETED 2026-08-31T18:57:35Z
  4753 CLOSED COMPLETED 2026-08-31T17:03:28Z   4759 CLOSED COMPLETED 2026-08-31T18:55:44Z
  4754 CLOSED COMPLETED 2026-08-31T17:14:59Z   4760 CLOSED COMPLETED 2026-08-31T19:31:30Z
  4756 CLOSED COMPLETED 2026-08-31T17:22:59Z   4761 CLOSED COMPLETED 2026-08-31T20:22:24Z
  4757 CLOSED COMPLETED 2026-08-31T18:57:11Z   4762 CLOSED COMPLETED 2026-08-31T21:07:54Z
                                               4763 CLOSED COMPLETED 2026-08-31T20:46:33Z
                                               4764 CLOSED COMPLETED 2026-08-31T20:55:49Z
  ```

  #4751 was `OPEN`, labels `feature,tracking`, 0 comments, all 12 checkboxes
  ticked. Closed by this stage:

  ```
  $ gh issue close 4751 --reason completed --comment "Closing at Ship (idea-to-prod run …) … Release record: docs/features/venue-onboarding-floor-plan/release.md on branch docs/venue-onboarding-floor-plan-ship …"
  ✓ Closed issue mattbutlerengineering/mattbutlerengineering#4751
  $ gh issue view 4751 --json state,stateReason,closedAt
  state=CLOSED reason=COMPLETED closedAt=2026-09-10T00:35:35Z
  comment: https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4751#issuecomment-5610818379
  ```

## Outcome

**Shipped with hiccups (listed).** The feature the run set out to build is in
production and has been exercised against production by the daily live
journey nine times in a row without failure. The hiccups are all recorded
above: the run's first live run failed on a pre-existing api-client defect
(#4820, fixed same evening), that fix rode into production on a neighbouring
merge because the deploy workflow does not watch `packages/api-client`, one
deploy run was concurrency-cancelled with no gap, a dev-only StrictMode
defect kept the advisory E2E job red for three days after the review passed
it, and today's journey run died in apt before reaching the feature.

Next stage: Operate.
