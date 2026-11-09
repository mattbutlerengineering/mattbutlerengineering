---
stage: ship
run: feature:availability-holidays-copy
date: 2026-11-08
outcome: prepared
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8541
assumptions:
  - "No release authorization: the Owner asked to keep improving, not to merge. Prepare-and-stop."
  - "Rounds 1-3 are merged (#8511, #8528, #8538); this PR targets main directly."
---

# Release: Holiday decisions that stick, and Copy that says what it does

## Pre-flight

- [x] Verification green: verification.md, 12/12 criteria. The only check not run is a human walkthrough, recorded as such.
- [x] No secrets in the diff. The fake-session generator is in `/tmp`, `e2e/.auth/user.json` is gitignored, and `llms-full.txt` holds no harness code.
- [x] **Migration reviewed:** `20261108120000_add_venue_holiday_decision` is one `CREATE TABLE`, a unique index, a cascade foreign key, row-level security with the venue policy, and grants to `app_reservations`. It changes no existing table, column, enum or row. It applied cleanly on Postgres 15 as a non-superuser owner, as CI does.
- [x] No ADR added.
- [x] Rollback plan concrete (below).

## Deploy order

**Database migration, then the reservations service, then web.** The web app calls routes the service adds. If web reaches users first, saving a holiday decision gets 404/405 and the line says "Couldn't save." with Retry, with nothing lost. Browser tabs loaded before the deploy never call the new routes and keep working, because the decision is not part of the availability config.

## Rollback plan

**Door:** the code is two-way. The table is additive, so reverting leaves an unused table with no effect. Dropping it is optional and separate.

**Blast radius:**

- Managers see the new holiday lines and the Copy dialog; Hosts see decisions read-only.
- Guests, the engine, booking availability and the availability config are untouched.
- No availability data needs repair.

```
# After #8541 merges as <sha>:
git checkout main && git pull
git revert <sha>             # squash merge; for a merge commit: git revert -m 1 <sha>
git push origin HEAD:refs/heads/revert-8541 && gh pr create --base main --head revert-8541 \
  --title "revert: holiday decisions and Copy (#8541)" --body "Rollback per docs/features/availability-holidays-copy/release.md"
# deploy-static.yml redeploys apps/hospitality; the service redeploys from main.
# Optional, later and separately: DROP TABLE venue_holiday_decisions (a new migration, never an edit).
# Marks already saved are lost with the table; the holidays simply read as undecided again.
```

## Release log

1. Pre-flight on `cbbd43c3a`:
   - The antipattern ratchet is within baseline.
   - `pnpm regen --check` reports up to date.
   - Rebased onto `main` (`426445f71`) after #8538 merged. The full unit suite and the e2e suite were re-run on the rebased tree (556/557; the one failure passed 40 of 40 alone and is in the backlog).
2. `git push -u origin feat/availability-holidays-copy` with hooks: exit 0. Remote `cbbd43c3a` matches local.
3. `gh pr create --base main` → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8541. Merge danger written to match this plan.
4. Launch brief: the repo's launch-demo config is `NONE`, so nothing was written.
5. Stopped: no merge without the Owner.

## Post-release checks

Not run: nothing has reached users. After the PR merges and the migration, service and web have deployed, check as a Manager at https://mattbutlerengineering.com/hospitality/availability:

- Special dates shows one line per holiday, and "Open as usual" on one holiday shows as Decided on a second device.
- Copy offers Copy to … and Every week….

Visual baselines change on `/availability`; `visual-regen-trigger.yml` opens the baseline PR after merge.

## Outcome

Prepared and stopped. Waiting on #8541, named in `pending-merge:`.
