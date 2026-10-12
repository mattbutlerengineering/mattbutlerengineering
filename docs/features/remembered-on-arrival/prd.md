---
stage: prd
run: feature:remembered-on-arrival
date: 2026-09-28
ux: required
assumptions:
  - "Slug `remembered-on-arrival` and execution in worktree branch `worktree-remembered-on-arrival` on origin/main 6d27b5b47 are orchestrator defaults (brief § Run scale), not user answers."
  - "ux: required is the brief's § UX default (orchestrator); it holds on the evidence: two guest pages and three staff surfaces change."
  - "The lens RECOGNIZE / NO-DEAD-END / TONE / INCLUSIVE / CALM is carried over from the hospitality-service-ux brief, as brief § Feature description directs (orchestrator default)."
  - "Success criteria come from the orchestrator's draft (brief § shape B, as amended by § second decision). They are sharpened here into checks with exact strings and inputs."
  - "Acknowledgement copy is the brief's suggested softer wording, `Noted. It's on your reservation for the team.`, under the label `Special Requests`. 'Kitchen' is rejected because the ticket is a front-of-house surface, and nothing shows the note reaches a kitchen."
  - "No copy says 'you told us' or 'your words'. Staff can rewrite `notes` (EditReservationDrawer.tsx:172), and the manage page shows the current value. The label names the field instead: `Special Requests`, the same label as the form field (GuestDetailsForm.tsx:213)."
  - "The replacement for the confirmation-sent line is `No confirmation email or text is sent for this booking, so save these details. The venue has {contact} on your reservation.` It renders under today's condition (email or phone present), and {contact} is the email, else the phone, as today."
  - "Host caption copy is `Guests see this with: “Noted. It's on your reservation for the team.”` It describes what the guest pages show, not what this guest saw, because no field records how a reservation was created (no source/channel column on Reservation)."
  - "On the host ticket (ReservationDetails, ReservationSheet), the label `Notes` becomes `Special Requests`. On the tablet sheet, the block is visible without pressing 'More'. This is the PRD's answer to the host blind spot in idea.md, not a user answer."
  - "The BriefingPage card gets the `Special Requests` label but no caption, so the pre-shift scan stays compact. The label is what separates the guest's words from the staff note, which today renders in the identical style."
  - "Long-notes rule: show the full text on every surface, wrapped, with line breaks preserved. No truncation and no 'show more'. An unbroken string wraps rather than scrolling sideways at 375 px. Nothing changes in storage."
  - "Trim-empty rule: null, empty or whitespace-only notes render nothing on every in-scope surface. The displayed text drops leading and trailing whitespace only, and the stored value is untouched."
  - "Honesty rule made testable: the acknowledgement and host caption contain none of guarantee, confirm, reserved, arranged, kitchen, chef, 'will ', 'taken care'. The contact line contains none of 'has been sent', 'we've sent', 'check your', 'will receive'."
  - "No allergy-specific wording or detection. One calm line serves every request. Whether to add an allergy reminder is flagged for human review (Open questions)."
  - "The manage page's error-state copy that cites 'your confirmation email' (ManageReservationPage.tsx:25-26, :109) and the form hint 'for confirmation' (GuestDetailsForm.tsx:210) are left unchanged: the user's answer named only ConfirmationView's line. Flagged."
---

# PRD: Remembered on arrival

## Problem statement

A guest types a birthday, a window seat, or a nut allergy into the booking
widget's one free-text field, **Special Requests** (placeholder "Allergies,
celebrations, seating preferences...", `GuestDetailsForm.tsx:212-220`). The
field is saved as `Reservation.notes`, and the confirmation screen never shows
it back. The confirmation has the words: the public confirm route returns the
reservation with `notes` (`public-holds.ts:286` → `toReservation`,
`serializers.ts:138`), and `ConfirmationView.tsx` does not render it. So the
guest cannot tell whether anyone has it, and calls the venue or repeats it at
the door.

The same screen also tells every guest "A confirmation has been sent to
{email}." (`ConfirmationView.tsx:183-187`). That is false. The widget books
through `POST /public/v1/venues/:slug/holds/:holdId/confirm`
(`useBookingFlow.ts:606`), and neither that handler (`public-holds.ts:230-289`)
nor `confirm-hold.ts` sends anything. The only consumers of the
`hold:confirmed` event are SSE streams (`routes/events.ts:83`, `:143`), and the
deposit path (`public-deposits.ts`, `stripe-webhook.ts`) sends nothing either.
A guest who waits for that email waits forever, and cannot find the booking
again after leaving the page.

On the host side, `notes` is on the ticket, but the host can miss it or
misread it. On the tablet sheet it sits behind "More" (`ReservationSheet.tsx:183`,
`:207-216`). On the desktop sidebar and phone drawer it is labelled "Notes"
(`ReservationDetails.tsx:167-176`). On the pre-shift briefing it renders in
exactly the same unlabelled italic style as the private staff note
(`BriefingPage.tsx:174-184`). Nothing tells staff that the guest's pages show
these words, so nothing tells them the guest now expects them to be noted.

## Solution

When Special Requests has content, the guest sees it said back at booking time
and again on the manage page. Each surface shows the label **Special
Requests**, one line, **"Noted. It's on your reservation for the team."**, and
the guest's text verbatim. The confirmation screen stops claiming a message
was sent and tells the truth instead: nothing is sent, so the guest should
save these details, and the venue has their contact on the reservation. The
host ticket shows the same words under the same label, with a caption quoting
exactly what guest pages say. The briefing labels the guest's words apart from
staff notes. All of this copy comes from one source, so the guest and host
wording cannot drift. The words are untrusted text and render as text.

## Actors

- **Guest**: books on the public booking page or a venue's embedded widget,
  types into Special Requests, and may later open the manage page through the
  confirmation's "Cancel Reservation" link.
- **Host**: front-of-house staff reading the timeline ticket (desktop sidebar,
  tablet sheet, phone drawer; `TimelinePage.tsx:552`, `:577`, `:593`) and the
  pre-shift briefing.

## User stories

1. As a guest, I want the confirmation to show me my special requests with an
   honest line that they are on my reservation, so I know the venue has them
   without calling.
2. As a guest, I want the confirmation to tell me the truth about what gets
   sent, so I save my details instead of waiting for an email that never comes.
3. As a guest, I want the manage page to show my request the same way, so what
   I see later matches what I saw at booking.
4. As a host, I want the ticket to show the guest's request under the label the
   guest sees, plus what the guest's pages say about it, so I know the guest
   expects it to be noted.
5. As a host, I want the request visible on the tablet sheet without pressing
   "More", and set apart from staff notes on the briefing, so I see it on a
   busy night.

## Success criteria

In the criteria below, **present notes** are notes that are non-empty after
trimming. **Displayed text** is the stored notes with leading and trailing
whitespace removed, interior spaces and line breaks kept, and line breaks
rendered as line breaks.

- [ ] **SC1 ConfirmationView.** Given present notes, the view renders
      `Special Requests`, `Noted. It's on your reservation for the team.`, and
      the displayed text. A component test checks all three with a two-line
      note and asserts that both lines render on separate lines.
- [ ] **SC2 ManageReservationPage.** Given present notes, the page renders the
      same label, acknowledgement and displayed text, replacing today's bare row
      (`ManageReservationPage.tsx:195-202`). Checked by a component test.
- [ ] **SC3 Host ticket.** `ReservationDetails` and `ReservationSheet` render
      `Special Requests` (not `Notes`), the displayed text, and
      `Guests see this with: “Noted. It's on your reservation for the team.”`.
      On `ReservationSheet` all three are visible without activating "More".
      The `BriefingPage` card renders the displayed text under a
      `Special Requests` label that the guest's staff note does not carry.
      Checked by component tests, plus one Playwright spec on the `mockApi`
      harness that opens a ticket with notes.
- [ ] **SC4 One copy source.** The label, acknowledgement, host caption and
      contact line are defined once. A test pins their exact literal values,
      and every surface test asserts against that source. The acknowledgement
      sentence appears as a literal in exactly one non-test source file (grep).
- [ ] **SC5 Empty renders nothing.** For notes of `null`, `""`, `"   "` and
      `"\n\t "`, none of ConfirmationView, ManageReservationPage,
      ReservationDetails, ReservationSheet or BriefingPage renders the label,
      acknowledgement, caption or an empty container. Tested per surface.
- [ ] **SC6 Untrusted text stays text.** Notes containing
      `<script>alert(1)</script>`, `<a href="https://x">x</a>`, `&amp;`, single
      and double quotes, and newlines render as literal characters on
      ConfirmationView, ManageReservationPage and one host surface. No element
      is created from the guest's text. The changed files contain no
      `dangerouslySetInnerHTML` (grep).
- [ ] **SC7 Honest contact line.** ConfirmationView never renders
      `A confirmation has been sent`. When email or phone is present, it renders
      exactly
      `No confirmation email or text is sent for this booking, so save these details. The venue has {contact} on your reservation.`
      Tests cover the email case and the phone-only case. The existing
      "has been sent" assertions (`ConfirmationView.test.tsx:169`, `:190`) are
      replaced, not deleted.
- [ ] **SC8 Honesty limits.** A test asserts the acknowledgement and host
      caption contain none of: guarantee, confirm, reserved, arranged, kitchen,
      chef, `will `, `taken care`. It also asserts the contact line contains
      none of: `has been sent`, `we've sent`, `check your`, `will receive`.
      Matching is case-insensitive. The guest's own words are exempt.
- [ ] **SC9 Accessible and legible.** The label, acknowledgement and text are
      plain text in the accessible tree, with the label programmatically tied
      to the text. The feature adds no `aria-live` and no colour-only meaning.
      Changed styles use rialto components and `--rialto-*` tokens only. At a
      375 px viewport, ConfirmationView and ManageReservationPage with a
      2,000-character note containing a 300-character unbroken token show no
      horizontal scroll (`scrollWidth` ≤ viewport width, Playwright).
- [ ] **SC10 No excluded change.** `git diff --name-only origin/main...HEAD`
      lists none of `public-holds.ts`, `confirm-hold.ts`, any notifier or
      email file, `schema.prisma`, `packages/types` request/response schemas, or
      `packages/api-client`.
- [ ] **SC11 Production evidence, honestly bounded.** After deploy, a real
      browser probes production. The served hospitality bundle contains the
      acknowledgement and the new contact line, and no longer contains
      `A confirmation has been sent to`. The public booking page renders with
      no CSP refusal in the console. No reservation is created and nothing is
      sent: no sanctioned synthetic booking path exists, because
      `e2e/journeys/venue-journey.spec.ts` onboards venues and never books.
      `verification.md` records that production evidence cannot reach the
      rendered confirmation or manage view, or any host surface, which sits
      behind Auth0.
- [ ] **SC12 Gates.** `pnpm lint`, `pnpm typecheck` and `pnpm test` pass in
      each affected package. `pnpm regen` artifacts are committed. A changeset
      is added only if a published package's source changes (none expected).

## Out of scope

- Structured occasion or seating capture, and any generated "Happy
  anniversary" sentence (seeded in `docs/backlog.md`).
- Every email or notifier change, including `buildBookingEmail` and the raw-ISO
  start time (seeded). The same goes for wiring a confirmation send to the
  widget path (seeded as a capture run).
- `Guest.dietaryRestrictions`, `staffNotes` or any other linked-guest CRM data
  on guest surfaces (booking-guest-reuse SC11 recognition-leak rule).
- Reminders and anything scheduled.
- Changes to `public-holds.ts`, `confirm-hold.ts`, the Prisma schema, the public
  API, or request/response types. The data is already on every surface.
- Changing what is stored. No trimming or capping of `notes` in storage, and
  no `maxLength` on the field (`PublicHoldConfirmBodySchema` has no max,
  `reservation-requests.ts:415`).
- Other staff surfaces that show or edit `notes`: the `ReservationsPage` table
  (`:354`) and the `EditReservationDrawer` "Notes" field (`:172`).
- Manage-page error-state copy that cites "your confirmation email"
  (`ManageReservationPage.tsx:25-26`, `:109`), and the form hint "for
  confirmation" (`GuestDetailsForm.tsx:210`). These are the same honesty class,
  but outside the user's answer. See Open questions.

## Open questions

- **Manage-page error copy that cites a confirmation email.** It is false for
  widget bookings. Should it fold into the seeded "widget sends no confirmation
  email" capture run, or become its own follow-up? Owner: Matt.
- **An allergy reminder in the acknowledgement,** e.g. "mention allergies to
  your server too". This is a product-safety call. The default is no, for CALM
  and to avoid parsing guest text. Owner: Matt.
- **Staff-edited `notes` are guest-visible.** This is pre-existing: the manage
  page shows the current value. The new host caption makes that visible to
  staff. Should staff-only remarks move to a separate field? That needs a
  schema change, so it is out of scope for this run. Owner: Matt.
- **Coupling to the seeded capture run.** Whoever wires a widget confirmation
  send must replace SC7's contact line. The pin test will fail on purpose.
  Owner: that run.
- **Placement** of the acknowledgement relative to the details card and the
  contact line (the brief suggests next to it), and the sheet layout that keeps
  the request above "More". Owner: UX Design.
- **Brief correction for Decompose.** PR #5781 is merged (`3823faa80`), not
  open. None of the 4 open PRs on 2026-09-28 (#5824, #5845, #5846, #5848)
  touches this run's files.
