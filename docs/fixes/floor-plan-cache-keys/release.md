---
stage: ship
run: maintenance:floor-plan-cache-keys
date: 2026-10-07
assumptions:
  - "Release authorization comes from `autorun-brief.md` § Release authorization (Matt, 2026-10-07): open the PR, squash-merge once the `reviewer` subagent passes and `CI Gate` is green on the final head, let CI deploy on merge. No manual wrangler/doctl."
  - "Rebased onto `origin/main` @ `18b3d1d96` before pushing (two metrics-only commits, #6138 and #6139, touching no file in this diff). The reviewer verdict was given on `0e2489c3b`; it still applies because the non-docs diff is byte-identical: `git patch-id --stable` of `git diff origin/main...HEAD -- . ':!docs'` is `5e1541c733de21b1c657b3ad9d9a1dfd22cbd41a` both before and after the rebase."
  - "Release outcome (PR number, CI Gate run, squash SHA, deploy run) is recorded in the PR and the run's final report rather than written back here, because this file ships inside the PR it describes. Fields below were pending in the merged copy and were written back by a follow-up docs PR on 2026-10-08."
---

# Release: floor-plan and guest-segment invalidations hit their real cache keys

Scale: maintenance run, scoped fix. A single squash merge to `main`, deployed by the
existing `deploy-static.yml` workflow (`apps/hospitality/**` is in its push paths filter).

## Pre-flight

- [x] **Verification green.** `verification.md` has no unresolved failures. Re-run after
      the rebase, on the rebased head: `pnpm --dir apps/hospitality test` → junit
      `tests=2544 failures=0 errors=0`; `pnpm --dir apps/hospitality typecheck` → `tsc --noEmit`, exit 0.
- [x] **Review gate.** `review.md`: no critical or major findings (4 deferred minors/nits).
      `reviewer` subagent, 2026-10-07T19:35Z, on `0e2489c3b`: verdict **pass**, score
      **9/10**, issues `[]`. Only deduction: the `useGuestDirectory` test asserts refetch
      count rather than invalidation state (justified and documented in `defect.md`).
- [x] **No secrets in diff; target config present.** The diff is client-side TanStack
      Query key construction in `apps/hospitality/src/hooks/` plus tests, generated
      `llms*.txt`, and run docs. No env vars, credentials, auth, or payment code. No new
      configuration is needed in any environment.
- [x] **Migrations/data changes.** None. No Prisma schema, migration, or API change.
- [x] **Rollback plan concrete.** See below.

## Rollback plan

The change is client-only and stateless (it alters which cached queries get marked
stale), so reverting the commit fully restores prior behavior.

```
git fetch origin
git switch -c revert/floor-plan-cache-keys origin/main
git revert --no-edit <squash sha>
git push -u origin revert/floor-plan-cache-keys
gh pr create --base main --title "revert: floor-plan cache-key fix" --body "Reverts <squash sha>."
# merge once CI Gate is green; deploy-static.yml redeploys apps/hospitality on the push to main
```

Per repo policy (deploy via CI only), no manual `wrangler` deploy. If the revert's push
to `main` does not trigger `deploy-static.yml`, dispatch it:
`gh workflow run deploy-static.yml --ref main`.

## Release log

1. `git rebase origin/main` (onto `18b3d1d96`) → rebase paused once: the post-commit
   `pack-changed` hook regenerated `apps/hospitality/llms*.txt` in the working tree, which
   blocked picking the docs commit that carries those same files. Confirmed the regenerated
   files were identical to that commit's copies (`diff -q` clean for both), discarded them,
   `git rebase --continue` → rebased cleanly. Non-docs patch-id unchanged (see assumptions).
2. Gates on the rebased head → tests 2544/0 failures, typecheck exit 0.
3. Push, PR, reviewer-verdict comment, CI Gate, squash merge, deploy → pending at the time
   this file was committed. Written back 2026-10-08 (see Outcome): PR #6140; root
   `llms*.txt` regen committed as `0bc168b46` after the pre-push hook rejected stale root
   llms files; `reviewer` re-run on that head → pass 9/10, `issues: []`.

## Post-release checks

- `deploy-static.yml` run on the squash SHA, job-level conclusion of the hospitality
  deploy job (not just the workflow conclusion, which can report success on a skipped
  job) → run `37677051612` (push, `cbb97b638`): Deploy Hospitality **success**,
  Post-Deploy Verification **success**, Report Deploy Health **success**; Marketing and
  Rialto Web skipped (paths filter, expected).
- Behavioral smoke on production (activate a floor plan / drag-save positions / add a
  table, and confirm the detail view refreshes without a reload) → requires an
  authenticated Auth0 session; not performable by the autonomous run. Regression tests
  pin the behavior with a real `QueryClient`; the prod confirmation is left to Operate.

## Outcome

**Released 2026-10-07.** Written back 2026-10-08 in a follow-up docs PR, because this file
shipped inside the PR it describes.

- PR: #6140, squash-merged `cbb97b6380b37bef251000b87020d25f98189f23` at
  2026-10-07T19:46:42Z (`--match-head-commit`, explicit `--subject`).
- CI Gate: run `37676211250` → success on final head `0bc168b46`.
- Reviewer gate: pass 9/10 on `0e2489c3b`, re-run pass 9/10 on `0bc168b46` (head gained
  only a byte-identical llms regen).
- Deploy: run `37677051612` → Deploy Hospitality success.
- Not yet confirmed: the behavioral smoke on production (Auth0-gated) — left to Operate.
