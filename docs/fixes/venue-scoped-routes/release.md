---
stage: ship
run: maintenance:venue-scoped-routes
date: 2026-11-02
outcome: released
released-at: 2026-11-03T03:26:14Z
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8173
assumptions:
  - "Merge authorization for the write-back: Matt gave in-session permission on 2026-11-02 to merge any PRs; PR #8173 was merged under it. The earlier prepare-and-stop rule (autorun-brief.md, Resume 2026-11-02) applied to the prepare pass and is superseded for this merge."
  - "Release authorization for this resume is prepare-and-stop (autorun-brief.md, Resume 2026-11-02, and the run's 'STOP before merging any PR' rule). No merge, deploy dispatch, publish, tag, issue comment or auto-merge was done."
  - "This run's code reached main through six already-merged squash PRs (#6132, #6193, #6224, #6323, #6363, #6365). Ship does not re-release it. What is pending is the artifact PR #8173, which changes only docs/fixes/venue-scoped-routes/."
  - "No tracker intake issue exists for this run (brief: Tracker none), so the skill's close-the-intake-issue step does not apply."
  - "No docs/launch-demo.json exists in the repo, so the launch-brief hook does nothing."
  - "Operate is skipped per the brief ('operate: skip — no retro this run')."
---

# Release: venue-scoped-routes — artifact PR #8173 (code already on main)

## Pre-flight

- [x] **Verification green.** `verification.md` (2026-11-02, on origin/main `77f84aca5`): 11 PASS, 0 FAIL, 1 RETIRED (C12, Matt's 2026-10-10 ruling). C1 and C9 first failed on a loaded host and passed on re-run.
- [x] **Review has no unfixed critical.** `review.md`: PR 5 and PR 6 PASS, no critical, no major. Four minors (M-1..M-4) and two suspicions (S-1, S-2) are deferred, each with a reason. Soft gate met.
- [x] **No secrets in diff.** The diff against origin/main is four files under `docs/fixes/venue-scoped-routes/` plus this one (`git diff --name-only origin/main..HEAD`). A grep of added lines for `secret|token|password|api key` hit only review/verification prose, no values. No config is required in a target environment, since this PR deploys nothing.
- [x] **Migrations/data changes: none.** No `migrations/`, `*.sql` or `schema.prisma` in either PR 5 or PR 6 (review.md, Domain passes). The brief's non-additive-migration stop does not trigger.
- [x] **ADR numbering: nothing owed.** The run added no new ADR. It appended dated amendments to ADR-020 and ADR-026 (review.md, Design pass), so no number to check and no index row to add.
- [x] **Rollback plan concrete** (below).
- [x] **Branch current.** Fetched origin/main (`53291ee1e`, a metrics-only commit on top of `77f84aca5`); rebased the branch onto it cleanly; `git push -u origin docs/venue-scoped-routes-autorun` ran the pre-push hooks with no failure.
- [x] **Open PRs.** The brief's 2026-11-02 pre-flight: #8005, #8157 (chaos-agent synthetic, never merge), #8160, #8166, #8167, #8168 open, none approved, none blocking.

### Did the code reach production?

Determined from workflow runs on the merge commits (`gh api repos/.../actions/runs?head_sha=<sha>`), not assumed.

| PR    | Merge commit | Parents         | Deploy Services run            | Jobs                                                                                        |
| ----- | ------------ | --------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| #6363 | `3cf46fd12`  | 1 (`77e87ec06`) | 38203416651, push, **success** | Deploy API Services success; Post-Deploy Verification success; Report Deploy Health success |
| #6365 | `033669bcf`  | 1 (`d916a2a05`) | 38459405158, push, **success** | Deploy API Services success; Post-Deploy Verification success; Report Deploy Health success |

- **CI on #6365's merge commit was red.** `CI` push run 38459405120 concluded **failure**: jobs `AI Antipattern Ratchet` and `CI Gate` failed. Deploy Services 38459405158 still reported success with its `Wait for CI` job green. I did not investigate why that gate passed, and I make no claim about the ratchet's content. The same commit's other runs: `Release` 38459405246 success, `ADR check` 38459405243 success, `Secret Scan` 38459405264 success, `Post-Merge Reconciliation` 38459405358 cancelled.
- **Later main state.** The latest `Deploy Services` run on main is 41527058138 (`77f84aca5`, 2026-11-02T21:17:56Z), **success**. `CI` push run 41527058354 on `77f84aca5` is **success**. 145 commits touched `services/reservations` after `033669bcf`, so the deployed image is not byte-identical to #6365's.
- **Not determined.** Run conclusions show the deploy workflow's jobs passed. I did not probe production itself (no authenticated staff JWT was available), so the end-user behaviour of the PR 5 availability ruling remains unobserved (review.md S-2). Reading: the code was deployed per CI; production behaviour is not independently observed.
- The six PRs are all single-parent squash commits on main (`git rev-list --parents -n1` returned two hashes each: `935567ee2`, `af02f5f2c`, `2187e981c`, `21f9ed1bb`, `3cf46fd12`, `033669bcf`).

## Rollback plan

Two separate things can roll back.

**A. The artifact PR #8173 (what this release pends on).**

Door: two-way — docs-only; nothing deploys from it.

Blast radius: none to users. It touches only `docs/fixes/venue-scoped-routes/`.

```
# before merge: close the PR without merging
gh pr close 8173
# after merge: revert the squash commit (single parent)
git revert --no-edit <merge-sha-of-8173>
```

**B. The code already on main (six PRs; not part of this release, recorded so the next reader has the commands).**

Door: two-way in git, but costly. Each PR is a single-parent squash commit, so `git revert` works without `-m`. The revert must go newest first. Later work builds on the module: seven route files added after 2026-10-17 (`menus`, `closures`, `availability-config`, `availability-changes`, `tonight`, `venue-team`, `floor-plan-sections`) declare scope through `venueScoped`, so reverting PRs 1-4 conflicts with them and would break them. The safe, narrow rollback is PR 6 then PR 5 only. A deploy follows from the paths filter in `deploy-services.yml` (`services/reservations/**`).

Blast radius: authorization and RLS context on the reservations service (ADR-020, ADR-026). Reverting PR 6 restores the global venue-context hook; reverting PR 5 restores `events/test` and the old availability and holds checks. A wrong revert can open or close venue access for the routes those PRs touch.

```
git fetch origin main
git switch -c revert/venue-scoped-routes-pr6-pr5 origin/main
git revert --no-edit 033669bcfdca7083dd84e8f521aa7e40e65fe7a4   # #6365 (PR 6)
git revert --no-edit 3cf46fd12f3bec8fa5828b8526359479b3875f5b   # #6363 (PR 5)
# resolve conflicts with the 145 later reservations commits, then:
pnpm --filter @mbe/reservations test && pnpm --filter @mbe/reservations typecheck
# RLS sweep needs DATABASE_URL (CI job `rls-integration`)
# open a PR; deploy-services.yml redeploys on merge.
# Full rollback only if needed, newest first (conflicts expected):
git revert --no-edit 21f9ed1bbe6062eab137bfbbfdbbbfd9530b8ff9   # #6323
git revert --no-edit 2187e981c848108a1e3453db0dbcb47b4a8b5e84   # #6224
git revert --no-edit af02f5f2c30dc5c001a5b86fa6843c01b51b42ff   # #6193
git revert --no-edit 935567ee23870c7b87f9cf5f9e96ef65b0909b22   # #6132
```

## Release log

1. `git fetch origin main` → origin/main moved `77f84aca5` → `53291ee1e` (one metrics-only commit).
2. `git rebase origin/main` → clean; four run commits replayed.
3. `git push -u origin docs/venue-scoped-routes-autorun` → new branch pushed, pre-push hooks ran, no failure.
4. `gh pr create` (non-draft, base main, no `Closes` line) → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8173.
5. `gh pr view 8173` → `state OPEN`, `isDraft false`, `autoMergeRequest null`, no labels, `MERGEABLE`.
6. Deploy lookups for `3cf46fd12`, `033669bcf` and the latest main push → see the table above.
7. Not done, by authorization: merge, deploy dispatch, publish, tag, changeset release, issue comments, auto-merge.
8. Write-back: `gh pr view 8173 --json state,mergedAt,mergeCommit` → `MERGED`, `mergedAt 2026-11-03T03:26:14Z`, merge commit `3e1ba31c661159bb70c08c04e6d1aeb26e5e92ea`. Rewrote `outcome: prepared` → `released`, added `released-at:`, kept `pending-merge:`.

## Merge and release steps for Matt

1. Read PR #8173 and `review.md`. Decide M-2 (floor-plans membership ruling: 200 empty page today vs 403 for a non-member naming a foreign venue) and M-4 (`enterWith` `prohibited_patterns` entry in ADR-026 frontmatter).
2. Merge: `gh pr merge 8173 --squash --subject "docs(venue-scoped-routes): implement gates, verify, review, ship artifacts (autorun)"` once `CI Gate` is green on the final head. The run's own rule keeps this merge with Matt.
3. Nothing deploys: the diff touches no path in `deploy-services.yml`'s filter, no tag, no publish.
4. After merge: re-read the PR (`gh pr view 8173 --json state,mergedAt`), then rewrite this file's `outcome:` to `released` and add `merged` information (the protocol's Ship write-back). Operate is skipped per the brief.

## Post-release checks

- Not applicable for the artifact PR (docs-only, no deployed surface). For the code: deploy workflow conclusions above are the evidence. Production behaviour was not probed (S-2).

## Outcome

Released. PR #8173 (the artifact PR, docs-only) merged at 2026-11-03T03:26:14Z as squash commit `3e1ba31c661159bb70c08c04e6d1aeb26e5e92ea`, confirmed by `gh pr view 8173 --json state,mergedAt,mergeCommit` → `state MERGED`. The merge was made under Matt's in-session permission of 2026-11-02 to merge any PRs, which satisfies the run's rule that merges stay with Matt. The code itself was already on main through six merged PRs (#6132, #6193, #6224, #6323, #6363, #6365) and its deploy runs succeeded per CI. CI on #6365's merge commit had a red `AI Antipattern Ratchet`/`CI Gate` run, recorded above and not resolved by this stage. review.md's open minors (M-1..M-4) and suspicions (S-1, S-2) remain as recorded. No deploy, publish or tag was needed; operate is skipped per the brief.
