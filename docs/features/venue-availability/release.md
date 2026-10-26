---
stage: ship
run: feature:venue-availability
date: 2026-10-26
outcome: prepared
pending-merge: []
merged:
  - "#7671 ccf58f24f 2026-10-26T17:12:25Z"
  - "#7674 89ab1339d 2026-10-26T17:12:51Z"
  - "#7689 debef7113 2026-10-26T17:13:39Z"
  - "#7690 b46ecce86 2026-10-26T17:13:58Z"
  - "#7691 a52d433c1 2026-10-26T17:14:16Z"
  - "#7675 e5f44c99d 2026-10-26T17:14:35Z"
  - "#7698 b78e5d264 2026-10-26T17:55:07Z"
  - "#7700 47d4654da 2026-10-26T17:55:27Z"
  - "#7699 5af55a92a 2026-10-26T17:55:47Z"
  - "#7702 9c97eab1a 2026-10-26T17:56:07Z"
  - "#7704 2b44c2cfe 2026-10-26T17:56:28Z"
  - "#7703 f3ed4390b 2026-10-26T17:57:03Z"
  - "#7705 bce6d761c 2026-10-26T17:58:47Z"
open-follow-ups: [7682, 7683, 7685, 7687, 7688, 7696, 7706]
assumptions:
  - Release authorization was not given (autorun-brief.md § Release), so this is prepare-and-stop. Nothing was deployed, tagged or backfilled by this stage. The Owner merged the train.
  - There is no feature flag. "The release" is the merge train below, deployed by `Deploy Services` on push to main (deploy-via-CI policy), plus the Owner-only backfill.
  - The pre-flight was re-run on this PR's branch head after merging origin/main at bce6d761c (the last train merge, #7705). The docs-only diff of this PR does not change what the checks see.
  - That migration `20261025000000_add_venue_availability` is applied in production is inferred from deploy evidence (below), not read from the production database. This stage has no production database access.
---

# Release: Venue availability configuration, Phase 1

**Status: prepared, ready for the Owner-only steps.** All 13 PRs in the train merged into main on 2026-10-26 (17:12Z–17:59Z). The pre-flight passes on main at bce6d761c. **But the merged service code has not deployed yet**: no `Deploy API Services` job has succeeded since the train started (see Deploy status). Confirm a green deploy first, then run the backfill and the production checks.

## Review verdict and how each finding is carried

Review verdict (review.md, #7689, merged): **"not ready to ship as is"**, because of six major findings. No critical findings. Every major finding is now fixed on main:

| Finding | Issue | Fix PR | Merge commit | Merged at (UTC)  |
| ------- | ----- | ------ | ------------ | ---------------- |
| R1      | #7676 | #7698  | b78e5d264    | 2026-10-26 17:55 |
| R2      | #7677 | #7691  | a52d433c1    | 2026-10-26 17:14 |
| R3      | #7678 | #7700  | 47d4654da    | 2026-10-26 17:55 |
| R4      | #7679 | #7702  | 9c97eab1a    | 2026-10-26 17:56 |
| R5      | #7680 | #7690  | b46ecce86    | 2026-10-26 17:13 |
| R6      | #7681 | #7699  | 5af55a92a    | 2026-10-26 17:55 |

The rest of the train, also merged: #7671 fast-uri CVE floor (ccf58f24f, 17:12:25Z), #7674 locale-sweep E2E (89ab1339d, 17:12:51Z), #7689 review.md (debef7113, 17:13:39Z), #7675 #7644 notice urgency (e5f44c99d, 17:14:35Z, before #7699 as required), #7704 #7697 past-midnight (2b44c2cfe, 17:56:28Z), #7703 #7684 agent tools (f3ed4390b, 17:57:03Z), #7705 #7686 409 UI (bce6d761c, 17:58:47Z). Source: `gh pr list --state merged --json number,mergedAt,mergeCommit`.

None of the 13 adds a Prisma migration. #7671 is the only one touching a `package.json`.

### Open follow-ups (deferred minor findings, not ship blockers)

#7682, #7683, #7685, #7687, #7688, #7696, #7706.

## Pre-flight

The `local-ci-precheck` steps (`.claude/skills/local-ci-precheck/SKILL.md`), run on 2026-10-26 ~18:00Z in a fresh worktree, Node v22.22.3, against this PR's branch head cb81c6af5 = PR branch merged with **origin/main bce6d761c** (the #7705 merge, last of the train).

- [x] Step 1, `pnpm install --frozen-lockfile` → PASS ("Lockfile is up to date, resolution step is skipped")
- [x] Step 2, `pnpm lint` → PASS (`Tasks: 45 successful, 45 total`)
- [x] Step 3, `pnpm typecheck` → PASS (`Tasks: 45 successful, 45 total`)
- [x] Step 4, architecture audit: `pnpm build --filter "@mbe/cli..."` (5/5 tasks), `mbe check-adr` → "No architectural violations detected", `mbe check-deps` → "All external dependencies are consistent across the monorepo" → PASS
- [x] Step 5, drift: `pnpm graph` + `pnpm generate:dep-graph`, then `git diff --exit-code` on both graph files → no diff; `mbe pack <dir> --check` for all 21 committed `llms.txt` directories → 21 OK, 0 drift → PASS

The earlier run against 1e88465c9 (before the train) also passed; it is superseded by this one.

Ship's own pre-flight items:

- [ ] Verification green → **partly.** verification.md records 0 FAIL against a PRD criterion; its one regression (locale-sweep E2E) is fixed by #7674, now merged. **`CI` on main bce6d761c is still pending** (run 40373641775). Every `CI` run on the train's intermediate commits after b46ecce86 was cancelled by the next push. The last completed `CI` on main is b46ecce86 (#7690), success. Re-check: `gh run view 40373641775 --repo mattbutlerengineering/mattbutlerengineering --json conclusion`.
- [x] No secrets in the diff (docs-only diff for this stage; each fix PR passed its own CI and review). No new environment variable is introduced by the run (verification.md, review.md dependency pass).
- [x] Migrations have a tested forward path. `20261025000000_add_venue_availability` is additive only (review.md, Migrations pass), checked by `Validate Migrations` and `RLS Integration` in CI. The backfill has a golden test (verification.md § Migration). No PR in the train adds a migration.
- [x] ADRs. The run added ADR-029 and ADR-030, both with rows in `docs/adr/README.md`.
- [x] Rollback plan is concrete (below).
- [ ] Production-only checks verification.md left open → NOT RUN (Owner-only, release steps 3–5).

## Deploy status (read-only, 2026-10-26 18:03Z)

**The train's service code is not deployed.** The last `Deploy Services` run whose `Deploy API Services` job succeeded is still 40305706717 (c4399b5f6, 10:13Z), from before the train.

| Run                       | Commit                | Run state                           | Deploy API Services | Why                                                                                                                  |
| ------------------------- | --------------------- | ----------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 40366669803               | b46ecce86 (#7690)     | completed, failure                  | skipped             | `Wait for CI` failed after 30 min: "The requested check was never run against this ref" (`Build` was still queued)   |
| 40366718894               | a52d433c1 (#7691)     | cancelled                           | —                   | superseded                                                                                                           |
| 40366767884               | e5f44c99d (#7675)     | in progress                         | not started         | `Wait for CI` still waiting; that commit's `CI` run (40366767771) was cancelled, so it will likely fail the same way |
| 40373096773 – 40373249865 | b78e5d264 … 9c97eab1a | cancelled                           | —                   | superseded                                                                                                           |
| 40373394077               | f3ed4390b (#7703)     | pending (queued behind 40366767884) | not started         | its `CI` run (40373394522) was also cancelled                                                                        |

#7704 and #7705 touch only `apps/hospitality`, so they do not trigger `Deploy Services`; `Deploy Static Sites` run 40373641734 on bce6d761c is pending. `Pulumi Deploy` 40373668794 on bce6d761c succeeded.

**Likely outcome:** the pending runs fail `Wait for CI` because their `CI` runs were cancelled, and nothing deploys until a later push touches a services path. f3ed4390b already contains every service change in the train. Once `CI` on bce6d761c is green, the Owner can redeploy with one dispatch (`deploy-services.yml` has `workflow_dispatch`):

```
gh workflow run deploy-services.yml --repo mattbutlerengineering/mattbutlerengineering --ref main
gh run list --repo mattbutlerengineering/mattbutlerengineering --workflow deploy-services.yml --limit 3
gh run view <run-id> --repo mattbutlerengineering/mattbutlerengineering --json jobs --jq '.jobs[] | [.name, .conclusion] | @tsv'
```

`Deploy API Services` and `Post-Deploy Verification` must both be `success` (a workflow-level `success` can be a skipped deploy). This stage did not dispatch anything.

## Release steps (Owner-only)

### 1. Confirm the train is deployed

As in Deploy status above: a green `CI` on bce6d761c (or later), then a `Deploy Services` run on that head with `Deploy API Services` = success, and `Deploy Static Sites` success for the hospitality changes (manual fallback: `cd apps/hospitality && pnpm dlx wrangler@latest deploy`).

### 2. Migration: already applied (confirm)

Evidence, read-only:

- #7554 ("availability schema migration") merged 2026-10-25T19:05:56Z as 284d56d3c.
- `Deploy Services` run 40224395652 (2026-10-25T19:05:58Z, that commit): Circuit Breaker Check success, Wait for CI success, Deploy Blocked skipped, **Deploy API Services success**, Post-Deploy Verification success.
- The DO app runs `db-migrate-reservations` as a `PRE_DEPLOY` job (`prisma migrate deploy`, `infrastructure/pulumi/index.ts`), and a failed pre-deploy job fails the deployment. Later Deploy Services runs were green through 40305706717 (2026-10-26T10:13Z).

So the migration is applied in production by inference. Confirm directly, without writing anything:

```
doctl apps list-deployments $DO_APP_ID
doctl apps logs $DO_APP_ID db-migrate-reservations --deployment <deployment-id>   # expect "reservations migrations complete."
```

### 3. Legacy-hours backfill (dry run, then apply)

`services/reservations/src/scripts/backfill-availability.ts` (documented in `services/reservations/docs/reference.md` § Availability backfill). It has never run against production. Until it runs, every production venue reads its legacy-derived configuration (`source: legacy`), which the golden test shows lists the same slots. Running it is therefore not urgent, but it is what the PRD's "every existing venue" Migration criterion needs. Run it after step 1, so it runs on the latest code.

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

### 4. Production-only checks verification.md left open

- **Preview speed, p95 ≤ 1 s, end to end.** Time `POST …/availability/preview` against production (DO Managed Postgres, real network hop) on the largest venue, 20 or more calls, and record the p95. Only the spike (p95 190 ms on local Postgres) and the engine speed test exist.
- **Migration over every real venue.** The backfill dry run in step 3 is the check: every venue `would_migrate` or `already_migrated`, zero `errors`, each `unrecognised` venue explained.
- **Setup time, small.** A human-timed walkthrough by the Owner from an empty venue, without help text. NOT RUN.
- **Demo against the live backend.** Close a date with bookings on a test venue, choose cancel and notify, and confirm the notices arrive (SES and Twilio) and the refunds settle within 2 minutes.

### 5. Smoke check after the deploy

The booking widget lists slots for a venue, a hold and confirm succeed inside hours, and a hold outside hours gets 422 `outside-availability`. Check Sentry for new reservations-api errors for an hour after the deploy.

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

Merge commits are in the `merged:` front matter. Merge the revert once `CI Gate` is green; `Deploy Services` redeploys. Each fix PR is independent of the others except #7675 → #7699 (revert #7699 first if both go). Under the green-main policy an emergency revert is the one allowed exception to waiting.

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
4. `local-ci-precheck` steps 1–5 on 1e88465c9 → all PASS. Superseded by step 9.
5. Re-verified the 13 PRs → all OPEN and MERGEABLE, awaiting Owner merges. Stopped BLOCKED.
6. The Owner merged all 13 PRs, 2026-10-26 17:12:25Z–17:58:47Z (merge commits in front matter).
7. Fresh worktree: `pnpm bootstrap:worktree` → exit 0; checked out origin/docs/venue-availability-ship (dab9616ee); `git merge origin/main` (bce6d761c) → clean merge, head cb81c6af5.
8. Verified each PR merged: `gh pr list --state merged --json number,mergedAt,mergeCommit` → all 13 MERGED.
9. `local-ci-precheck` steps 1–5 on cb81c6af5 (main bce6d761c) → all PASS (see Pre-flight). No llms or dep-graph drift.
10. Read-only deploy evidence: `gh run list --branch main`, `gh run list --workflow deploy-services.yml`, job conclusions and the failed `Wait for CI` log of 40366669803 → train not deployed (see Deploy status).
11. No merge, deploy, dispatch, tag or backfill was run by this stage.

## Post-release checks

- Not run: nothing was released by this stage. Steps 1–5 above are the checks the Owner runs.
- Last production deploy: `Deploy Services` 40305706717 at 10:13Z on 2026-10-26 (c4399b5f6), Post-Deploy Verification success. That covers code up to #7666, none of the train.

## Outcome

Prepared. The merge train has landed and the pre-flight passes on main at bce6d761c. **Ship is ready for the Owner-only steps**: confirm green `CI` on main and a successful `Deploy API Services` for the train (dispatch `deploy-services.yml` if the pending runs fail `Wait for CI`), confirm the migration, run the backfill dry run then `--apply`, and run the production checks (preview p95 ≤ 1 s, setup-time walkthrough, live demo). Then write back `outcome: released` with `released-at:`. Operate does not run in this invocation (autorun-brief.md § Operate).
