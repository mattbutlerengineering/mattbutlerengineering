---
stage: ship
run: feature:availability-config-usability
date: 2026-11-04
outcome: prepared
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8237
assumptions:
  - "Release authorization is the brief's PREPARE AND STOP: rebase, push the branch, open one non-draft PR. No merge, auto-merge, labels, reviewers, comments, deploy, tag, publish, workflow dispatch, or any migration/backfill/collapse --apply against a real database."
  - "launch_demo.py config printed NONE (0 problems), so no launch video or copy was produced."
  - "Secrets scan: gitleaks is not installed, so the regex scan over the added lines of `git diff origin/main...HEAD` was used (AWS/GitHub/OpenAI/Slack/Google key shapes, JWT shape, PRIVATE KEY blocks, and password/secret/passwd/api_key/token literals assigned a string). It found nothing. A regex scan is weaker than gitleaks."
  - "Verification named in the brief as 3349496dd; the rebase rewrote every branch commit, so the same verify commit is now 775762bab and the review commit c0bcf4637. The code under test is unchanged (the 2 new main commits touch only metrics and ACMM files)."
  - "The heavy suites (unit, reservations integration, e2e, Migration Dry-Run, Docker build) were not re-run locally after the rebase: see Release log 3."
  - "The PR body refresh (Release log 13) is part of preparing the release under the brief's PREPARE AND STOP; it was not asked live. `gh pr edit --body-file` failed on the Projects (classic) GraphQL deprecation error and changed nothing, so the same body file was written with `gh api -X PATCH repos/.../pulls/8237 -F body=@file`, which edits only the body."
  - "origin/main moved from bb5009f60 to dc7cecc5c, one file (`metrics/production-health/2026-11-04.jsonl`, +1 line). It does not overlap the run's files, so no merge was done and the local-ci-precheck lanes were not re-run (Release log 10)."
  - "The Visual Regression (hospitality) baseline was not regenerated: it needs a `visual-noise-floor.yml` dispatch (`app: hospitality`), which this run may not take. It is listed in the PR body as an Owner step, preferably before merge. The failing job is advisory and never moves CI Gate."
  - "CI watch ended when CI Gate reported (about 25 minutes after the push); `Capture E2E Screenshots` was still pending then. It is not a CI Gate input; its final state is not recorded."
---

# Release: availability config usability: one regular week that can differ by day

## Pre-flight

- [x] **Soft gate.** `review.md` Verdict: "No critical or major finding is open, and none was introduced by the fix loop: Majors 1, 2 and 3 are fixed (716319fd1, 799e11c04, cdba16575)." It is a read-only review, "not an unqualified pass". No unfixed critical, so no override is needed.
- [x] **Verification green.** `verification.md`: 39 criteria, 37 PASS, 2 NOT RUN, 0 FAIL. NOT RUN (1) is the Owner-only human-timed five-minute walkthrough (PRD 12); NOT RUN (2) is E11, the real Auth0 `auth.setup.ts` e2e login (CI only). The known pre-existing flake is the e2e `Escape on Go to date puts focus back on the menu button` (1 of 60 here and on this branch, 2 of 60 on origin/main in the fix loop; cause not investigated).
- [x] **No secrets in the diff.** Regex scan (gitleaks not installed) of the added lines of `git diff origin/main...HEAD` (184 files, 18091 insertions): no matches.
- [x] **Configuration.** The only added `process.env` reads are `process.env.DATABASE_URL` in two integration tests (`collapse-day-named-schedules.integration.test.ts`, `availability-day-scope.integration.test.ts`). No `import.meta.env` reads. Production reads no new variable; no new configuration is needed in the target environment.
- [x] **Migrations.** Forward path tested: Verify E2 ran `db:migrate:deploy` as `rls_owner` on a fresh Postgres twice ("All migrations have been successfully applied", then "No pending migrations to apply"), checked both columns, `rls-force-coverage` (22 passed) and `prisma-enum-drift`. Additive: `20261103120000_add_schedule_service_day_scope` is two `ADD COLUMN`s with constant defaults (`weekdays INTEGER[] DEFAULT ARRAY[]::INTEGER[]`, `day_hours JSONB NOT NULL DEFAULT '{"version":1,"sets":[]}'`). `node scripts/check-destructive-migrations.js`: "PASS: No unapproved destructive migrations found." CI's Migration Dry-Run job runs on the PR.
- [x] **ADRs.** ADR-031 has a free number on `origin/main` (bb5009f60: the highest ADR there is ADR-030; no `ADR-031*` file) and a row in `docs/adr/README.md` (line 39, status `provisional`). It is provisional and an Owner call to confirm or supersede (review Minor 12).
- [x] **Rollback plan** is below, with the door and blast radius the PR body states.

## Rollback plan

Door: two-way for the schema (additive columns). It becomes one-way for data once a real venue saves a varied week, because a revert leaves the columns unread, and old code would then offer times on days a service does not run.

Blast radius: every venue's availability config, booking slots and the agent chat tools. Merging deploys the migration to production through the `PRE_DEPLOY` job.

```
# 1. Before any venue has saved a varied week: a plain revert is clean.
git fetch origin main
git switch -c revert/availability-config-usability origin/main
git revert <squash-commit-sha>          # the squash commit on main (a single-parent commit)
git push -u origin revert/availability-config-usability
gh pr create --base main --head revert/availability-config-usability --title "revert: availability config usability"
# Merging the revert redeploys the old code. The two columns stay in the database:
# they are additive with defaults, the old code ignores them, and NO down-migration is run.
# Do not drop the columns while any row may carry data (weekdays / day_hours).

# 2. After a venue has saved a varied week: check what the revert leaves behind (read-only SQL).
#    Rows that carry a day scope or per-weekday hour sets:
#    SELECT venue_id, schedule_id, venue_service_id, weekdays, day_hours
#      FROM schedule_services
#     WHERE cardinality(weekdays) > 0 OR day_hours <> '{"version":1,"sets":[]}'::jsonb;
```

After the revert, those rows hold hours the old code no longer reads: it would offer the base hours on every day the assignment covers, including days the service does not run. The Owner must check that list venue by venue before the revert merges, and either re-enter those days as day-named schedules in the old model or leave this change in place and fix forward. The collapse script (`pnpm db:collapse-day-named-schedules`) is not part of a rollback; its `--apply` folds day-named schedules into the new shape and is the Owner's alone.

## Release log

1. `git fetch origin main && git rebase origin/main` → origin/main is `bb5009f60`; the branch was 73 commits ahead. "Successfully rebased and updated refs/heads/feat/availability-config-usability." No conflicts, so nothing generated needed regenerating. Old head `f39dc8862`, new head `c0bcf4637`.
2. Local-ci-precheck lanes after the rebase, in the worktree:
   - `pnpm install --frozen-lockfile` → "Done in 3.1s", exit 0.
   - `pnpm lint` → "✖ 230 problems (0 errors, 230 warnings)" in hospitality; "Tasks: 45 successful, 45 total", exit 0 (44 of 45 turbo cache hits).
   - `pnpm typecheck` → "Tasks: 45 successful, 45 total", exit 0 (44 cached).
   - arch-audit → "Checking codebase against 1 active ADRs... ✅ No architectural violations detected." and "✅ All external dependencies are consistent across the monorepo.", exit 0.
   - drift → `pnpm graph` + `pnpm generate:dep-graph` + `git diff --exit-code` on both graphs: exit 0; `pack <dir> --check` (relative dirs) for all 21 `llms.txt` dirs: each "is in sync".
   - `pnpm check:i18n-catalogs` → "PASS: Every translation catalog matches its en-US keys, placeholders and plural forms."
3. Heavy suites not re-run after the rebase. `git diff --stat f39dc8862...origin/main` (what the 2 new main commits changed; they touch only metrics and ACMM files, no code these suites cover): `.claude/acmm/state.json`, `.claude/improvement-loop/log.md`, `apps/marketing/public/acmm-report.json`, `metrics/ui-quality-findings.json`, `metrics/ui-quality-ledger.jsonl`, `metrics/ui-quality-ratings.jsonl`, `metrics/ui-quality-runs.jsonl` ("7 files changed, 110 insertions(+), 84 deletions(-)"). CI runs them on the PR.
4. `python3 .../launch_demo.py config` → `NONE` / "launch-demo: 0 problem(s)", exit 0. Nothing produced.
5. `git push -u origin feat/availability-config-usability` → new branch created, "ok feat/availability-config-usability", exit 0. The pre-push hooks ran and passed: "Checking 1 new migration file(s) for destructive operations... PASS: No unapproved destructive migrations found."; the antipattern scan ("All patterns within baseline. No regressions detected."); then "pre-push: building CLI for regen..." and "pre-push: regenerating generated artifacts..." (regen all artifacts, then `regen.mjs --check --git-only`). GitHub reported 2 Dependabot alerts on the default branch (1 moderate, 1 low), not from this change.
6. `gh pr create --base main --head feat/availability-config-usability` (non-draft; no labels, reviewers or comments) → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8237. Its body carries `Closes #7738`, the `No work order:` line, the data-model diff, the evidence, `## Merge danger` and `## Owner steps after merge`.
7. Hiccup: the PR body was first written to a file inside the worktree, then moved to `/tmp` before `gh pr create`, so it was never staged.
8. Committed this file as `docs(availability-config-usability): ship — prepared, PR #8237 awaits the Owner's merge` and pushed (hooks ran again and passed; the push updated the PR). The PR then showed the label `tier:critical`, which this run did not add (the repo's change-tier classification applied it); no reviewers, no auto-merge, not a draft.
9. First draft of step 5 here wrongly said no pre-push hook output was printed; corrected in a follow-up commit.
10. Main moved? `git fetch origin main` → origin/main is `dc7cecc5c` (was `bb5009f60`). `git diff --stat bb5009f60..origin/main` → one file, `metrics/production-health/2026-11-04.jsonl` ("1 file changed, 1 insertion(+)"). No overlap with the run's files: no merge, no precheck re-run.
11. CI on PR #8237 at the first pushed head 7b5e1d375 failed Build (`no-circular`), Lint (knip `Unused exports (1)`), Test (Node 22, rest) (`assert-vitest-ran`) and the advisory Visual Regression (hospitality). Routed back from Ship to Implement for a CI fix loop: a369a207d..004c8881a (cycle fix 9086ddbda, `toClock` export 62bfbf3d0, RLS-job suites bb0aff96f, size budget 004c8881a, the last found by the local Build replica past where CI stopped). Re-verify d3013ffb7 (38 PASS, 2 NOT RUN, 0 FAIL; E13 local replica of Build, Lint and Test (rest) green) and re-review 586448c79 (no critical or major open; Minors 16 and 17 deferred).
12. `git push origin feat/availability-config-usability` (normal, no force) → "7b5e1d375..586448c79 feat/availability-config-usability -> feat/availability-config-usability", exit 0. The remote lines shown were GitHub's "found 2 vulnerabilities on the default branch (1 moderate, 1 low)" notice; the pre-push hook lines scrolled off the captured output and are not quoted here.
13. PR body refreshed: `gh pr edit 8237 --body-file` failed with the Projects (classic) GraphQL deprecation error and did not change the body (confirmed: no "CI fix loop" heading); the same file went through `gh api -X PATCH .../pulls/8237 -F body=@file` (7170 characters). Added: a "CI fix loop" section (the fixes, the local-replica evidence), the Visual Regression (hospitality) baseline Owner step (`visual-noise-floor.yml`, `app: hospitality`, commit the `visual-actuals-replica-a` baselines), and Minors 16 and 17 in the deferred list. `Closes #7738`, `No work order:` and `## Merge danger` are unchanged.
14. CI watch on head 586448c79 (`gh pr checks 8237`, about 25 minutes), final states: `CI Gate` pass; Build pass (2m51s); Lint pass (1m36s); Test (Node 22, rest) pass (1m48s); Test (Node 22, hospitality) pass (7m31s); Test (Node 22, reservations) pass (8m3s); Test (Node 22, rialto) pass (39s); Migration Dry-Run pass; Hospitality E2E shard 1 pass (16m10s), shard 2 pass (11m46s), shard 3 pass (13m38s) (these run the real Auth0 `auth.setup.ts`, so E11 is now PASS at 586448c79); `Capture E2E Screenshots` pending at the end of the watch (not a CI Gate input).
15. One failure remains: `Visual Regression (hospitality)` fail 3m26s (https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/41847146649/job/126633670107). `--log-failed`: "Error: expect(page).toHaveScreenshot(expected) failed / Snapshot: availability@1280x720.png" (and `availability@375x812.png`), at the `toHaveScreenshot` call. Attributable to this change: the availability page is what the change redesigned, so its baselines are stale. The job is advisory and never moves CI Gate. Not fixed here (needs the `visual-noise-floor.yml` dispatch).

## Post-release checks

Not performed: nothing has shipped; the pull request waits on the Owner's merge. Observed on the PR at head 586448c79: CI Gate pass, Build, Lint, Test (rest) and the three Hospitality E2E shards pass; Visual Regression (hospitality) fails (advisory). Before the merge, the Owner: runs `visual-noise-floor.yml` with `app: hospitality` on this branch and commits the `visual-actuals-replica-a` hospitality baselines. After the merge:

- The `db-migrate-reservations` `PRE_DEPLOY` job succeeded (migration `20261103120000_add_schedule_service_day_scope` applied).
- The deploy is healthy (reservations, agent, hospitality).
- Smoke check of the availability page on the deployed hospitality app: it loads, shows the regular week and the guest-view strip.
- Owner steps: the human-timed walkthrough (at most 5 minutes, PRD 12); the collapse script dry run then `--apply` against production; confirm or supersede ADR-031.
- Fix runs: not applicable (a feature run).

## Outcome

Prepared and stopped: waiting on https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8237 (`pending-merge:`). `CI Gate` is green on the new head 586448c79 (Build, Lint, Test (rest) and Hospitality E2E shards 1 to 3 pass); the advisory Visual Regression (hospitality) still fails pending an Owner baseline regeneration. Nothing was merged, deployed or applied.
