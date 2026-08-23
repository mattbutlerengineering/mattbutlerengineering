---
stage: retro
run: feature:first-venue-self-serve
date: 2026-08-23
pr: "#4492"
merge-commit: d08fd49693e129df45e46e28620f924cabdce94d
merged: 2026-08-23T19:59:46Z
status: complete — with two items explicitly handed to a human
assumptions:
  - Outcomes below are measured against `origin/main` after the merge, not against the branch as reviewed.
---

# Retro — first-venue self-serve

## Did it work

The run's premise was a closed loop: `POST /api/v1/venues` required `admin`, and
every venue-scoped route required a membership, so a new account could
authenticate and then do nothing. **Membership was reachable only through
membership.**

Verified on `origin/main` after merge, by reading the merged files rather than
trusting the merge:

- `packages/auth/src/fastify/index.ts` exports `requireVenueCreateAccess`.
- `services/reservations/src/routes/venues.ts:579` carries
  `preHandler: [requireAuth, requireVenueCreateAccess(fastify.hasAnyVenueMembership)]`.
- `services/reservations/src/services/venue.ts:451` passes
  `{ isolationLevel: "Serializable" }`.
- Post-merge CI on `main`: `completed/success`.

The loop is open. What is **not** yet demonstrated is the same feature working
against production — see "The honest gap" below.

## Success criteria

| Criterion                                             | Verdict                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| Zero-membership identity can create exactly one venue | met                                                               |
| No other venue route widened                          | met (`PATCH` test proves 403; `DELETE` still `requireAdmin`)      |
| Admins unaffected in behaviour                        | met                                                               |
| Identity server-derived, never client-supplied        | met (forged `sub` ignored in body, query, headers)                |
| Lookup failure denies rather than admits              | met                                                               |
| Concurrent bootstraps cannot both succeed             | met **as configured**, not as observed — no DB-backed test exists |
| Abuse of the newly-public path is bounded             | met (5/min, keyed on `sub`)                                       |

## The honest gap

**This feature has never run against a real database or a real Auth0 account.**

Both halves of that sentence are deliberate and both are now backlog items:

1. `Serializable` is the part of the design doing the actual concurrency work,
   and it is the part with the weakest evidence. Mocked Prisma proves the
   isolation level is _requested_. Nothing proves Postgres _aborts_ a racing
   transaction.
2. The live journey case is wired, typechecked, guarded by a coverage test —
   and will fail on every scheduled run until someone provisions a non-admin
   Auth0 account and sets two secrets.

Point 2 is worth being blunt about: **I shipped a test that is red by design.**
That was the right call over skip-when-unset, which reads identically to a
passing test while proving nothing — but "the guard exists" and "the guard has
ever run" are different claims, and only the first is true today.

## What worked

**Mutation-checking the new assertions.** Two tests were verified by breaking the
implementation and confirming they went red. One of them — the malformed-token
test — had been passing _before the function it tests existed_, because
`expect(...).toThrow()` catches "is not a function" just as happily as a real
throw. That is a green assertion proving nothing, found in seconds by a check
that cost almost nothing. It is now a backlog item to make this routine.

**Letting the ratchet win an argument.** The AI-antipattern check flagged three
`.mockResolvedValue({})` additions. The convenient response was a baseline bump.
The check was right — an empty object stops the mock describing the contract it
stands for — so the mocks were fixed and only the genuinely-intentional
hardcoded-route count was accepted, with reasons in the commit message.

**Discovering that the guard could not hold the invariant alone.** The design
survived contact with a question it did not initially ask: the preHandler reads
membership _outside_ the transaction that creates it. That is a check-then-act
race invisible to lint, typecheck, and every single-request test. Finding it
before shipping is the run's best outcome; it is seeded as a class to detect
rather than an incident to remember.

## What went wrong

**A prior stage reported work committed that was not committed.** The M2.1/M2.2
source changes — `app.ts` and `venue-membership.ts` — sat uncommitted in the
working tree while a summary recorded them as landed. They were only caught by
running `git status` during Verify. Tests passed the whole time, because the
files existed on disk; nothing about a green suite distinguishes "committed"
from "merely present". **Green tests are not evidence that code is in a commit.**

**A silent no-op edit.** A string replacement against an import line failed to
match because Prettier had already reformatted that line into a multi-line
import — and the script did not assert the match, so it reported success while
changing nothing. The test then failed for an unrelated-looking reason. Every
subsequent edit script in the run asserted before writing.

**A broken `export` from a careless insertion.** Inserting a helper before
`const venueRoutes` split `export` from its declaration, and 48 tests failed at
once with a Fastify plugin error that named neither the file nor the cause.
Cheap to fix, but a reminder that anchoring an insertion on a partial line is a
guess.

## Ideas this surfaced

Seeded in `docs/backlog.md` (5 entries): a DB-backed transaction test; the
non-admin identity provisioning; the Auth0 self-signup question; a pack-generator
fix for exports displacing a file's primary symbol; and a detector for
check-then-act preHandlers.

## Handoff

Two things need a human, neither blocking:

1. **Provision the non-admin journey account** and set
   `E2E_NONADMIN_AUTH_EMAIL` / `E2E_NONADMIN_AUTH_PASSWORD`. Until then the
   journey's final step fails every run. If that tradeoff is wrong, the fix is
   to provision the account — not to soften the test.
2. **Confirm whether the Auth0 tenant permits open self-signup.** It decides
   whether "any authenticated identity may create one venue" means "any invited
   operator" or "anyone on the internet". The rate limit bounds the damage
   either way; the answer belongs in ADR-020.
