---
stage: ship
run: feature:gen-ui-elements-2
date: 2026-11-17
outcome: released
released-at: 2026-10-25
assumptions:
  - "The run's PRs were merged during the run itself (2026-10-25, under the brief's Release authorization), so this Ship pass confirms the merged state instead of executing a release. Nothing was merged or deployed by this pass."
  - "Deploys were confirmed at job level for the last code merge, #7538 (merge commit 0e9fb0212). Earlier merges' deploys are superseded by it, since Deploy Static Sites, Deploy Services and Pulumi each redeploy from the then-current main; per-merge deploy jobs for the earlier 12 PRs were not re-inspected."
  - "Pre-flight local-ci-precheck was run on origin/main at abc50442d (a month after the merges), with the knip lane skipped (memory-heavy per the skill, killed with exit 137 on 2026-10-25) and the size lane skipped (this branch changes only docs, so the affected set is empty)."
  - "PR #7544 (merge 388058ab3) landed the run's own artifacts (architecture, breakdown, idea, prd, review, ux, verification, autorun-brief) on main. Its PR body is the unfilled template; no code in it."
  - "Release authorization covered merging only. No rialto npm publish ran (RIALTO_PACKAGES_TOKEN unset, out of scope in the brief)."
  - "Launch brief: launch_demo.py config printed ON-DEMAND, so nothing was recorded or generated."
---

# Release: Fitting chat elements for reservations, availability and guests (wave 2)

## Pre-flight

- [x] Verification green (no unresolved failures): `verification.md` reports 8 PASS, 2 PASS with a stated gap, 0 FAIL, "Failures: None open". The gaps (a single five-tool batch at 0 fallbacks, guest-card tags live, drop marker live, es-MX and fr-CA live) are carried to Operate's live batch, per review.md.
- [x] Review: `review.md` has no critical findings. Both majors were fixed in #7538 (merged). Minors: Notes recorded in breakdown.md; two deferred (vocabulary drift test, two dead exports), seeded as follow-ups.
- [x] No secrets in diff; target config present: review.md security pass "clean". No new secrets or env keys. `CI Gate` and Secret Scan on the #7538 push: `CI Gate | success`, `Secret Scan push success`.
- [x] Migrations/data changes: none in this run (review.md: no payments or migrations paths touched; no dependency or lockfile change).
- [x] ADRs: the run added none (architecture.md deferred its ADR; review.md carries the trigger as a follow-up). Latest on main is ADR-032, no collision.
- [x] Local CI precheck on origin/main `abc50442d` (steps from `.claude/skills/local-ci-precheck/SKILL.md`, run directly):
  - `pnpm bootstrap:worktree` → 13 successful, 13 total
  - `pnpm lint` → exit 0, `Tasks: 45 successful, 45 total`
  - `pnpm typecheck` → exit 0, `Tasks: 45 successful, 45 total`
  - `pnpm build --filter @mbe/cli...` → exit 0; `check-adr` → `No architectural violations detected.`; `check-deps` → `All external dependencies are consistent across the monorepo.`
  - drift lane: `pnpm graph` + `pnpm generate:dep-graph`, then `git diff --stat` empty (no drift); `mbe pack <dir> --check` over every `llms.txt` → `packages=25 stale=0`
  - knip lane: SKIPPED (memory-heavy, see assumptions). Size lane: SKIPPED (docs-only branch, empty affected set).
- [x] Rollback plan concrete (below).

## Rollback plan

Door: two-way. Every change is a display-only UI element, a catalog or prompt string, or a CI path filter. No schema, data or API contract change, and rialto was not published to npm, so nothing outside the repo's own deploys can have consumed the new components.

Blast radius: the hospitality chat drawer and /gen. A bad element falls back to "Component could not be displayed" (the seam fallback) or prose; reservations, availability and guest data are untouched. Reverting does not need to wait for the others: the elements are additive.

```
# Revert the run's code PRs on main, newest first (squash merge commits):
git revert --no-edit 0e9fb02122d6525af5ed77bc64334709c31cbf91   # #7538 dated rows, element-owned time words
git revert --no-edit 464215cad657d1f6774a5386f71d7f694fb77b5f   # #7533 locale clock
git revert --no-edit c9e5aeb5ecc127fd9601cb36bfb94800bb0dbc66   # #7492 chat gets component list only
git revert --no-edit 953f3b9e7839612b003f5f0fdbe227bce436eaf1   # #7475 GuestCards
git revert --no-edit 8bb548ca7bfeb8cc5ef7ad2b8c4b7bd329abf721   # #7474 TimeSlots
git revert --no-edit b2ba512e281b4783d90995c1a8a6f53e8cc64630   # #7471 ReservationList
git revert --no-edit b940616259cda6ceb3a224bce43be0a986255d85   # #7476 prompt mapping
# (open as a PR; CI Gate then redeploys Static Sites, Deploy Services and Pulumi/gen)
# Quicker partial undo: revert only #7476 so the chat prompt stops steering the model to the new elements.
# Verify after: gh run list --limit 10, then job-level check of Deploy Static Sites / Deploy API Services / Pulumi Deploy.
```

## Release log

1. Confirmed all 15 PRs merged via `gh api repos/.../pulls/<n>`:
   ```
   7466 merged=true eeb5bfaf9  7467 merged=true 380005ca7  7468 merged=true 897ef11bc  7469 merged=true 4150f46c4
   7471 merged=true b2ba512e2  7474 merged=true 8bb548ca7  7475 merged=true 953f3b9e7  7476 merged=true b94061625
   7487 merged=true ad67d12a1  7489 merged=true f4c32f91d  7491 merged=true 35972e5f7  7492 merged=true c9e5aeb5e
   7533 merged=true 464215cad  7538 merged=true 0e9fb0212 (2026-10-25T16:52:20Z)
   7544 merged=true 388058ab3 (run artifacts, 2026-10-25T18:05:27Z)
   ```
2. `gh run list --commit 0e9fb02122d6525af5ed77bc64334709c31cbf91` → `CI push success`, `Deploy Services push success`, `Deploy Static Sites push success`, `Pulumi Deploy push success` (plus a `workflow_run` Pulumi Deploy, success), `Post-Deploy Check workflow_run success` (two earlier ones `cancelled`, superseded by the later successes).
3. Job-level check (`gh run view <id> --json jobs`) of the #7538 merge:
   - Deploy Static Sites (40213756438): `Circuit Breaker Check | success`, `Detect Changes | success`, `Deploy Blocked | skipped`, `Deploy Rialto Web | success`, `Deploy Hospitality | success`, `Deploy Marketing | success`, `Post-Deploy Verification | success`, `Report Deploy Health | success`, `Rollback Failed Deploys | skipped`.
   - Deploy Services (40213756413): `Wait for CI | success`, `Deploy API Services | success` (Trigger deployment step success), `Post-Deploy Verification | success`, `Deploy Blocked | skipped`.
   - Pulumi Deploy (40213756437 push and 40213976180 workflow_run, which serves /gen): `Deploy Infrastructure | success`, `Report Deploy Health | success`.
   - CI (40213756422): `CI Gate | success`, `Test Coverage Gate | success`.
4. Launch brief: `launch_demo.py config` → `ON-DEMAND` / `launch-demo: 0 problem(s)`. Nothing written.
5. No rialto npm publish, no tag, no tracker interaction (per the brief).

## Post-release checks

- Deploy Static Sites `Post-Deploy Verification | success` and the `Post-Deploy Check` workflow_run: `Post-Deploy Smoke Test | success`, `API Surface Invariants | success`, `Playwright Smoke Tests | success` (run 40214823686).
- Live behavior in prod, recorded during Verify (not re-run by this pass): batches 8 and 9 in `docs/ui-quality/chat-scenarios-2026-10-24.md`; batch 9 after the final fixes `Fallback count: chat 0`; first live ReservationList, TimeSlots (47 chips) and GuestCards renders. #7538's multi-date lookup and the full five-tool batch at 0 fallbacks are NOT yet verified live and belong to Operate's minimum-signal batch.
- Fix runs: the deploy-filter gap that silently skipped #7487 was fixed in #7489 and confirmed on a real push (batch 9.5). Related cleanup remaining: `gen` is not in the deploy-closure guard test, and the two dead exports (`localTimeIn`, `VocabularyTone`); both are listed as follow-ups in review.md.

## Outcome

Shipped with hiccups, all fixed in-run: F28 (#7487), F29 (#7491), F30 (#7533), F33 (#7492), the Deploy Hospitality path-filter gap (#7489), and the review majors (#7538). Every run PR is merged and the deploy jobs for the last code merge are green at job level. A month has passed since the merges, and this pass did not re-smoke the live site. Operate must still cover the not-yet-live items above and the follow-ups seeded in review.md (NO_SHOW wording reconcile, rialto public-API ADR before first publish, `gen` in the closure guard, dead exports).
