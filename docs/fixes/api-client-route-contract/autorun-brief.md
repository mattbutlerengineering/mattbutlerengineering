# Autorun brief — api-client-route-contract

Collected once, 2026-09-22, in a single interview round. This file is the only
source of interview answers for every stage of this run. It is **not** a run
artifact: it never counts toward orientation or active-run discovery.

## Run identity

- **Scale:** maintenance run.
- **Slug:** `api-client-route-contract`.
- **Run directory:** `docs/fixes/api-client-route-contract/`.
- **Run ref:** `maintenance:api-client-route-contract`.
- **Brief variant:** condition brief (something is degraded) that originates in a
  real, already-fixed production defect. The defect supplies the evidence; the
  run's target is the guard that would have caught it.
- **Origin:** a seed in `docs/backlog.md` — claim it in place at capture by
  appending `(claimed: maintenance:api-client-route-contract)` to that line, per
  the protocol's seed-backlog section. The seed is quoted verbatim below.

## What and why

`@mbe/api-client` holds `/api/v1/...` URL literals. The Fastify services
(`services/reservations`, `services/users`, `services/agent`) register route
paths independently. **Nothing checks the two agree.** Each side's tests pin
its own half, so both halves can be green while disagreeing with each other,
and the disagreement only becomes visible when a real request 404s in
production.

Add a contract test that builds each service's Fastify app, enumerates the
routes it actually registers (`printRoutes()` / `fastify.routes` / equivalent),
and diffs that set against the URL literals the client sends — failing when a
client URL has no registered route to answer it.

### The seed, verbatim (from `docs/backlog.md`)

> Add a contract test that pins every `@mbe/api-client` URL to a route the
> owning service actually registers (build the Fastify app, `printRoutes()` or
> `fastify.routes`, diff against the client's `/api/v1/...` literals) —
> `FloorPlansClient.setActive` posted to `/floor-plans/:id/active` and
> `bulkUpdatePositions` to `/floor-plans/:id/bulk-update-positions` with a bare
> array, while the reservations service registers `/:id/activate` and
> `/tables/positions` with `{ floorPlanId, positions }`; each side's own tests
> pinned its own path, the E2E mocks mirrored the client, and the deployed API
> answered 404 to both (probed 2026-08-30 via 1.1.1.1), so "Set as Active" and
> every position save in the floor-plan editor failed in production with every
> gate green. Fixed client-side in the same session; the class (two
> independently-pinned halves of one contract) is what the test would close
> (from: session:2026-08-30)

## Capture-stage inputs

The capture stage's interview is answered from this section. Where this brief
gives a fact, use it. Where it points at code, **measure the code** — reading
the repo is not guessing, and measurement beats both this brief and the seed.
Where neither this brief nor the repo answers an evidentiary question, stop and
surface; do not invent evidence.

### What is degraded (observed vs expected)

- **Observed:** a client URL literal and the service route meant to answer it
  can diverge with every gate green. Two measured divergences (both since
  fixed client-side on 2026-08-30): `POST /floor-plans/:id/active` vs the
  registered `/:id/activate`, and `POST /floor-plans/:id/bulk-update-positions`
  with a bare array vs the registered `/tables/positions` taking
  `{ floorPlanId, positions }`.
- **Expected:** a client URL with no route to answer it fails a check before it
  reaches production.

### Evidence of degradation

- The production 404s above, probed 2026-08-30 against the deployed API via
  resolver 1.1.1.1. (This repo's LAN resolver `192.168.4.40` sinkholes some
  hosts — any live probe in this run must cross-check `dig @1.1.1.1` /
  `curl --resolve` before calling something a production fault.)
- `packages/api-client/src/contract.test.ts` **already exists and does not
  cover this.** It diffs Zod schemas in `@mbe/types` against the JSON Schemas
  the services re-export — i.e. the **payload-shape** half of the contract. The
  **path** half is unpinned. A file named `contract.test.ts` that reads as
  covering "the contract" while covering only half of it is itself part of the
  degraded condition, and is worth recording as such.
- URL literals are spread across at least these client modules (counts from
  `grep` on `0a80ea85b`, indicative, re-measure): `venues.ts` 9,
  `availability.ts` 6, `tables.ts` 5, `guests.ts` 5, `floor-plans.ts` 5,
  `public-venue.ts` 4, `users.ts` 3, `health.ts` 2, `agent-sessions.ts` 2,
  `deposits.ts` 1. Also present: `reservations.ts`, `waitlist.ts`,
  `briefing.ts`, `exports.ts`, `streaming.ts`.

### Root-cause hypothesis (label it a hypothesis)

Two independently-pinned halves of one contract. The client's tests assert the
client's own literal; the service's tests assert the service's own registration;
the E2E mocks were written from the client, so they mirror the client's literal
rather than the service's truth. Nothing in the repo compares the two sets, so
agreement is incidental rather than enforced.

### Blast radius

Every `@mbe/api-client` consumer — `apps/hospitality` most of all — for every
route where the two halves drift. Severity is total for the affected call (the
feature simply does not work in production) and invisible to lint, typecheck,
unit tests, E2E, and review. Duration is unbounded: the floor-plan pair shipped
and stayed broken until a human curled the live route.

### Already ruled out / dead ends

- Do **not** re-fix the two floor-plan URLs: they were fixed client-side on
  2026-08-30. They are this run's reproduction evidence, not its work.
- Per-side unit tests do not close this — both sides already had them and both
  were green while production 404'd.
- E2E route mocks do not close this — they were written from the client, so
  they reproduced the client's wrong literal faithfully.

### Target state that ends the run

A check that runs in CI on every PR and fails when a `@mbe/api-client` URL
literal has no matching registered route in the owning service. It must be
demonstrated to fail against the known-bad pair (re-introduce one of the
2026-08-30 literals in a scratch/temporary edit, watch the check go red, revert)
— "prove the guard fails" is required, not optional; an unproven guard is a
decoration. Coverage of the client modules reached must be stated explicitly,
including any module deliberately left out and why.

### Re-entry depth

Capture decides and records it. Recommendation, to be confirmed against the
code rather than accepted blindly: **`re-entry: architect`**. Matching a
client's templated URL literals against a Fastify route table is a design
question with real choices (where the test lives and which package owns it, how
client literals are enumerated — static parse vs runtime interception vs an
exported route map, how `:param` / template-literal segments are normalized for
comparison, what happens to routes no client calls, how the three services are
each booted in a test without a live database). If capture measures the problem
and finds it genuinely mechanical with no such choices left open, `re-entry:
implement` is allowed — but record why.

## Scope

**In scope**

- The path half of the client↔service contract for `@mbe/api-client` against
  `services/reservations`, `services/users`, `services/agent`.
- The guard itself, its CI wiring, and the proof that it fails on the known-bad
  input.
- Fixing any _live_ mismatch the new guard discovers while being built — a
  currently-broken production route is a defect found in flight, and it ships
  with the guard that found it. Record each one explicitly.

**Out of scope**

- Re-fixing the two 2026-08-30 floor-plan literals (already fixed).
- The payload-shape half already covered by `contract.test.ts` — except where
  extending that file is the natural home for the path half, which is an
  architecture decision, not a scope expansion.
- Refactoring the api-client's transport, retry, or error handling.
- Any change to `apps/*` UI behaviour.
- Broad cleanup of adjacent code. Flag, do not fix.

## Success criteria

1. A check exists that fails when a client URL literal has no registered route
   in the owning service, and it runs in CI on pull requests.
2. The check is **proven** to fail on the known-bad input and to pass once it is
   reverted, with the transcript quoted in `verification.md`.
3. Coverage is stated: which client modules and which services are compared, and
   what is knowingly excluded, with the reason.
4. Zero false positives on `main` as it stands — or, if the check finds a real
   live mismatch, that mismatch is fixed in this run and named in the release
   record.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test` green; CI Gate green on the PR.

## Constraints and already-decided

**Release authorization: EXECUTE.** This run is authorized to merge its PR and
let CI deploy. Standing policy: review-gate pass + CI green → merge; **deploy
through GitHub Actions only** — no manual `doctl`, no manual `wrangler`, no
local publish. Unfixed **critical** review findings block the release
unconditionally: stop and surface instead.

**Tracker: mirror out at Decompose.** Work items are published as GitHub issues
carrying `(tracker: #N)` on their checkbox lines, and each closes at its item
boundary. One-way out: nothing in the tracker starts or steers this run, and no
existing issue seeds it (no tracker intake for this run).

**User-facing surface: none.** This run ships a test and its CI wiring. No UX
stage (maintenance runs have no PRD, so this is recorded here rather than in
`ux:` frontmatter).

**Stack / environment constraints — these have bitten this repo before:**

- Work happens in the worktree `.claude/worktrees/api-client-route-contract`
  on branch `fix/api-client-route-contract`, based on `origin/main` at
  `0a80ea85b`. The user's main checkout is 448 commits behind and dirty —
  never read run state from it, never `git checkout` in it.
- Run `pnpm` from inside a package directory (or `pnpm --dir <abs-path>`), not
  the monorepo root; turbo filters error out at the root for most packages.
- Parallel Bash calls do not share `cd` state — use absolute paths.
- `pnpm typecheck` is **not** run by any git hook and vitest does not typecheck.
  Run it yourself before declaring any stage done.
- A PostToolUse prettier hook reformats broadly, leaving ~171 files permanently
  dirty. **Never `git add -A`** — stage explicit paths only.
- `mbe` is not on `PATH`; invoke the CLI as `node tools/cli/dist/index.js <cmd>`
  after `pnpm build --filter @mbe/cli...`.
- `pnpm regen` / llms artifacts need `@mbe/cli` built first, or the regen hook
  silently no-ops and CI's Integrity job fails on stale `llms.txt`.
- `main` requires exactly one check: `CI Gate`. `Visual Regression` and
  `codecov/patch` are advisory. `main` is not `strict`.
- zsh is the shell: never use `status` as a variable name (read-only), and never
  pipe `git push` (the pipe masks the exit code — verify the pushed SHA).
- Adding a GitHub Actions `run:` block whose exit code is the point must open
  with `set -o pipefail`; the runner's default shell does not set it.
- `scripts/**` is currently outside the lint gate. If the guard lands there,
  say so rather than assuming it is linted.

## Standing instructions for every stage agent

- Answer interview questions from this brief. Where the brief is silent and the
  stage skill offers a named default, take the default and log it in the stage
  artifact's frontmatter under `assumptions:`. Where there is no skill-supplied
  default — and for **every** evidentiary question — stop and surface. Never
  guess.
- Never fabricate verification evidence. Run the real commands and quote the
  real output.
- The artifacts are the only state between stages. Write everything a successor
  needs into your artifact; nothing carries in an orchestrator's memory.

---

## Addendum — interview round 2 (2026-09-22, after Capture)

Capture surfaced one open scope question and two candidate live mismatches it
measured statically but did not probe. The orchestrator probed production and
put the resulting decisions to the user. Both are live-user answers, not
assumptions — do not log them under `assumptions:`.

### Production probe (measured 2026-09-22 ~21:10Z)

Resolver cross-checked against `1.1.1.1` first (`mattbutlerengineering.com` →
`172.67.222.73`, `104.21.25.32`) because this LAN's resolver sinkholes some
hosts and has invented a fake outage before.

| path                                                 | status  | body                                                                                        |
| ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `GET /api/health/system` (what the client sends)     | **404** | `{"message":"Route GET:/api/health/system not found","error":"Not Found","statusCode":404}` |
| `GET /health/system` (what the edge actually serves) | **200** | `{"status":"healthy",…,"subsystems":{…}}`                                                   |
| `GET /api/v1/venues/groups/by-slug/x`                | **404** | `{"message":"Route GET:/api/v1/venues/groups/by-slug/x not found",…}`                       |
| `GET /api/v1/venues/by-slug/x` (control)             | 404     | `{"type":"about:blank","title":"Not Found","status":404,"detail":"Venue not found"}`        |
| `GET /api/v1/reservations/health` (control)          | 200     | —                                                                                           |

The discriminator is the body, not the status: Fastify answers an
**unregistered** route with `"Route <METHOD>:<path> not found"`, and a
**registered** route with an empty result with the application's own
problem-details shape (`"Venue not found"`). Both findings return the former.

- **Finding A is CONFIRMED LIVE and user-facing.** `apps/hospitality`'s
  `SystemHealthBadge` (`src/components/SystemHealthBadge.tsx:53`) calls
  `packages/api-client/src/health.ts:13` → `/api/health/system` → 404 in
  production today. The edge worker answers `/health/system` (no `/api`) with a
  real payload.
- **Finding B is CONFIRMED unregistered**, not merely empty. Still latent: no
  live caller of the _group_ `getBySlug` was found.

### Decision 1 — guard scope: three Fastify services **plus the edge worker**

The guard compares `@mbe/api-client` URL literals against the route tables of
`services/reservations`, `services/users`, `services/agent` **and** the edge
worker (`infrastructure/worker/edge-router.js` plus its `routes-config.json`),
which is a first-class fourth route owner for this purpose.

Rationale the user chose on: it is the only option under which "every client
literal has an owner" is true with no escape hatch. Under a
services-only guard, `/health/system` would have to be allowlisted forever once
Finding A is fixed, and this repo's own history says an allowlist becomes where
things hide. `infrastructure/worker` is already a pnpm workspace package
(`@mbe/edge-worker`) with a real `test` script and 15 vitest files picked up by
the root config, so booting or enumerating it from a test is feasible.

A client literal that matches **no** owner is a FAILURE, not a skip. Architect
owns how each table is enumerated and how `:param` / template segments are
normalized across the four.

### Decision 2 — fix both findings inside this run

Both ship with the guard that found them, per the brief's in-flight clause, and
both are the guard's proof-of-failure inputs (§ Success criteria 2 — a guard
that cannot be shown going red is a decoration).

- **Finding A:** point the client at `/health/system`, the path the edge already
  answers 200. Architect confirms the direction against the edge's routing
  before Implement — if the better fix is teaching the edge to answer
  `/api/health/system`, take that instead and record why.
- **Finding B:** Architect decides the direction — delete the dead client method
  (`packages/api-client/src/venues.ts:125`), or register the missing
  `/groups/by-slug/:slug` route in `services/reservations/src/routes/venues.ts`
  — and records the reasoning. There is no live caller, so "delete the client
  method" is the cheaper hypothesis; do not register a route no consumer wants
  merely to make the guard green.

This supersedes Capture's `assumptions:` entry 2 (whether a statically-measured
unprobed mismatch qualifies as in-flight) and entry 3 (the open scope question
about the edge worker). Both are now answered by the user; Capture's artifact
stands as written and is not to be rewritten.
