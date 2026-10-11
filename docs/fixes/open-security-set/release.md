---
stage: ship
run: maintenance:open-security-set
date: 2026-10-09
assumptions:
  - "Release authorization is prepare-and-stop. No merge, deploy, tag, or npm publish. A pull request is allowed. Tracker issues stay open until a human merges and deploys."
  - "The three review majors were fixed on 2026-10-09 before this prepare step."
---

# Release: Public guest-risk disclosure and venue RLS backstop

## Pre-flight

- [x] Verification green (no unresolved failures). `verification.md` records 8 pass, 0 fail. The three review majors were fixed after that record. Re-checked on 2026-10-09: `rls-force-coverage.test.ts` 19 passed; `http-cache-semantics-override.test.mjs` 2 passed; the role `DO` block applied twice on local docker and the role was then dropped.
- [x] No secrets in the diff. No new env var. The app still uses the existing `DATABASE_URL`.
- [x] Migrations have a tested forward path. `prisma migrate deploy` applied both files on scratch database `open_security_rls` (later dropped). The role statement was then applied twice on the local cluster and dropped. Default privileges are not in the grant migration.
- [x] Rollback plan is below. It was not executed. Nothing has been deployed.

## Rollback plan

Door: one-way once `FORCE ROW LEVEL SECURITY` is applied, unless the seven tables are set back to `NO FORCE` before an app that does not `SET ROLE` serves traffic. The old reservations process connects as the table owner. With FORCE on and no `SET LOCAL ROLE`, that process is subject to venue RLS and venue-scoped reads fail closed.

Blast radius: reservations queries for every venue, and the public booking widget's deposit step. Shipping the API before the hospitality bundle makes `fetchGuestRisk` fail Zod parsing and treat every guest as not requiring a deposit.

```
-- Run as the migrate owner, before restoring the previous app image.
ALTER TABLE "venues" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "floor_plans" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "tables" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "guests" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "reservations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "deposits" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "waitlist_entries" NO FORCE ROW LEVEL SECURITY;
```

Then redeploy the previous reservations image. `DROP ROLE app_reservations` only after nothing still runs `SET ROLE app_reservations`. Revert the git branch to undo the response-shape change. Do not drop the role while the new app is running.

## Release log

1. Branch `fix/open-security-set` merged `origin/main` at `be23e15f3` (js-yaml bump, omp adapter, metrics). Lockfile auto-merged. The `http-cache-semantics` seam test still passed.
2. Push `fix/open-security-set` and open a pull request. The URL is recorded in the session report after `gh pr create` returns. The PR is not merged.
3. No `doctl` deploy, no `wrangler deploy`, no tag, no `npm publish`.
4. #6027, #5369, and #5995 were not closed. #5962 was not executed.

## Post-release checks

- Not run. The change is not where users get it.

## Outcome

Prepared and stopped. The pull request is the review surface. Merge and deploy stay with a human. Deploy the hospitality widget before the reservations API, and deploy the API image in the same release as the migration.
