---
stage: ship
run: feature:venue-availability
date: 2026-10-26
outcome: prepared
pending-merge:
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7671
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7674
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7689
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7690
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7691
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7675
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7698
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7700
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7699
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7702
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7703
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7704
  - https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7705
assumptions:
  - Release authorization was not given (autorun-brief.md § Release), so this is prepare-and-stop. Nothing was deployed, merged, tagged or backfilled by this stage.
  - The run's code is already serving in production. Every PR merged for #7493 was deployed by `Deploy Services` on push to main (deploy-via-CI policy), so "the release" here is the merge train of fixes below, plus the Owner-only backfill. There is no feature flag.
  - The review's six major findings are treated as fix-before-ship, not deferred. Each has a fix PR; none is merged. The Owner has not deferred any of them.
  - The pre-flight was run against origin/main at 1e88465c9, because the final branch head (main after the merge train) does not exist yet. It must be re-run on that head.
  - That migration `20261025000000_add_venue_availability` is applied in production is inferred from deploy evidence (below), not read from the production database. This stage has no production database access.
  - `pending-merge:` lists every PR in the train, not one URL, because Ship is complete only when all of them have merged.
---

# Release: Venue availability configuration, Phase 1

**Status: BLOCKED.** Ship waits on 13 open PRs, each awaiting an Owner merge (this session's permission classifier denied merges). After they land, the pre-flight must be re-run on the resulting main head, then the Owner runs the backfill.

## Review verdict and how each finding is carried

Review verdict (review.md, PR #7689, not yet merged): **"not ready to ship as is"**, because of six major findings. No critical findings.

State at time of writing, as given to this stage:

- Each major finding now has a PR with a passing review and green CI Gate, all awaiting an Owner merge (the session's classifier denied merges): R1 #7676 → PR #7698; R2 #7677 → #7691; R3 #7678 → #7700; R4 #7679 → #7702; R5 #7680 → #7690; R6 #7681 → #7699.
- Also open and reviewed: #7671 (fast-uri CVE floors), #7674 (locale-sweep E2E), #7675 (#7644 notice urgency), #7689 (review.md), #7703 (#7684 agent tools), #7705 (#7686 Close/Tonight 409 UI), #7704 (#7697, in re-review).
- Suggested merge order: #7671, #7674, #7689, #7690, #7691, #7675, #7698, #7700, #7699, #7702 (#7675 before #7699; both touch closure-notice-service.ts), then #7703, #7704, #7705.
- Minor findings deferred to issues #7682–#7688, #7696.

### Re-verified PR state (2026-10-26, `gh pr view <n> --json state,mergeable,mergeStateStatus,statusCheckRollup,labels`)

| PR    | Carries             | State | Mergeable | Merge state | CI Gate     | Other failing checks (advisory)                    | Labels                         |
| ----- | ------------------- | ----- | --------- | ----------- | ----------- | -------------------------------------------------- | ------------------------------ |
| #7671 | fast-uri CVE floor  | OPEN  | MERGEABLE | CLEAN       | SUCCESS     | none                                               | tier:sensitive, agent-authored |
| #7674 | locale-sweep E2E    | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | Visual Regression (hospitality)                    | tier:trivial, needs-review     |
| #7689 | review.md           | OPEN  | MERGEABLE | CLEAN       | SUCCESS     | none                                               | tier:trivial                   |
| #7690 | R5 #7680            | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | Hospitality E2E                                    | tier:sensitive, needs-review   |
| #7691 | R2 #7677            | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | Hospitality E2E                                    | tier:standard, needs-review    |
| #7675 | #7644 urgency       | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | Capture E2E Screenshots, Visual Regression (hosp.) | tier:standard, needs-review    |
| #7698 | R1 #7676            | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | none                                               | tier:standard, needs-review    |
| #7700 | R3 #7678            | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | Hospitality E2E                                    | tier:standard, needs-review    |
| #7699 | R6 #7681            | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | Hospitality E2E                                    | tier:standard, needs-review    |
| #7702 | R4 #7679            | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | none                                               | tier:standard, needs-review    |
| #7703 | #7684 agent tools   | OPEN  | MERGEABLE | CLEAN       | SUCCESS     | none                                               | tier:sensitive, needs-review   |
| #7704 | #7697 past-midnight | OPEN  | MERGEABLE | BLOCKED     | not yet run | 4 checks in progress, 40 success, 8 skipped        | tier:standard, needs-review    |
| #7705 | #7686 409 UI        | OPEN  | MERGEABLE | UNSTABLE    | SUCCESS     | Visual Regression (hospitality)                    | tier:standard, needs-review    |

What the re-check found that differs from the stated state:

- **#7704 has no CI Gate result yet**: checks were still running, so it is not merge-ready. It is also still in re-review.
- **Every PR except #7671 and #7689 still carries `needs-review`.** That label is a merge hold in this repo. The Owner removes it as part of merging, after confirming the review on each.
- `Hospitality E2E`, `Visual Regression (hospitality)` and `Capture E2E Screenshots` are advisory, not part of `CI Gate`. The E2E failures are most likely the known locale-sweep regression that #7674 fixes, and the visual failures the pending baseline PR #7641, but this stage did not open those logs to confirm it.
- None of the 13 PRs adds a Prisma migration. #7671 is the only one touching a `package.json`.

## Pre-flight

The ship pre-flight is the `local-ci-precheck` steps (`.claude/skills/local-ci-precheck/SKILL.md`) against the final branch head. **The final head does not exist yet**, so they were run against current origin/main (`1e88465c9`) in a fresh worktree, Node v22.22.3. They must be re-run on main after the merge train lands. Until then the pre-flight is not passed.

- [x] Step 1, `pnpm install --frozen-lockfile` → PASS ("Lockfile is up to date … Already up to date")
- [x] Step 2, `pnpm lint` → PASS (`Tasks: 45 successful, 45 total`)
- [x] Step 3, `pnpm typecheck` → PASS (`Tasks: 45 successful, 45 total`)
- [x] Step 4, architecture audit: `pnpm build --filter "@mbe/cli..."` (5/5 tasks), `mbe check-adr` → "No architectural violations detected", `mbe check-deps` → "All external dependencies are consistent across the monorepo" → PASS
- [x] Step 5, drift: `pnpm graph` + `pnpm generate:dep-graph`, then `git diff --exit-code` on both graph files → no diff; `mbe pack <dir> --check` for all 21 committed `llms.txt` directories → 21 OK, 0 drift → PASS
- [ ] **Re-run steps 1–5 on main after the merge train** → NOT RUN (blocked on the merges)

Ship's own pre-flight items:

- [ ] Verification green → **partly.** verification.md records 0 FAIL against a PRD criterion and one regression (locale-sweep E2E), fixed by #7674 (unmerged). CI on main is green: `CI` run 40309479042 at 47724863d, success.
- [x] No secrets in the diff (the docs-only diff for this stage; each fix PR passed its own CI and review). Target config: no new environment variable is introduced by the run (verification.md, review.md dependency pass).
- [x] Migrations have a tested forward path. `20261025000000_add_venue_availability` is additive only (review.md, Migrations pass), checked by `Validate Migrations` and `RLS Integration` in CI. The backfill has a golden test (verification.md § Migration). No PR in the train adds a migration.
- [x] ADRs. The run added ADR-029 and ADR-030. Both numbers are free on main and both have rows in `docs/adr/README.md` (lines 37–38).
- [x] Rollback plan is concrete (below).
- [ ] Production-only checks verification.md left open → NOT RUN (listed under Release steps 4–6).

## Release steps (Owner-only)

### 1. Merge the train

In the suggested order: #7671, #7674, #7689, #7690, #7691, #7675, #7698, #7700, #7699, #7702, then #7703, #7704, #7705. #7675 must land before #7699 (both touch `closure-notice-service.ts`; rebase #7699 after #7675 if it conflicts). Wait for #7704's CI Gate and re-review first.

For each PR: confirm the review, remove `needs-review`, then

```
gh pr merge <N> --repo mattbutlerengineering/mattbutlerengineering --squash --subject "<title> (#<N>)" --delete-branch
```

Each merge to main triggers `Deploy Services`, which deploys the reservations and agent services through DO (deploy-via-CI). No manual deploy is needed. After each one, check the job-level conclusion, because a workflow-level `success` can be a skipped deploy:

```
gh run list --repo mattbutlerengineering/mattbutlerengineering --workflow deploy-services.yml --limit 3
gh run view <run-id> --repo mattbutlerengineering/mattbutlerengineering --json jobs --jq '.jobs[] | [.name, .conclusion] | @tsv'
```

`Deploy API Services` and `Post-Deploy Verification` must both be `success`. Hospitality UI changes (#7674, #7704, #7705) deploy through the static-site workflow on merge; the manual fallback is `cd apps/hospitality && pnpm dlx wrangler@latest deploy`.

### 2. Re-run the pre-flight on the new main head

Steps 1–5 of `local-ci-precheck` against main after the last merge, plus a green `CI` run on that SHA. Record the results here.

### 3. Migration: already applied (confirm)

Evidence, read-only:

- #7554 ("availability schema migration") merged 2026-10-25T19:05:56Z as 284d56d3c.
- `Deploy Services` run 40224395652 (2026-10-25T19:05:58Z, that commit): Circuit Breaker Check success, Wait for CI success, Deploy Blocked skipped, **Deploy API Services success**, Post-Deploy Verification success.
- The DO app runs `db-migrate-reservations` as a `PRE_DEPLOY` job (`prisma migrate deploy`, `infrastructure/pulumi/index.ts`), and a failed pre-deploy job fails the deployment. Every later Deploy Services run is also green, most recently 40305706717 (2026-10-26T10:13Z).

So the migration is applied in production by inference. Confirm directly, without writing anything:

```
doctl apps list-deployments $DO_APP_ID
doctl apps logs $DO_APP_ID db-migrate-reservations --deployment <deployment-id>   # expect "reservations migrations complete."
```

### 4. Legacy-hours backfill (dry run, then apply)

`services/reservations/src/scripts/backfill-availability.ts` (documented in `services/reservations/docs/reference.md` § Availability backfill). It has never run against production. Until it runs, every production venue reads its legacy-derived configuration (`source: legacy`), which the golden test shows lists the same slots. Running it is therefore not urgent, but it is what the PRD's "every existing venue" Migration criterion needs.

From a console on the deployed reservations component (it has `DATABASE_URL`):

```
doctl apps console $DO_APP_ID reservations-api
# inside the container:
node --conditions production dist/scripts/backfill-availability.js            # dry run: reports only
node --conditions production dist/scripts/backfill-availability.js --apply    # writes
```

- Save the full output of both runs. Each line carries the venue's original `operatingHours`, so the log is the backup.
- Read the dry run's `summary` line before applying: `errors` must be empty. Look at every `unrecognised` venue (left untouched, keeps its legacy reads) and at `notes.pastMidnightWindows` for typos.
- Exit code 1 means a venue errored. Re-running is safe: venues with a regular schedule are skipped as `already_migrated`.
- Run it after the train has merged, so it runs on the latest code.

### 5. Production-only checks verification.md left open

- **Preview speed, p95 ≤ 1 s, end to end.** Time `POST …/availability/preview` against production (DO Managed Postgres, real network hop) on the largest venue, 20 or more calls, and record the p95. Only the spike (p95 190 ms on local Postgres) and the engine speed test exist.
- **Migration over every real venue.** The backfill dry run in step 4 is the check: every venue `would_migrate` or `already_migrated`, zero `errors`, each `unrecognised` venue explained.
- **Setup time, small.** A human-timed walkthrough by the Owner from an empty venue, without help text. NOT RUN.
- **Demo against the live backend.** Close a date with bookings on a test venue, choose cancel and notify, and confirm the notices arrive (SES and Twilio) and the refunds settle within 2 minutes.

### 6. Smoke check after the train

The booking widget lists slots for a venue, a hold and confirm succeed inside hours, and a hold outside hours gets 422 `outside-availability`. Check Sentry for new reservations-api errors for an hour after the last merge.

## Rollback plan

Door: **two-way for the code, one-way for what guests were told.** Every PR in the train, and every PR the run merged, is undone by a revert that CI redeploys. The migration is additive and the backfill only inserts, so neither has to be undone to roll the code back. But closure notices already sent, reservations cancelled by a closure, and refunds issued are real guest-facing actions that no rollback reverses.

Blast radius: every venue's booking paths on reservations-api (public widget, staff form, phone agent). A wrong gate either refuses bookings guests should get (lost covers, noticed by guests and Managers within minutes) or accepts ones it should not (double bookings or bookings under a closure, noticed at service). Closure mistakes reach guests by SMS and email.

### Per-PR revert (preferred)

```
git fetch origin && git switch -c revert/<N> origin/main
git revert --no-edit <merge-sha-of-#N>
git push -u origin revert/<N>
gh pr create --repo mattbutlerengineering/mattbutlerengineering --base main --title "revert: <title> (#<N>)" --body "Reverts #<N>. <why>"
```

Merge it once `CI Gate` is green; `Deploy Services` redeploys. Each fix PR is independent of the others except #7675 → #7699 (revert #7699 first if both go). Under the green-main policy an emergency revert is the one allowed exception to waiting.

### Feature-level rollback

There is no feature flag, and the run is about 60 merged PRs, so reverting it on main is impractical. If Phase 1 as a whole misbehaves in production:

1. In the DO console, roll the `mattbutlerengineering-api` app back to the last deployment before the problem (`doctl apps list-deployments $DO_APP_ID` gives the IDs). This changes only running code. Note it puts the deployed app out of step with main; follow it with reverts on main so the next CI deploy does not undo the rollback.
2. If the rollback reaches code from before #7554, the old code ignores the new tables and reads `Venue.operatingHours`, which the backfill never changes. That is safe.
3. Never roll back the migration. Prisma has no down migration here, and the tables hold Managers' saved configuration, closures, `closure_outcomes` and the `availability_changes` history.

### Data: what is safe to keep

- **Keep** all eight new tables and the new columns on `venues` and `reservations`. They are additive, and old code ignores them.
- **Keep** `Venue.operatingHours`. The backfill never writes it, and the config store keeps it as a derived projection.
- **Undoing the backfill**, if its rows are wrong for a venue: delete that venue's regular schedule rows and the venue falls back to its legacy reads (`source: legacy`). Do this only for a venue no Manager has saved since; after a save, the rows are the Manager's configuration. The saved backfill log has each venue's original hours.
- **Not reversible**: cancellations, notices and refunds made by closures. A wrongly cancelled guest is handled by hand from the call list and the Special dates tab.

## Release log

1. `git fetch origin`; `git checkout -b docs/venue-availability-ship`; `git reset --hard origin/main` → HEAD 1e88465c9.
2. `pnpm bootstrap:worktree` → exit 0.
3. `python3 <ship skill>/../../launch_demo.py config` → `NONE` / `launch-demo: 0 problem(s)`. No launch brief.
4. `local-ci-precheck` steps 1–5 on 1e88465c9 → all PASS (see Pre-flight). The worktree was left clean (`git status --short` empty).
5. Re-verified the 13 PRs → all OPEN and MERGEABLE; CI Gate SUCCESS on 12; #7704 checks still running; `needs-review` on 11 (see table).
6. Read-only deploy evidence: `gh run list --workflow deploy-services.yml`, and job conclusions for runs 40224395652 and 40305706717 → all jobs success, Deploy Blocked skipped.
7. No merge, deploy, tag or backfill was run. Stopped at prepared.

## Post-release checks

- Not run: nothing was released by this stage. Steps 3–6 above are the checks the Owner runs after the train.
- Last production deploy before this stage: `Deploy Services` 40305706717 at 10:13Z on 2026-10-26, with Post-Deploy Verification success. That covers code up to #7666, not the fixes.

## Outcome

Prepared and stopped. **Ship is BLOCKED** on the 13 PRs in `pending-merge:`, each awaiting an Owner merge. After they land: re-run the pre-flight on the new main head, confirm the migration, run the backfill dry run then `--apply`, and run the production-only checks. Then write back `outcome: released` with `released-at:`. Operate does not run in this invocation (autorun-brief.md § Operate).
