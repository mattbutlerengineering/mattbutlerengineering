---
stage: review
run: feature:first-venue-self-serve
date: 2026-08-22
reviewer: inline (self-review; no subagent dispatched — none was requested, and dispatched reviewers on this host have died mid-review before)
verdict: ship, with two open items that need a human
assumptions:
  - Reviewed against `origin/main...HEAD`, re-read from the working tree rather than from memory of writing it.
---

# Review — first-venue self-serve

## What was checked

The full diff (19 files, ~1.35k insertions), with attention on the three places
this change can go wrong: the guard itself, the transaction that backs it, and
whether the new tests can fail.

## Findings

### 1. `Serializable` is verified as configured, not as effective — accepted

`venue.test.ts` proves the re-check runs inside the transaction callback and
that `{ isolationLevel: "Serializable" }` is passed. It cannot prove Postgres
aborts a real racing transaction, because no test in this repo runs against a
database. The isolation level is the part of this design doing the actual
concurrency work, and it is the part with the weakest evidence.

Not fixed here: standing up a DB-backed test harness is a larger change than
this run, and the failure direction is safe (if `Serializable` were silently
ignored, the in-transaction re-check still narrows the race window from
"between two HTTP requests" to "between two statements in one transaction").
Seeded in `docs/backlog.md`.

### 2. The journey case has never executed — needs a human

`E2E_NONADMIN_AUTH_EMAIL` / `E2E_NONADMIN_AUTH_PASSWORD` do not exist
(`gh secret list` returns five `E2E_*` secrets, neither of them). Until a
non-admin Auth0 account is provisioned and those secrets set, the new step
fails on every scheduled run.

This is deliberate — a skip-when-unset would be the "passes without exercising
anything" trap this repo has been bitten by repeatedly — but it has a real
consequence worth stating: **this feature's only production-level check is
currently red by design.** The step is ordered last in the journey precisely so
that its failure does not mark the existing wizard coverage as skipped.

Provisioning the account and setting the secrets is left to a human: it creates
an identity and writes credentials, neither of which belongs in an unattended
session.

### 3. Admins are now capped at 5 venue creations/minute — knowingly narrowed

The route previously inherited the service-wide 100/minute. The new per-identity
cap applies to admins too. No bulk venue-import path exists in this repo
(venues are created one at a time through the onboarding wizard), so nothing in
tree regresses — but a future admin script creating six venues in a minute would
now get a 429. Left as-is rather than adding an admin exemption: a cap that
holds for every caller is simpler than one with a hole in it, and 5/minute is
ample for the only creation path that exists.

### 4. `create()`'s no-`ownerSub` path skips the invariant — unreachable, noted not defended

When `ownerSub` is undefined, `create` takes the plain non-transactional path
with no membership check. That branch is unreachable from the route (`requireAuth`
401s before the handler runs, so `request.user` is always set), so no guard was
added for it — per the repo's rule about not writing defensive code for states
that cannot occur. The route carries a comment recording the invariant.

### 5. Adding an export displaced `venueRoutes`' body from `llms-full.txt` — cosmetic

`VENUE_CREATE_RATE_LIMIT` and `isWriteConflict` now occupy the generated
context slots that previously held the inlined `venueRoutes` implementation
(-663 lines). The generated artifacts are consistent (`pnpm regen --check`
passes), so CI is unaffected; the effect is a small loss of context quality for
that one file. Seeded rather than worked around — contorting source layout to
please a context generator is the wrong trade.

## What was checked and found clean

- **Guard decision matrix** matches ADR-020's amendment exactly: no user → 401,
  admin → allow without querying, no membership → allow, any membership → 403.
- **Fail-closed on lookup rejection**: the `await` is deliberately uncaught; the
  test asserts `statusCode >= 500`, never a 201.
- **Identity is server-derived**: forged `sub` in body, query and headers is
  ignored; only `user.raw.sub` from the verified token is read.
- **Blast radius**: `PATCH` and `DELETE` on venues are untouched and still
  covered by a test proving a zero-membership non-admin gets 403 on `PATCH`.
- **Production resolution**: `@mbe/auth`'s `production` export condition points
  at `dist/`, which is gitignored — rebuilt and confirmed to contain
  `requireVenueCreateAccess` rather than assumed.
- **Both new assertions were mutation-checked**, one of which had been passing
  vacuously before the implementation existed.
