---
stage: ship
run: maintenance:week-view-service-times
date: 2026-11-22
outcome: released
released-at: 2026-10-27
assumptions:
  - "This Ship pass records a release that already happened. The run merged as #7758 (squash commit 840b42126, 2026-10-27T03:54:49Z) inside a Conductor batch; nothing was merged or deployed by this pass."
  - "The review's verdict was `changes` (one major, one minor). review.md was never updated. This pass read the code on origin/main to confirm both are fixed (see Pre-flight), but did not re-run the tests."
  - "The squash commit bundles the whole run (42 files), so the rollback below reverts the whole run, not one file."
  - "No live browser walkthrough of the Week view on the deployed site was done by this pass or recorded by the run. verification.md already lists visual/E2E baselines and a live walkthrough as not verified."
---

# Release: per-service names and times in the Week view

## Pre-flight

- [x] Verification green: `verification.md` records 5/5 PASS, 0 NOT RUN, 0 FAIL (2026-10-26).
- [x] Review findings: `review.md` verdict `changes`, no critical findings. Major (`services` required on `AvailabilityDaySummarySchema`) is fixed: on origin/main `packages/types/src/schemas/availability-config-api.ts:365` reads `services: z.array(DaySummaryServiceSchema).optional()` with the comment "Absent when parsing an old API's response during a deploy window". Minor (closed state keyed off the label string) is fixed: `summarizeDay` now uses `isDayClosed` (`availability-config-checks.ts:92-95`, `closedAllDay || day.services.length === 0`). Read from code; tests not re-run here.
- [x] No secrets in the diff: not re-scanned by this pass. The `CI` push run on the merge commit concluded `success`; no separate secret scan was read.
- [x] No migration: the change adds an optional response field and client rendering. The diff touches `packages/types`, `services/reservations`, `apps/hospitality`, three i18n catalogs, tests and run artifacts. No Prisma file.
- [x] ADRs: the run added none.
- [x] Rollback plan below is concrete.

## Rollback plan

Trigger: the Availability calendar fails to load or shows wrong service lines in the Week view on the deployed hospitality app, or `GET .../availability/days` starts failing schema validation in the client (an `ApiValidationError` in Sentry on the calendar).

Door: two-way. The change adds an optional `services` field and a week-view-only rendering path, so reverting returns the old count-only Week view with no data to migrate.

Blast radius: the Availability calendar in the hospitality app, the guest preview, and the preview `focusDay` mapper that was unified with the day summary.

```
git revert --no-edit 840b42126b74956f2f05a185bd6f3757c9a57146   # whole run (42 files); open a PR and merge through CI Gate
gh workflow run deploy-services.yml --ref main                    # only if the API deploy does not trigger on the revert merge
```

## Release log

1. #7758 squash-merged to main as `840b42126` at 2026-10-27T03:54:49Z (`gh pr view 7758`).
2. `CI` (push) → success on `840b42126`. `Apps Visual Regression` (push) → failure; it is not part of `CI Gate` and is advisory (gotchas.md: `CI Gate` excludes E2E and visual).
3. `Deploy Services` (push) → success. Job level: `Circuit Breaker Check`, `Wait for CI`, `Deploy API Services`, `Post-Deploy Verification` and `Report Deploy Health` all `success`; `Deploy Blocked` skipped.
4. `Deploy Static Sites` (push) → success. Job level: `Deploy Hospitality` and `Deploy Rialto Web` success, `Deploy Marketing` skipped, `Post-Deploy Verification` success, `Rollback Failed Deploys` skipped.
5. `Post-Deploy Check` → one run cancelled, one success at 2026-10-27T03:58:53Z. Jobs of the successful run: `API Surface Invariants`, `Playwright Smoke Tests`, `Post-Deploy Smoke Test` all `success`.
6. Intake issue #7749 (`intake:` in `defect.md`) closed 2026-10-27T03:57:52Z, about three minutes after the merge. No comment was added by this pass.
7. Launch brief: `python3 tools/launch_demo.py config` printed `ON-DEMAND` with 0 problems, so nothing was written.

## Post-release checks

- Deployed surfaces reported healthy at the job level (steps 3 to 5 above). → evidence: the job conclusions listed there, read with `gh api .../actions/runs/<id>/jobs`.
- The Week view itself on the live hospitality site was not opened by this pass. → not verified. The first real check is a Manager opening Availability in Week view and seeing service names and hours.
- Fix runs: the boundary that produced the gap was the day summary (`summarizeDay` dropped names and times the resolver already had). Its consumers inspected: `presentDay` and `AvailabilityCalendar` (week mode), and the preview `focusDay`, which now delegates to `summarizeDay`. Related cleanup remaining: none identified; later work on this surface (#8287, #8308, #9295) changed the day drawer, month grid and holiday cells separately.

## Outcome

Shipped with hiccups: the review's two findings were fixed inside the same merge but `review.md` still reads `changes`, and `Apps Visual Regression` failed on the merge commit (advisory, not gated). The live Week view was not re-checked.
