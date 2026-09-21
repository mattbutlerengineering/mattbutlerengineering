# Autorun brief — booking-guest-reuse

Assembled 2026-09-15 by the autorun orchestrator with **no live interview**:
the user invoked `/idea-to-prod:autorun` with no arguments and no
description, so there are zero user answers in this file. Every field is
either (a) copied from the pre-existing `idea.md` (written 2026-08-31, the
run's only artifact, found local-only and never pushed) or (b) an
orchestrator default that the relying stage must log under `assumptions:`.
Where a prior run's brief recorded a _standing_ user answer, it is quoted as
precedent, never inherited as authorization. This file is the brief, not an
artifact: it never counts toward orientation.

## Why this run

Run discovery on `origin/main` at `da54bd57b` (#5390): every
`docs/features/*` and `docs/fixes/*` run is complete except
`maintenance:rialto-web-usage-instrumentation`, which is at Operate and
blocked on a Cloudflare Analytics-Read token only the user can supply
(autorun stops at Ship; Operate runs only with feedback to capture).
`docs/features/booking-guest-reuse/idea.md` was the one un-driven run in
the tree. Orchestrator default: drive it. **Log as assumption in `prd.md`.**

## Feature description (what / why)

**What.** Reuse existing guest profiles when staff create a reservation,
seat a walk-in, or add a waitlist entry in the hospitality app, and link
the booking to the guest (`guestId`) instead of minting a stranger. Show
the guest's history (visits, no-shows, dietary) at the moment of booking.
Server-side, a public-widget booking whose email/phone exactly matches an
existing guest links to that guest with **no observable change** in the
widget's response.

**Why.** The CRM foundation exists and is bypassed: `Guest` carries
`visitCount`, `noShowCount`, `dietaryRestrictions`, `tags`, `staffNotes`;
the reservations service serves `GET /api/v1/guests/search` and
`POST /api/v1/guests/find-or-create`; `POST /api/v1/reservations` accepts
`guestId`. No staff booking surface calls any of it. Every merged
booking-flow improvement increases staff bookings and deepens the
duplicate problem. Full problem/who/why-now/evidence/hunch/success/risks:
`idea.md` (the Idea stage is complete; do not re-interview it).

## Run scale

Feature run. Slug: `booking-guest-reuse` (fixed by the existing `idea.md`
frontmatter `run: feature:booking-guest-reuse`). Artifacts under
`docs/features/booking-guest-reuse/`.

**Execution environment.** This run executes inside the git worktree
`/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/booking-guest-reuse`
on branch `worktree-booking-guest-reuse`, based on `origin/main` at
`da54bd57b` (#5390). Every stage runs its commands from that directory.
`pnpm install --frozen-lockfile` completed there before the first dispatch
(`node_modules/.bin/vitest` present). The main checkout
(`/Users/mbutler/github/mattbutlerengineering`) is 243 commits behind
`origin/main` and dirty — never read or write it.

## Idea-stage inputs

All present in `idea.md` (problem from the sufferer's view; who/coping;
why now; evidence labelled as design-gap only, n = 0 user reports;
solution hunch; one-sentence success; unknowns). **Currency caveat for
PRD/Architect:** `idea.md` cites line numbers from the 2026-08-31 tree.
Measured on `origin/main` `da54bd57b` (2026-09-15):

- `NewReservationDialog.tsx` still collects free-text `guestName` /
  `guestEmail` / `guestPhone` (lines 18-20) and submits no `guestId`;
  `WalkInDialog.tsx` still has a single optional `guestName` (line 19);
  `WaitlistPage.tsx` add-form collects `guestName` + validated
  `guestPhone` (lines 86-87). Zero call sites for `useGuest*`/`guestId`
  in all three.
- New since the idea: `apps/hospitality/src/hooks/useGuestRecognition.ts`
  (email-only, one consumer: the public widget's `GuestDetailsForm.tsx`);
  `apps/hospitality/src/hooks/useGuests.ts` exports `useGuestSearch`
  (wraps `api.guests.search`) and a `findOrCreate` mutation hook;
  `apps/hospitality/src/components/crm/GuestCard.tsx` (`guestId` prop;
  segment, allergy highlight, visits, no-shows) is mounted only where a
  `guestId` already exists (`TimelinePage`, `EditReservationDrawer`);
  rialto ships `Autocomplete`, `Combobox`, `Popover`.
- Backend: `guestService.findOrCreate(venueId, {email?, phone?, name,
dietaryRestrictions?})` resolves **exact** email (precedence) then exact
  phone via `@@unique([venueId, email])` / `@@unique([venueId, phone])`;
  **no phone normalization exists anywhere** (`guest-identity.ts` is only
  dietary-merge + update-payload helpers). `reservationService.create`
  sets `guestId: data.guestId ?? null` and never resolves a guest from
  `guestEmail`/`guestPhone`. The public hold-confirm path
  (`public-reservations.ts` → `guestDetails`) does not call
  `findOrCreate` either.
- **Prisma:** only `Reservation` has `guestId` (`schema.prisma:216`).
  `WaitlistEntry` has no guest link, and `packages/types/src/schemas/
waitlist.ts` carries no `guestId`.
- Tracker: issue **#4990** (`audit`, `ready`, `ux`; filed 2026-09-04 by
  the `hospitality-service-ux` UX audit, lens RECOGNIZE) covers the
  walk-in + waitlist half of this idea with the same fix sketch (typeahead
  via `api.guests.search`, inline `GuestCard`, optional `guestId` on
  `walkIn` / `createEntry`). It is `ready`, so `/implement-queue` could
  claim it in parallel — see § Tracker.

## Scope boundaries (orchestrator defaults — PRD logs as assumptions)

**In:**

- Staff reservation (`NewReservationDialog`): typeahead over
  `api.guests.search` as staff type name/email/phone; picking a match sets
  `guestId` and shows a compact history strip; submitting without a pick
  still auto-links on an **exact** email-or-phone match (find-or-create
  semantics) so no duplicate is minted.
- Walk-in (`WalkInDialog`): optional lookup (phone/name) that never gates
  seating; a pick passes `guestId` through the walk-in payload
  (`packages/types` walk-in schema + `services/reservations` route/service
  - `@mbe/api-client`), so the seated block can show the visit badge.
- Waitlist add (`WaitlistPage`): recognise on the phone already collected
  (typeahead / inline card). **Persisting a waitlist→guest link is out**
  (needs a Prisma column; see Out) — the PRD may keep waitlist to
  recognise-and-prefill and record the persisted link as a follow-up.
- Public widget, server-side only: a widget booking whose email/phone
  exactly matches an existing guest links to it; the widget's response
  must be byte-for-byte indistinguishable between matched and new guests
  (no existence oracle); no client-side change.
- Match semantics: exact email OR exact phone, name is a search key only,
  scoped to `Guest.venueId`. Phone normalization: if the Architect
  introduces a canonical form, it must be applied consistently to lookup
  and write within this run and must not require rewriting existing rows.
- Unit tests for every changed component/route/service (TDD); updates to
  the E2E specs that exercise these dialogs (`apps/hospitality/e2e/
reservations.spec.ts`, `walkin.spec.ts`, `waitlist.spec.ts`, and the
  `timeline*.spec.ts` / `dashboard.spec.ts` / `realtime-collaboration.
spec.ts` files if their selectors break) and `e2e/api-mocks.ts`; docs
  (`apps/hospitality/CLAUDE.md` components, `docs/USER-FLOWS.md` if a flow
  is satisfied); llms regen; a rialto `.changeset` only if
  `packages/rialto/src` changes.

**Out:** merging historical duplicate guests; cross-venue identity; fuzzy
or name-based matching; **any Prisma schema or migration change**
(therefore no persisted `WaitlistEntry.guestId`); changes to the public
widget's UI or its recognition endpoint's behaviour; `auth.spec.ts` /
`auth.setup.ts`; rialto npm publish; new rialto components unless
`Autocomplete`/`Combobox` cannot serve; anything in
`apps/hospitality/src/pages/GuestsPage*` beyond what linking requires.

## Success criteria (orchestrator defaults)

- Staff who pick a suggested guest in the reservation dialog produce a
  reservation with that `guestId` and see visits / no-show count /
  dietary before confirming; staff who type an email or phone that
  exactly matches an existing guest (no pick) still produce a reservation
  linked to that guest, and **no new `Guest` row** — asserted by service
  tests.
- A walk-in seated with a picked guest carries `guestId` and renders the
  returning-guest badge on the timeline block.
- A public-widget booking with a known email links to the existing guest;
  the HTTP response (status, body shape, timing-insensitive fields) is
  identical to the unknown-email case — asserted by a route test that
  diffs the two responses.
- Typeahead never blocks submit: with the search endpoint failing, every
  dialog still submits (free-text path intact) — asserted by a component
  test with the search mock rejecting.
- Gates: `pnpm lint`, `pnpm typecheck`, unit tests green in
  `apps/hospitality`, `services/reservations`, `packages/api-client`,
  `packages/types`; `pnpm regen --check` clean; `check-adr` / `check-deps`
  clean; the touched E2E specs pass when the environment allows;
  size-limit not exceeded.
- Reduced motion respected on any new animation; every colour via
  `--rialto-*`; rialto components only.

## Stack / design constraints (already in force)

Hospitality: rialto components only (no raw `<button>`/`<input>`), all
colours `var(--rialto-*)`, CSS Modules, `@mbe/api-client` for every call,
immutable state, `.js` import extensions, `useApiCall` +
`ErrorRetryBanner` for recovery, no `setState` in `useEffect` bodies.
Backend: ADR-002 error envelope, `requireAuth` + `requireVenueAccess`,
never a route-level `config.rateLimit` with a moved hook (gotchas §
Fastify); the public recognition endpoint's 10/min rate limit is the
precedent for any new public matching. Process: TDD (failing test first);
Zero-Touch Audit before commit; stage by explicit path (never `git add -A`
— a PostToolUse prettier hook keeps ~170 files dirty); `pnpm typecheck`
before push; never `status` as a zsh variable; `gh pr edit` is broken (use
`gh api -X PATCH`); `pnpm build --filter @mbe/cli...` before `pnpm regen`;
run `pnpm` from inside a package directory, not the root; do not use bare
`git stash`.

## Already decided

- Reuse `api.guests.search` / `useGuestSearch`, `guestService.findOrCreate`,
  `GuestCard`, and rialto `Autocomplete`/`Combobox`; do not build a second
  search or a second card.
- Exact-match-only identity (email precedence over phone), venue-scoped —
  matches the existing `findOrCreate` contract.
- Walk-in speed is sacred: lookup is optional, never a gate.
- Prior-run precedent (not authorization): the three 2026-08-30 briefs
  recorded the user's standing answers as "merge on green, export issues".
  This brief has no user answer, so neither is inherited (§ Tracker,
  § Release).

## Tracker (orchestrator default — Decompose logs as assumption)

Seed the run with **#4990** only: Decompose imports it as a work item
carrying `(tracker: #4990)` and, when that item exists, moves the issue
`ready` → `in-progress` with a comment naming this run directory (this
repo's label state machine; it prevents `/implement-queue` claiming it in
parallel). Do **not** export the other work items as issues. Do not close
#4990 by hand: the Ship stage puts `Closes #4990` in the PR's squash-commit
body so the merge — when a human performs it — closes it. A run abandoned
before Ship moves the label back to `ready`.

## User-facing surface

Yes — `ux: required` in `prd.md` (three staff dialogs change).

## Release authorization — NOT AUTHORIZED (prepare-and-stop)

Mechanism (recorded for `release.md`): PR to `main`; `CI Gate` is the sole
required check; merge is `gh pr merge <N> --auto --squash --delete-branch`
(this repo: auto-merge, no merge queue); `deploy-static.yml` deploys
hospitality as a Cloudflare Worker and `deploy-services.yml` deploys
`services/reservations` to DO App Platform on merge — deploy only via CI.
Versioning: a `.changeset` per change to `packages/rialto/src` (pre-1.0,
patch); no version for apps/services.

**No user answer exists, so the skill's default applies: Ship prepares and
stops.** Authorized: pushing the branch and opening the PR(s) against
`main` (a proposal, not a release), running every pre-flight gate, and
writing `release.md` with readiness and the exact merge/deploy steps.
**Not authorized:** merging, deploying, publishing, tagging, Prisma
migrations, or any merge past an unfixed critical review finding. The
report to the user must say the release was prepared, not executed.
