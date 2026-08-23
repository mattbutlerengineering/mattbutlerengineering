---
stage: ship
run: feature:first-venue-self-serve
date: 2026-08-22
pr: "#4492"
authorization: merge-on-green, per the standing policy that a review-gate pass plus green CI is sufficient
released: pending — see "Outcome" below
assumptions:
  - No release action beyond merging to `main` was taken. No changeset was created, no package published, no manual deploy performed — none of those is authorized for this session.
---

# Ship — first-venue self-serve

## What ships

ADR-020's third case. `POST /api/v1/venues` moves from `requireAdmin` to
`requireVenueCreateAccess`, admitting an authenticated identity that holds no
venue membership at all — closing the loop where membership was reachable only
through membership.

Nine commits on `feat/first-venue-bootstrap`:

| Commit                                 | Contents                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `afa2508fa`                            | `requireVenueCreateAccess` + `HasAnyVenueMembership` in `packages/auth` (M1)   |
| `b093b7565`                            | `createHasAnyVenueMembership` and the Fastify decoration (M2.1–M2.2)           |
| `01000c53a`                            | the in-transaction invariant at `Serializable`, and the 403/409 mapping (M2.3) |
| `14708bd7b`                            | per-identity rate limit on the create route (M3.1)                             |
| `0a7913e41`                            | the non-admin case in the live journey + workflow-coverage guard (M3.2)        |
| `da809c646`                            | ADR-020 amendment (M3.3)                                                       |
| + regen, verification, review, backlog | generated artifacts and pipeline records                                       |

## Pre-flight

| Check                         | Result                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/auth` tests         | 103/103                                                                                                                                                          |
| `services/reservations` tests | 1310/1310                                                                                                                                                        |
| `apps/hospitality` tests      | 1590/1590                                                                                                                                                        |
| Typecheck (3 packages)        | clean                                                                                                                                                            |
| Lint (changed files)          | exit 0                                                                                                                                                           |
| `check-adr`                   | `✅ No architectural violations detected.`                                                                                                                       |
| `pnpm regen --check`          | `All generated artifacts are up to date.`                                                                                                                        |
| AI-antipattern ratchet        | clean (one regression fixed, one baseline accepted with reasons recorded in the commit)                                                                          |
| Production export path        | `packages/auth/dist/fastify/index.js` rebuilt and confirmed to contain `requireVenueCreateAccess` — the `production` export condition does not resolve to source |

## What is deliberately NOT part of this release

- **No changeset, no publish.** Nothing in `packages/rialto` changed; `packages/auth`
  is not published from this repo. Neither was authorized for this session in any case.
- **No manual deploy.** Deploys go through CI only.
- **No secret creation.** The journey's non-admin credentials require creating an
  identity and writing credentials — a human action, left undone deliberately.

## Known-red on purpose

The scheduled `venue-journey.yml` will fail its new final step until
`E2E_NONADMIN_AUTH_EMAIL` / `E2E_NONADMIN_AUTH_PASSWORD` exist. This was chosen
over skip-when-unset, which reads identically to a passing test while proving
nothing — the failure mode this repo has been bitten by repeatedly. The step is
ordered last so its failure cannot mark the wizard coverage skipped.

**If that tradeoff is wrong, the fix is to provision the account, not to soften
the test.**

## Outcome

Recorded in `retro.md` once the merge lands, against real CI output rather than
an assertion that it should pass.
