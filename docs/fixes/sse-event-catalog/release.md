---
stage: ship
run: maintenance:sse-event-catalog
date: 2026-10-05
pr: 6050
merge-commit: 6f518fa351d7d0059aa7011d0552701a63e25937
final-pr-head: b621fb164d1d3255647cdb7cfd5013d99ae62bfc
assumptions:
  - "Release authorization is autorun-brief.md's 'Release authorization (Matt, 2026-10-04)': squash-merge once `reviewer` passed (review.md: PASS 9/10, no critical), `CI Gate` SUCCESS on the final head, no unfixed critical. All three held at merge time; no human was asked."
  - "Scale: refactor maintenance run, so the full pre-flight was done. No migration and no config/secret change, so those items are confirmed N/A rather than exercised."
  - '`Visual Regression (hospitality)` failed on every PR head (e9dee9a89, 3e34394df, b621fb164). Recorded, not blocking: it is advisory (not in `ci-gate` needs; required contexts are `["CI Gate"]`) and red on main per the stage brief. Not investigated whether this diff changed any pixel; the change has no rendered surface except ActivityFeed''s new label, and ActivityFeed is not mounted by any page (review.md).'
  - "No origin backlog seed to mark: defect.md's `origin:` says 'no tracker issue, no backlog seed'. No intake issue to close."
  - "Server-side change is type-only (`events.ts` imports `SseEvent`/`SseEventName` as types), so the reservations-api deploy carries no runtime behaviour change from this run; health 200 is recorded as liveness, not as proof of the change."
---

# Release: SSE event vocabulary from one shared catalog (PR #6050)

## Pre-flight

- [x] Verification green — `verification.md` 13/13 PASS, 0 FAIL; `review.md` verdict "Ready to ship. No unfixed critical."
- [x] No secrets in diff; target config present — diff is types, a hook, tests, llms artifacts and docs; `Gitleaks Secret Scan` success on the PR; no new env var or binding.
- [x] Migrations/data changes have a tested forward path — none in this change (no `prisma/` file in `git diff --name-only 2653312ff b621fb164`).
- [x] Rollback plan concrete (below).

## Rollback plan

```
# On a fresh checkout of main (never the shared main worktree):
git fetch origin
git checkout -b revert/sse-event-catalog origin/main
git revert --no-edit 6f518fa351d7d0059aa7011d0552701a63e25937
pnpm build --filter @mbe/cli... && pnpm regen   # llms artifacts follow the revert
git push -u origin revert/sse-event-catalog
gh pr create --base main --title "revert: sse event catalog (#6050)" --body "Rollback of #6050"
# merge on CI Gate green; the push to main re-triggers Deploy Static Sites
# (apps/hospitality/**) and Deploy Services (packages/types/**, services/reservations/**).
# If a paths filter skips one: gh workflow run deploy-static.yml --ref main / deploy-services.yml --ref main
```

Effect of rollback: the client re-subscribes to the old hand-kept list (drops
`floor-plan:created`, re-adds the dead `venue:updated`), and `guest:lapsing`
stops invalidating `lapsingGuests`. No data is touched.

## Release log

1. `git fetch origin` → origin/main == base `2653312ff`; nothing to merge. Read check-runs on PR head `e9dee9a89` → `CI Gate: completed success` (run 37262054605); `Visual Regression (hospitality)` failure (advisory).
2. Re-fetched before merging → main had moved: `569598866` (#6051, run #1 `reservation-transition-effects`, test harness only — did not touch `events.ts`). Overlap: root + `services/reservations` llms artifacts only.
3. `git merge origin/main --no-edit` → clean ort merge, `3e34394df`. Gates: `pnpm regen --check` → "All generated artifacts are up to date."; tests — types 287/287, hospitality 2532/2532, reservations 1737 passed + 16 expected-fail + 150 skipped; typecheck clean in all three. `git push` exit 0; `git ls-remote` == `3e34394df`.
4. While CI ran on `3e34394df`, main moved again: `93b318192` (#6052, run #3 `endpoint-definitions-pilot`) and `0716e3a57` (#6053, metrics). Real overlap: `packages/types/src/index.ts`, types/root llms, `pnpm-lock.yaml`.
5. `git merge origin/main --no-edit` → clean ort merge, `b621fb164`. `index.ts` resolved additively: this run's `sse-events` exports kept, #6052's `export * from "./endpoints/index.js"` appended. `pnpm install --frozen-lockfile` (lockfile changed) exit 0; `pnpm build --filter @mbe/cli... --filter "@mbe/hospitality^..." --filter "<reservations>^..."` → 17/17. (First build attempt failed with `No package found with name '@mbe/reservations'` — wrong filter name, my error; re-ran with the name read from the package.json.) `pnpm regen --check` up to date; tests — types 297/297, hospitality 2532/2532, reservations 1737 + 16 expected-fail, api-client 328/328, service-bootstrap 181/181; typecheck clean in all five.
6. `git push` → exit 0, but the PostToolUse `verify-push-sha.sh` hook fired while the push (pre-push hook) was still running and reported remote BEHIND. Waited for the push to finish; `git ls-remote` → `b621fb164` == local. Not a failed push.
7. Polled `CI Gate` on `b621fb164` → `completed success` (run 37266692040, job 111627523458). Only failure: `Visual Regression (hospitality)` (advisory). Re-fetched: main unchanged.
8. `gh pr ready 6050` → ready. `gh pr merge 6050 --squash --subject "refactor(sse): derive SSE event vocabulary from one shared catalog (#6050)" --delete-branch` → merged at 2026-10-05T05:24:25Z, merge commit `6f518fa35`. gh then exited 1 with `fatal: 'main' is already used by worktree at …/booking-guest-reuse` (its local post-merge checkout); the server-side merge and remote branch deletion both happened — `git log origin/main -1` = `6f518fa35`, `git ls-remote origin refs/heads/refactor/sse-event-catalog` empty.
9. Deploys triggered by the merge push (no manual dispatch needed — `deploy-static.yml` paths include `apps/hospitality/**`; `deploy-services.yml` paths include `packages/types/**` and `services/reservations/**`):
   - Deploy Static Sites run 37267648293 → success. Jobs: Circuit Breaker Check success, Detect Changes success, **Deploy Hospitality success**, Post-Deploy Verification success, Report Deploy Health success; Rialto Web / Marketing skipped (unchanged), Deploy Blocked / Rollback skipped.
   - Deploy Services run 37267648249 → success. Jobs: Circuit Breaker Check success, Wait for CI success, **Deploy API Services success**, Post-Deploy Verification success, Report Deploy Health success; Deploy Blocked skipped.
   - main CI run 37267648296 on `6f518fa35` → success.

## Post-release checks

- Live hospitality bundle, probed via `dig @1.1.1.1` (`104.21.25.32`) + `curl --resolve`, crawling every JS chunk reachable from `/hospitality/`:
  - **Before merge:** entry `index-B2HLe4Ar.js`, 68 chunks; `venue:updated` in `useSSESync-Clh9g71X.js`; `floor-plan:created` in **no** chunk.
  - **After deploy:** entry `index-C_wcneSr.js`, 67 chunks; `floor-plan:created` in `dist-hlOdRZIH.js` (the `@mbe/types` catalog), `useSSESync-Bd3M-_2E.js`, `HomePage-BcdEEWHI.js`; `"Floor plan created"` label in `HomePage-BcdEEWHI.js`; `lapsingGuests` now also in the catalog chunk; `venue:updated` in **no** chunk.
- `GET /api/v1/reservations/health` and `/api/v1/users/health` → 200, `database: ok` (05:48Z). Liveness only; the server change is type-only.
- **Not claimed:** that any staff browser has received a `floor-plan:created` or `guest:lapsing` event live. Both are emitted through the dead singleton (`defect.md`), so live delivery depends on run #1 `reservation-transition-effects`. Pending.

## Outcome

Shipped with hiccups (listed): two merges of a moving main (#6051, then #6052/#6053), one mistyped build filter, one premature push-verify hook warning, and gh's local-checkout error after a successful server-side merge. No rollback. The client now derives subscription, forwarding and invalidation from `SSE_EVENT_CATALOG`, and that is what production serves.

## Open items

- Live delivery of `floor-plan:created` / `guest:lapsing` → run #1 (pending, not this run's).
- `Visual Regression (hospitality)` red on every head of this PR — advisory and pre-existing on main; not attributed to this change, not ruled out either.
- Backlog seeds added from review.md Minors 1–3: narrow `floor-plan:created` to `["floorPlans"]`; discriminated-union `SseEvent` after run #1 lands; point prose SSE event lists at the catalog.

Next stage: Operate.
