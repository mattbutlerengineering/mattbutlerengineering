---
stage: verify
run: feature:first-venue-self-serve
date: 2026-08-22
ux: skipped — no user-facing surface; the bootstrap path is API-only (the onboarding wizard is reachable only once a venue exists)
assumptions:
  - The Auth0 tenant's self-signup setting was NOT verified. Every criterion below is verified against the code as written; the residual exposure if self-signup is open is recorded in architecture.md and ADR-020, not closed here.
  - The live journey case (M3.2) is verified structurally — it is wired, typechecks, and its pure helpers are unit-tested — but has NOT been executed against production, because the non-admin account it needs does not exist yet (see release.md).
---

# Verification — first-venue self-serve

Every command below was run; the numbers are quoted from its output, not asserted.

## Gates

| Gate                   | Command                                            | Result                                                     |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Auth policy tests      | `pnpm --dir packages/auth test`                    | `Test Files 6 passed (6)` / `Tests 103 passed (103)`       |
| Reservations tests     | `pnpm --dir services/reservations test`            | `Test Files 91 passed (91)` / `Tests 1310 passed (1310)`   |
| Hospitality tests      | `pnpm --dir apps/hospitality test`                 | `Test Files 124 passed (124)` / `Tests 1590 passed (1590)` |
| Typecheck (3 packages) | `pnpm --dir <pkg> typecheck`                       | clean — `tsc --noEmit`, no output                          |
| Lint                   | `eslint --config eslint.config.js <changed files>` | exit 0                                                     |
| ADR conformance        | `pnpm --dir tools/cli start check-adr`             | `✅ No architectural violations detected.`                 |
| Generated artifacts    | `pnpm regen --check`                               | `All generated artifacts are up to date.`                  |

## PRD success criteria

| Criterion                                                                          | How it is verified                                                                                                                                                                       | Verdict                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| An authenticated identity holding no venue membership can create exactly one venue | `venues.test.ts` — "lets a NON-ADMIN holding no venue membership create their first venue" (201) and "refuses a NON-ADMIN who already holds a venue membership" (403)                    | **met**                        |
| The relaxation does not widen any other venue route                                | `venues.test.ts` — "does NOT weaken PATCH: a non-admin with no memberships still cannot update a venue" (403). `DELETE` still carries `requireAdmin`                                     | **met**                        |
| A platform admin is unaffected                                                     | `authz.test.ts` — admin admitted with `expect(lookup).not.toHaveBeenCalled()`; `venues.test.ts` — admin threaded as `{ isAdmin: true }`                                                  | **met**                        |
| The identity is server-derived, never client-supplied                              | `authz.test.ts` — forged `sub` in body, query and headers is ignored; the guard reads `user.raw.sub` from the verified token only                                                        | **met**                        |
| A lookup failure denies rather than admits                                         | `authz.test.ts` — rejection yields `statusCode >= 500`, never 201                                                                                                                        | **met**                        |
| Concurrent bootstraps cannot both succeed                                          | `venue.test.ts` — in-transaction re-check refuses the raced non-admin with `expect(venueCreate).not.toHaveBeenCalled()`; transaction asserted to run at `isolationLevel: "Serializable"` | **met, with the caveat below** |
| Abuse of the newly public path is bounded                                          | `venues.test.ts` — 429 after the cap; a second identity from the same IP is not rate-limited                                                                                             | **met**                        |

### The one caveat worth stating plainly

The concurrency criterion is verified against **mocked** Prisma, not a live
Postgres. The test proves the re-check runs inside the transaction callback and
that `Serializable` is requested; it does not prove Postgres actually aborts a
real racing transaction, because no test in this repo runs against a database.
That is a pre-existing property of the suite, not something this run introduced
— but it means the isolation level is verified as _configured_, not as
_effective_. Seeded in `docs/backlog.md`.

## Tests deliberately checked for vacuity

Two assertions in this run could have passed for the wrong reason, so each was
mutation-checked — the implementation was temporarily broken and the test
confirmed to go red:

| Test                              | Mutation                                                | Result                                        |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| "meters each identity separately" | `keyGenerator` reverted to `request.ip`                 | `Tests 1 failed` — then `1 passed` on restore |
| "throws on a malformed token"     | `readTokenPermissions` returns `[]` instead of throwing | `Tests 1 failed` — then `1 passed` on restore |

The second mattered: before `readTokenPermissions` existed, `expect(...).toThrow()`
passed because the _function_ was undefined. A green assertion is not evidence
until you know what turns it red.

## Not verified here

- **The journey case has never run.** It is wired into `venue-journey.yml` and
  guarded by a coverage test, but `E2E_NONADMIN_AUTH_EMAIL` /
  `E2E_NONADMIN_AUTH_PASSWORD` are not among the repo's secrets (`gh secret list`
  shows five `E2E_*` secrets, neither of these). Until they are provisioned the
  case fails loudly on every scheduled run — deliberate, but it means this
  feature's only production-level check is currently red-by-design.
- **Auth0 tenant self-signup.** Determines whether "any authenticated identity"
  means "any invited operator" or "anyone on the internet". Needs a human.
