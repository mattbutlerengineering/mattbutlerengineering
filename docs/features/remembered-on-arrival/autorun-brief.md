# Autorun brief — remembered-on-arrival

> **Read § Decision 2026-09-28 (end of file) first.** It supersedes every
> conflicting statement above (What, Scope, Success criteria, Constraints),
> which was written on a false premise the PRD stage corrected.

Collected 2026-09-28 in two up-front interviews (the Idea interview, already
written into `idea.md`, plus four autorun questions answered by the user).
Every other field below is the orchestrator's recommended default and must
be logged under `assumptions:` by the stage that relies on it. This file is
the brief, not an artifact: it never counts toward orientation.

User's request, verbatim: "what is an award winning hospitality experience
we could add?" — then, offered four grounded candidates, the user chose
**Remembered on arrival** and asked for the run to be autorun end to end.

## The user's answers (verbatim intent)

Idea interview (2026-09-26, see `idea.md` for the full brief):

1. **Direction:** "Remembered on arrival" — guest books with occasion,
   seating preference, allergy; confirmation / manage page say it back;
   host ticket mirrors it.
2. **Who suffers:** "Both, guest-first" — guest's uncertainty is the
   problem, host's blind spot is the cause.
3. **Why now:** "Widget captures it, shows nothing back — loop half-built."
4. **Success:** "Guest sees it acknowledged before arrival; host ticket
   says the same."
5. **Evidence:** "None first-hand — repo + last30days only." (Community
   research ran; recorded in `idea.md` as silence plus a September 2026
   contradiction, never as validation.)

Autorun interview (2026-09-28):

6. **Scope:** "Out: confirmation + manage page + host ticket." The timed
   pre-arrival reminder is OUT of this run. All surfaces are synchronous.
7. **Release + tracker:** "Merge on green, export issues (precedent)."
8. **Constraints:** "Noted ≠ guaranteed; allergy = 'noted for the kitchen';
   additive schema only if needed."
9. **Verify surface:** "Public pages probed on prod post-deploy +
   tests/E2E for host ticket."

## Feature description (what / why)

**What.** A guest who typed an occasion (`Reservation.occasion`), a seating
preference (`Reservation.seatingPreference`), or a dietary restriction into
the booking sees it said back, in one human sentence, on every synchronous
guest touchpoint that already exists — the booking widget's confirmation
view, the confirmation email sent at booking time, and the public
manage-reservation page. The host's ticket (`ReservationSheet` and the
`BriefingPage` line for that booking) carries the identical sentence, so
guest and host read the same words. Example shape (PRD owns the final copy):
"Happy anniversary, Sam. Window table noted, and the kitchen knows about the
nut allergy." Where nothing was typed (`none`, `other`, `no_preference`,
empty dietary), there is no sentence at all — never "Happy none".

**Why.** `idea.md` § Why now: the fields are captured by
`booking-widget/GuestDetailsForm` and surfaced staff-side only
(`GuestCard`, `GuestDrawer`, `ReservationSheet`, `BriefingPage`,
`TimelineMobileView`); `ConfirmationView.tsx`, `ManageReservationPage.tsx`
and `post-visit-notifier.ts` contain no occasion string. PRODUCT.md theme
(1) "close the guest-facing loop". September 2026 industry pushback
("reasonable hospitality") argues FOR a feature that only promises what the
venue was told and can do, and AGAINST theatre — the run's tone.

**The lens (carried over from the `hospitality-service-ux` brief; the PRD
may refine but must not drop it — log as assumption):** RECOGNIZE (greets by
name, remembers preferences), NO-DEAD-END (never makes the guest repeat
known data), TONE (short, warm, confident, never corporate), INCLUSIVE
(sentence lives in the accessible tree, no colour-only meaning), CALM (one
sentence, not a badge wall). Brand direction: speakeasy / high-class /
royalty / gen-z, expressed through rialto tokens, never over accessibility.

## Run scale

Feature run. Slug: `remembered-on-arrival` (orchestrator default, from the
direction label the user picked — log as assumption). Artifacts under
`docs/features/remembered-on-arrival/`.

**Execution environment (orchestrator default — log as assumption).** This
run executes inside the git worktree
`/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/remembered-on-arrival`
on branch `worktree-remembered-on-arrival`, based on `origin/main` at
`6d27b5b47`. The main checkout is 513 commits behind `origin/main` and
dirty with another run's files — never run stage commands there. Every
stage runs its commands from the worktree. `pnpm install --frozen-lockfile`
is run by the orchestrator after this brief is written; Implement/Verify
must confirm `node_modules` exists and re-run it if absent, and must run
`pnpm typecheck` before declaring done (gotchas.md § Pre-push).

**Work in flight that touches nearby files (Decompose must sequence or
avoid):** open PR **#5781** (`fix(reservations): scope the public booking
funnel and token-addressed routes under RLS`, worktree-agent branch) edits
`services/reservations/src/routes/public-*` and `manage-reservation.ts`.
Runs `booking-guest-reuse` and `key-gated-workflows-visible-skip` are
merged and awaiting retro only. Nothing else open builds a guest-facing
acknowledgement (checked 2026-09-26 against #5767/#5771/#5781/#5783/#5792/#5795).

## Scope

**In:**

- Booking widget `ConfirmationView` — the sentence, rendered with rialto.
- Confirmation email (the one `booking-notifications.ts` already sends at
  booking) — the sentence in the body. No new send, no scheduling.
- Public `ManageReservationPage` — the sentence.
- Host ticket: `ReservationSheet` (timeline) and the `BriefingPage` row —
  the identical sentence text, from one shared generator.
- One pure sentence generator (shared package, unit-tested, exhaustive over
  the `Occasion` × `SeatingPreference` × dietary presence matrix, degrading
  to `null` when nothing was typed).
- Accessibility: sentence is text in the DOM/email, announced once, no
  colour-only meaning; 375 px width.

**Out:**

- The timed pre-arrival reminder and anything else scheduled (Redis unset
  in prod; backlog seed from #3763 owns that decision).
- Post-visit email changes, waitlist, win-back.
- Any promise of a specific table: seating wording is "noted", never
  "reserved" / "guaranteed" / "confirmed".
- Any change to how allergies reach the kitchen: the allergy line claims
  only what the host ticket visibly shows ("noted for the kitchen" means
  it is on the ticket, nothing more). No POS/KDS integration (charter
  non-goal).
- Auth model, schema-destructive changes, new paid infra.
- Whether the public widget should START collecting dietary info if it
  does not today — PRD checks `GuestDetailsForm`; if the widget does not
  collect it, the allergy clause applies host-side only (linked `Guest`
  record) and the guest-facing sentence omits it. Do not add a new
  collection field in this run without stop-and-surface.

## Success criteria (orchestrator draft — PRD logs as assumption and may sharpen)

1. A booking with `occasion ∈ {birthday, anniversary, date_night}` shows
   one sentence naming it on ConfirmationView, in the confirmation email,
   and on ManageReservationPage.
2. `seatingPreference ≠ no_preference` appears in that sentence as
   "noted"; the string never contains "guaranteed", "reserved", or
   "confirmed" for a seat.
3. A dietary restriction present on the booking or linked guest appears as
   "noted for the kitchen" on the guest surfaces ONLY when the host ticket
   renders the same restriction; otherwise it is omitted guest-side.
4. `ReservationSheet` and `BriefingPage` render byte-identical sentence text
   to the guest surfaces for the same booking (same generator, pinned by a
   test).
5. `occasion ∈ {none, other, null}` AND `no_preference` AND no dietary →
   no sentence element rendered anywhere (no empty container, no "Happy
   none").
6. Keyboard/screen-reader: the sentence is plain text in the accessible
   tree; no `aria-live` spam; contrast via rialto tokens; renders at 375 px.
7. Verification: unit tests for the generator matrix; Playwright with the
   synthetic-session/`mockApi` harness for the host ticket; after deploy,
   the public confirmation and manage pages are probed on production with
   a real browser (CSP kills silently — a 200 is not evidence). The
   authenticated dashboard's production evidence gap is recorded, not
   hidden.
8. Existing gates: `pnpm lint`, `pnpm typecheck`, `pnpm test` in the
   affected packages; rialto changeset if any published rialto source
   changes; `pnpm regen` artifacts (llms) committed.

## Constraints (decided)

- "Noted ≠ guaranteed" wording rule above is a hard constraint.
- Allergy line = "noted for the kitchen", nothing stronger.
- Additive schema change permitted ONLY if the PRD proves a field is
  needed that cannot be derived from `Reservation`/`Guest` today; the
  hunch needs none. Migration, if any, is additive and goes through
  `migration-reviewer`.
- Rialto components and `var(--rialto-*)` tokens only; `@mbe/api-client`
  for any call; `.js` import extensions; immutable state; no
  `setState`-in-`useEffect` in rialto.
- Email copy must render in plain text and HTML (check what
  `packages/notifications` Resend adapter supports before designing).
- Scope to one implement-queue-sized batch (3–10 agent-sized items).

## Tracker (user answer: export issues)

Decompose exports each work item as a `ready` GitHub issue carrying the
run's slug in the title and records `(tracker: #N)` on the checkbox line
(protocol form). Implement closes each mirrored issue at item completion.
Do not seed from existing issues — none matches. Do not create a
`tracking` parent unless `/decompose` conventions require it (they do:
file one tracking issue, label `tracking` + `feature`).

## UX

Yes — `ux: required` in `prd.md`: three guest-facing surfaces and two
host-facing surfaces change. Reduced motion respected; no animation is
needed for this feature.

## Release authorization — AUTHORIZED (merge on green)

Mechanism (record in `release.md`): PR to `main`; `CI Gate` is the sole
required check (`strict: false`); merge via
`gh pr merge <N> --auto --squash --delete-branch` after the diff-matched
review gate (`reviewer` subagent, plus `e2e-selector-drift-reviewer` if
`apps/*/e2e/**` changes, `migration-reviewer` if any Prisma change,
`generated-artifact-determinism-reviewer` if llms/schemas change). A
`CLEAN` PR refuses `--auto` in this repo — merge directly in that case.
`deploy-static.yml` deploys `apps/hospitality` on merge; `deploy-services.yml`
deploys `services/reservations` if it changed. Deploy only via CI — never
`wrangler`/`doctl` by hand. Never release past unfixed critical review
findings: stop and surface. `git push` output must be verified by SHA
(pipe masks exit codes).

Versioning: no rialto publish expected. If rialto source changes, add a
changeset (`.changeset/*.md`) or CI Gate fails.

## Verification surface (user answer)

Public pages probed on production after deploy with a real browser
(Playwright MCP or `apps/hospitality` Playwright against the live URL),
including a check that the sentence text is present in the DOM and no CSP
refusal in the console. Host surfaces proven with unit + Playwright on the
synthetic session + `mockApi` harness (see `apps/hospitality/e2e/fixtures.ts`
and the `hospitality-service-ux` run's harness notes). No Auth0 credentials
are available; do not attempt to authenticate against production.

## Operate

Not run by autorun. Retro only once feedback exists; note that every 2026
run closed with zero observed human guests — the public pages are the one
observable surface, so any post-ship signal will come from there or from
Sentry (error-only) and Cloudflare analytics (token pending).

## Decision 2026-09-28 — shape B (supersedes conflicting text above)

**Why this section exists.** The first PRD dispatch stopped and surfaced
(no `prd.md` written): the booking widget does **not** collect `occasion`
or `seatingPreference`, and no write path persists them (verified by the
orchestrator on `6d27b5b47`: `GuestDetailsForm.tsx:213-220` has one
free-text "Special Requests" field, placeholder "Allergies, celebrations,
seating preferences..."; `PublicHoldConfirmBodySchema` carries only
`guestName/guestEmail/guestPhone/notes`; in non-test service code
`occasion`/`seatingPreference` are only _read_, in `briefing.ts` and
`serializers.ts`). `idea.md` has been corrected. The user was asked and
answered:

10. **Shape:** "B: say the guest's own words back." — echo the guest's
    Special Requests (`Reservation.notes`) on ConfirmationView and the
    confirmation email; manage page already shows it. No new field, no
    schema, no public-API change.
11. **Side defect:** "Seed docs/backlog.md for a capture run." — done by
    the orchestrator (two seeds, `from: session:2026-09-28`): the staff
    APIs silently dropping `occasion`/`seatingPreference`, and the
    suspected raw-ISO start time in the confirmation email.

**What (replaces § Feature description / What).** When a guest types
anything into Special Requests, every guest surface at booking time says
it back: one short, warm acknowledgement line, then the guest's words
quoted **verbatim**. Surfaces: the booking widget's `ConfirmationView`,
the HTML confirmation email built by
`packages/notifications/src/email-content.ts` (`buildBookingEmail`
already receives `specialRequests` from `booking-notifications.ts` and
drops it), and the public `ManageReservationPage` (already shows the text
under "Special Requests" — bring it to the same acknowledgement copy). The
host side already shows `notes` (`ReservationSheet` expanded "Notes",
`BriefingPage`); the PRD decides what, if anything, the host ticket needs
so the host can see _what the guest was told_ ("host ticket says the
same"). One shared copy source (constant or pure function) feeds every
surface, pinned by a test, so the words cannot drift.

**Scope (replaces § Scope).**

- In: the acknowledgement on ConfirmationView, confirmation email, manage
  page; host-ticket alignment as the PRD specifies; the shared copy source;
  a11y (plain text in the accessible tree, 375 px, no colour-only meaning).
- Out: structured occasion/seating capture and any generated "Happy
  anniversary" sentence (seeded); `Guest.dietaryRestrictions` or any other
  linked-guest CRM data on guest surfaces (the `booking-guest-reuse` run's
  SC11 recognition-leak rule — `withoutGuestLink` exists for this);
  reminders and anything scheduled; changes to `public-holds.ts`,
  `confirm-hold.ts`, or any file open PR #5781 edits (not needed for B —
  if the PRD finds it is needed, stop and surface); new schema or API
  fields.

**Hard constraints (added).**

- **Guest text is untrusted.** The email is a hand-built HTML template
  string: the guest's words MUST be HTML-escaped there (a test with
  `<script>`, `<a href>`, `&`, quotes, and newlines is required). React
  surfaces must render it as text, never `dangerouslySetInnerHTML`.
  Newlines preserved as line breaks without introducing markup injection.
- **"Noted for the kitchen" = on the ticket, nothing more.** The copy may
  not claim the kitchen _acted_, _confirmed_, or _guaranteed_ anything, and
  seating asks in the text are "noted", never "reserved". The PRD may pick
  softer honest wording ("It's on your reservation for the team") if
  "kitchen" overclaims for a front-of-house ticket — log the choice.
- Empty or whitespace-only notes → no acknowledgement element anywhere
  (no empty container, no "You told us: ''").
- Long notes: the PRD sets a display rule (wrap in full vs. cap) and logs
  it; no data is truncated in storage.

**Success criteria (replaces § Success criteria; PRD may sharpen, logs as
assumption).**

1. Booking with non-empty Special Requests → ConfirmationView shows the
   acknowledgement line and the guest's words verbatim.
2. The confirmation email shows the same acknowledgement and words,
   HTML-escaped; injection test passes.
3. ManageReservationPage shows the same acknowledgement copy.
4. The host ticket shows the same words and makes clear what the guest was
   told (PRD specifies); all surfaces consume one shared copy source,
   pinned by a test.
5. Empty/whitespace notes → no element on any surface.
6. Accessible and legible at 375 px; rialto tokens/components only.
7. Verification: unit tests (copy source, escaping, empty handling),
   component tests for ConfirmationView/ManageReservationPage/host ticket,
   Playwright for the host ticket on the synthetic-session + `mockApi`
   harness, and a production probe after deploy of the public surfaces
   with a real browser (console free of CSP refusals). **Do not create a
   production reservation or send a real email unless a sanctioned
   synthetic path already exists** (check `venue-journey.yml` /
   `venue-journey.spec.ts` precedent); otherwise the production evidence is
   the deployed bundle carrying the copy plus the rendered public pages,
   and the gap is recorded, not hidden.
8. Existing gates: `pnpm lint`, `pnpm typecheck`, `pnpm test` in affected
   packages; changeset if any published package requires one; `pnpm regen`
   artifacts committed.

**ISO start time in the email (seeded, PRD may pull in).** The subagent
suspected `buildBookingEmail` prints the raw ISO timestamp because tests
pass `"19:00"` while the real caller passes ISO. Not reproduced. Since B
edits this function, the PRD should verify it; if real, it may be included
as an in-scope fix (then Ship claims the backlog seed), else leave it
seeded.

## Decision 2026-09-28 (second) — email dropped, false line reworded (supersedes the shape-B section where they conflict)

**Why this section exists.** The PRD retry (shape B) stopped and surfaced
with no `prd.md` written. Shape B rested on a second false premise: the
booking widget's confirm path sends **no** confirmation email. The
orchestrator verified this on `6d27b5b47`:

- The widget confirms through `api.holds.confirmForVenue`, which calls
  `POST /public/v1/venues/:slug/holds/:holdId/confirm`. Neither
  `services/reservations/src/routes/public-holds.ts` nor
  `services/reservations/src/services/confirm-hold.ts` calls the notifier.
- `scheduleBookingNotifications` has one real booking caller,
  `public-reservations.ts:180`, the `POST /public/v1/venues/:slug/reservations`
  route. The other call, `booking-notifications.ts:124`, is the time-change
  re-send.
- `ConfirmationView.tsx:185` tells every widget guest "A confirmation has
  been sent to {email}." That is false on this path.

The PRD agent also reported that production carries no `RESEND_API_KEY`.
This was measured 2026-09-09 in `docs/fixes/public-ingress-never-applied/defect.md`
and not re-measured.

The user was asked, and answered:

12. **Email surface:** "Drop the email." The confirmation email is out of
    scope for this run. The gap is seeded in `docs/backlog.md` as a capture
    run: widget bookings send no confirmation email, and Resend is not
    provisioned. Done by the orchestrator, `from: session:2026-09-28`.
13. **The false "A confirmation has been sent" line:** "Reword it honestly."
    This is in scope. The PRD picks truthful copy that claims no email was
    sent. The new acknowledgement sits next to this line.

These are live-user answers. Do not log them as assumptions.

**Scope now.**

- In: the acknowledgement on `ConfirmationView`, `ManageReservationPage`
  and the host ticket, as the PRD specifies. The shared copy source. The
  honest rewording of `ConfirmationView`'s confirmation-sent line. The
  a11y rules from shape B.
- Out: everything shape B excluded, **plus** `buildBookingEmail` and every
  other email or notifier change. The raw-ISO time stays seeded. The PRD
  retry reproduced it: the real caller's value printed
  `2026-10-02 at 2026-10-03T02:00:00.000Z`. It is no longer in reach of
  this run.

**Success criteria now.** Shape B's criteria stand, with these changes.
Criterion 2, the email, is removed. Criterion 7 drops the email-rendering
evidence. A new criterion is added: `ConfirmationView` no longer claims a
confirmation was sent, and a test pins the new wording. Criterion 5, "no
element on any surface" for empty notes, now covers the three remaining
surfaces.

**PRD stage history.** This is the third PRD dispatch in this invocation.
The first two stopped on false premises in this brief, and each was
correctly surfaced. Neither was a broken stage. The user directed the run
to advance after answering.

## Resume 2026-10-16 — implementation already merged

The user re-invoked autorun on this run (chose it over ship-pr,
venue-scoped-routes and a new run). Facts measured at resume, not
assumptions:

- `breakdown.md` is 15/15 checked. The implementation merged to `main` as
  **PR #6355** at 2026-10-12T00:59:29Z, under this brief's release
  authorization (answer 7: "Merge on green"). `verification.md`,
  `review.md` and `release.md` were never written.
- The original worktree (`worktree-remembered-on-arrival`) is 310 commits
  behind `origin/main` and stale. The remaining stages run in
  `/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/roa-close`
  on branch `docs/remembered-on-arrival-close`, cut from `origin/main`.
  Run `pnpm install --frozen-lockfile` there before any test command.
- Open-PR pre-flight at resume: zero open pull requests.

What this means per stage:

- **Verify** grades the code as it is on `main` now, not the old branch:
  the PRD's success criteria against merged code, plus the production
  evidence answer 9 names (public pages probed on prod, real browser,
  console free of CSP refusals; host ticket via tests/E2E). Never create
  a production reservation or send a real email.
- **Review** reviews the change as merged (`git show` the #6355 squash
  commit on `main`), including anything on `main` since that touched the
  same files.
- **Ship** records a release that already happened. The merge is done;
  Ship's job is the pre-flight record, the deploy evidence for #6355's
  merge commit (job-level conclusions, never the workflow rollup), and
  the rollback steps. It executes no new release action. A critical
  review finding is reported as a live production defect, not a blocker.
