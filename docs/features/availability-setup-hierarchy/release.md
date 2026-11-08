---
stage: ship
run: feature:availability-setup-hierarchy
date: 2026-11-08
outcome: prepared
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8511
assumptions:
  - "No release authorization in this conversation: the Owner asked to keep working and make improvements, not to merge to production. Ship is prepare-and-stop: branch pushed, pull request opened, merge left to the Owner."
  - "The 2026-11-07 hub work already reached main as nine merged PRs (#8483-#8489, #8493, #8499) with no release.md; this release covers the amendment plus the run's artifacts, which have never been on main."
---

# Release: Availability setup hierarchy — calm, consistent Availability

## Pre-flight

- [x] Verification green: `verification.md` has no unresolved failures. It has 3 NOT RUN items (criteria 2, 3 and 9: the `7c051456f` baselines, the Owner's hand timing, and the hub demo as one script), recorded as gaps, not passes.
- [x] No secrets in the diff (`git diff a885014ff..HEAD` scanned for key, secret, password, token and private-key patterns). The only hits were a throwaway local harness's fake JWT that `pnpm regen` had embedded in `llms-full.txt` from an untracked file; the harness was deleted and the files regenerated (`23903d2f6`). No new configuration is needed in any environment.
- [x] No migrations or data changes (no `migrations/`, `schema.prisma`, `*.sql` in the diff). Saves use the existing `PUT …/availability/config` with the payload the drawer's "Start today" already sent (hook payload-parity test).
- [x] No ADR added (architecture.md amendment: every decision is a two-way door).
- [x] Rollback plan concrete (below).

## Rollback plan

Door: two-way. A revert restores the previous page. There is no migration, schema, API or engine change. The Rialto change is a changeset file; no package version is published by this merge.

Blast radius: every Manager opening `/availability` sees the new first screen, and a regular-week edit there applies from today unless they choose Starting later…. Hosts see today's page plus History and Go to date in a ⋯. Rialto `Calendar`/`DatePicker` consumers with no value and a future `min` open on that month. If the call is wrong, Managers notice on their next visit; no stored data needs repair, because each regular-week save stays in History with Undo.

```
# Undo the merge (after PR #8511 merges as a merge or squash commit <sha>):
git checkout main && git pull
git revert -m 1 <sha>        # squash merge: git revert <sha>
git push origin HEAD:refs/heads/revert-8511 && gh pr create --base main --head revert-8511 \
  --title "revert: Availability layered page (#8511)" --body "Rollback of #8511 per docs/features/availability-setup-hierarchy/release.md"
# deploy-static.yml redeploys apps/hospitality on merge of the revert; no data step.
# A regular-week change a Manager saved from the new page stays valid on the old page (same rows);
# to undo one, use Availability → History → Revert, as before.
```

## Release log

1. `git merge origin/main` (7 commits, incl. #8508 "one availability-problem parser") → clean merge; re-verified on the merged tree: typecheck exit 0; `vitest` 411 files / 5709 tests passed; `pnpm regen --check` up to date; e2e draft, regular-week, scenarios, dead-ends and setup-hierarchy: 111 of 112 passed.
2. The one e2e failure, "Escape on Go to date puts focus back on the menu button (desktop, fr-CA)", was classified by repetition. On this branch, 5 repeats × 4 variants: 18 passed, 2 failed. On a clean `origin/main` worktree (deps built with `turbo run build --filter=@mbe/hospitality^...`), the same repeat: 18 passed, 2 failed, both desktop fr-CA. Pre-existing race, not introduced here; seeded in `docs/backlog.md` (`7be5f1a40`). An earlier baseline attempt failed 20/20 because `@mbe/api-client` was unbuilt in the fresh worktree; that run was discarded, not counted.
3. `node scripts/check-ai-antipatterns.mjs` → "All patterns within baseline" (hardcodedRoutes 873/875, anyType 265/271 improved).
4. Launch brief: `python3 …/launch_demo.py config` printed `NONE` and `launch-demo: 0 problem(s)`, so nothing was written.
5. `git push -u origin feat/availability-setup-hierarchy` with hooks (destructive-migration check, AI antipattern ratchet, regen) → exit 0; remote `7be5f1a40` = local HEAD.
6. `gh pr create --base main` → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8511. Merge danger: two-way, matching this plan.
7. A follow-up push (`cf6adb3bd`, this file) first failed silently: `git push … | grep` broke on grep's arguments and the push never ran (remote still `7be5f1a40`). It was re-run without a pipe → exit 0; remote `cf6adb3bd` = local.
8. The repo's CI automation pushed two commits onto the branch after `cf6adb3bd`. `7e4407b23` prettier-formatted this run's docs. `266a55dd7` fixed a chunk-coverage gate failure: it gave the new shared `ScheduleFormParts` chunk a 3 kB budget and dropped budgets for `conflict-problem` and `use-discard-guard`, which #8508 hoisted away. Both were reviewed here: formatting only, and a size-limit change in `apps/hospitality/package.json` that matches the chunks the amendment created and removed. PR CI on `266a55dd7`: 60 pass, 6 skipping, 1 pending (Capture E2E Screenshots, advisory), 1 fail. Hospitality E2E shards 1-3 pass with the real Auth0 session (run 42484202722), as do Test (Node 22, hospitality), Typecheck, Lint, CI Gate, the AI antipattern ratchet and three of four visual suites. The failure is Visual Regression (hospitality), which is advisory: `availability@1280x720`, `availability@375x812`, `setup@1280x720` and `setup@375x812` differ. These are exactly the two screens this run changed (the layered page; the hub's service wording and "Add a schedule…"). Merge state `MERGEABLE`, `UNSTABLE` only because of that advisory check. My first push of this entry was rejected because the remote had moved; I rebased onto `266a55dd7` and pushed again.
9. Stopped: no merge without the Owner.

## Post-release checks

- Not run: nothing has reached users. Once #8511 merges and `deploy-static.yml` deploys `apps/hospitality`, the write-back checks:
  - https://mattbutlerengineering.com/hospitality/availability as a Manager opens on Schedules with the regular week in the form and 7 controls outside it;
  - Calendar and Special dates are one click away;
  - a Host's page shows Calendar, Special dates and a ⋯ with History and Go to date.
- Visual baselines: PR visual regression is advisory, and the repo never regenerates baselines on a PR branch (`visual-regen-trigger.yml`). After merge, the Apps Visual Regression run on `main` fails on the four screens above, and `visual-regen-trigger.yml` dispatches `visual-baseline-regen.yml` for hospitality, which opens a `needs-review` PR with the new PNGs. The Owner approves that PR by looking at the images; it is expected, not a regression.

## Outcome

Prepared and stopped, waiting on the pull request named in `pending-merge:` (#8511). The run stays at Ship until the merge is written back (`outcome: released`, `released-at:`).
