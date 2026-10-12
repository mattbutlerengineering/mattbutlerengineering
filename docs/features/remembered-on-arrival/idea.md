---
stage: idea
run: feature:remembered-on-arrival
date: 2026-09-28
origin: user prompt — "what is an award winning hospitality experience we could add?" (not a backlog seed; nothing claimed)
in-flight-check: ran 2026-09-26 against open PRs #5767, #5771, #5781, #5783, #5792, #5795 — CI/docs/RLS chores only; latest ideation proposal #5773 is an operator deposit widget; nothing builds a guest-facing acknowledgement
assumptions:
  - "Slug `remembered-on-arrival` chosen by the interviewer from the direction label the user picked; not separately confirmed."
  - "Community corroboration (last30days, window 2026-08-29 to 2026-09-28, Reddit 11 / YouTube 1 / HN 4 items) surfaced no thread on this specific problem. Recorded below as silence, not as evidence the problem is unreal."
---

# Idea: Remembered on arrival

## Problem

Guest-first; the host's blind spot is the cause, the guest's uncertainty is the problem.

**The guest, on the night that matters:** "I told you it was our anniversary. I asked for the window. I said she can't have nuts. What I got back was a receipt with a date and a party size. I don't know if anyone read it, so I'll call the restaurant, or say it all again at the door and hope."

**The host at the door:** "It's in the sheet if I open the sheet. On a Friday at 7:15 I don't open the sheet. The guest finds out we didn't know when nothing happens."

## Who has it

- **The guest** who booked a birthday, anniversary, or date night through the public booking page or a venue's embedded widget, and typed an occasion, a seating preference, or a dietary restriction into it. Copes by phoning, by re-telling the host in person, or by quietly lowering expectations. Reviews are where the disappointment currently lands (see Evidence).
- **The host / front-of-house** on a tablet. Sees the occasion only by opening `ReservationSheet` per booking or scanning `BriefingPage` pre-shift. Copes by memory and by hoping the guest re-mentions it.
- **Population today:** one prospective operator (the author). Zero observed human guests in production across every 2026 feature run (`hospitality-service-ux`, `venue-onboarding-floor-plan`, `auth-handshake-flows`, `hospitality-animations` all closed with no observed human).

## Why now

- **The guest is told where to put it, and the receipt never says it back** (measured on `origin/main` `6d27b5b47`, corrected 2026-09-28 by the PRD stage). The booking widget's `GuestDetailsForm` has one free-text **Special Requests** field whose placeholder reads "Allergies, celebrations, seating preferences..."; it persists as `Reservation.notes` (`PublicHoldConfirmBodySchema` → `confirm-hold.ts`). `notes` reaches the host ticket (`ReservationSheet` "Notes", `BriefingPage`) and the public manage page ("Special Requests"), but **not** the widget's `ConfirmationView` and **not** the confirmation email (`booking-notifications.ts` passes `specialRequests`; `packages/notifications/src/email-content.ts` `buildBookingEmail` never renders it). The structured `Reservation.occasion` / `seatingPreference` columns exist (migration `20260524021334_add_occasion_seating_preference`) but **no write path persists them and no UI sends them** — every real row is null, so the Briefing occasion badge and "Prefers:" line have never had data. `Guest.dietaryRestrictions` lives on the CRM record and is shown staff-side only.
- **Correction:** the first version of this brief said the widget captures `occasion` and `seatingPreference`. That was wrong — inferred from grep hits in test files, not from reading the form. Every downstream statement built on it has been corrected here.
- **Charter theme 1** ("close the guest-facing loop — booking, cancellation, confirmation flows that feel production-grade") is what is left after the money side closed: #5715 (mark no-show), #5722 (deposit/no-show payment defects), #5749 (deposit operator visibility) all merged in the last two weeks.
- **The industry moment cuts the right way.** September 2026 press (BusinessStory 09-03, NRN, Yahoo) is a veteran-led pushback against "unreasonable hospitality": restaurants cannot afford a dreamweaver, diners arrive with impossible ideals. Saying back what the guest already typed is the zero-marginal-cost version of being remembered. It is reasonable hospitality, automated.

## Evidence

Every item labelled. No first-hand operator or diner interview was conducted.

- **Measured (repo, corrected 2026-09-28):** the guest's own words (Special Requests → `notes`) are captured and never echoed on the two surfaces a guest sees at booking time — `ConfirmationView` and the confirmation email; structured occasion/seating are never captured or persisted at all. Zero hits for rating/survey/feedback capture anywhere in `services/reservations` or the app.
- **Measured (repo, constraint):** `REDIS_URL` is unset in production, so booking reminders, waitlist expiry, and post-visit notifications have never been scheduled there (`docs/backlog.md`, seed from #3763). Any "before arrival" touchpoint that is a _timed send_ is not live today; confirmation and manage-page are synchronous and unaffected.
- **Measured (market shape, web):** Resy routes occasion/allergy tags into the guest profile and, via a 2026 Toast integration, onto servers' handhelds; OpenTable offers a free-text request box the restaurant can accept, decline, or call about. Staff-side surfacing is table stakes for incumbents. **Unverified:** whether any incumbent emails the guest an acknowledgement that names what they asked for. Recorded as an unknown, not a gap.
- **Anecdote (diner reviews, undated and 2019):** "the booking already noted the occasion was to celebrate a birthday, but nothing was acknowledged"; "not one staff member wished us a happy anniversary (despite booking the same way as last year)"; Kucina, Singapore, 2019: birthday noted on the website booking _and acknowledged by staff_, the next table got a song and cake, theirs got "not even a birthday wish", verdict "$160+ not worth it". The last one shows acknowledgement-then-nothing is worse than silence.
- **Anecdote (guest-coaching content, 2026):** a current guide on how to write celebration notes: "a note that names the occasion, names the guest, and makes one concrete request gets written onto the seating chart, while 'please make it special' gets a sympathetic shrug." Guests are being coached to write defensively because notes are known to be missed.
- **Anecdote at community scale (last30days, 30-day window, Reddit + YouTube + HN):** **silence on the specific problem.** No thread in the window about an occasion note being honoured or missed. What r/finedining did talk about is ranking restaurants on hospitality warmth: "the service/hospitality they showed me was very close second" (Atomix vs The Modern), "Staff are also beyond warm and top notch" (u/Mister_Glass_, 21 upvotes, Sézanne thread). r/Serverlife's month was corporate-vs-floor tension and online reviews, not guest notes. Silence is silence.
- **Anecdote (industry press, September 2026, the contradiction):** BusinessStory / NRN / Yahoo, veteran NYC server Winterman: post-_The Bear_ S2 diners arrive with "a heightened and nearly impossible ideal of what a restaurant can or is expected to deliver"; restaurants "don't have the resources to hire a full-time dreamweaver"; the industry should "embrace the value of reasonable hospitality." This cuts against any "magic moment" framing and **for** a feature that only promises what the venue was already told and can actually do.

## Solution hunch

Say it back, once, in one human sentence, at every guest touchpoint that already exists: the confirmation view, the confirmation email, the manage page, and the reminder when a scheduler exists. "Happy anniversary, Sam. Window table noted, and the kitchen knows about the nut allergy." The host's ticket (`ReservationSheet`, the `BriefingPage` line) carries the identical sentence, so guest and host are reading the same words. A hunch, not a design; the sentence generator, the guarantee semantics for seating, and the allergy chain are PRD and Architect questions.

**Decided 2026-09-28 (user, after the PRD stop-and-surface):** say the guest's **own words** back. The Special Requests text the guest typed is quoted, verbatim and escaped, under one warm acknowledgement line on the widget's confirmation view and in the confirmation email, with the manage page brought to the same copy. The host ticket already shows `notes`, so "noted for the kitchen" claims only what is true: the words are on the ticket. The generated-from-structured-fields sentence ("Happy anniversary, Sam") is out; structured occasion/seating capture is a separate backlog seed.

## Success in one sentence

A guest who typed an occasion, a seating preference, or an allergy sees it acknowledged before they arrive, and the host's ticket says the same thing.

## Unknowns & risks

- **Timed sends are dead in prod.** Reminders need the Redis decision (#3763 seed). If "before arrival" is scoped to include a reminder, the feature is half-live until that decision lands. Confirmation and manage page do not depend on it.
- **Over-promising a seat.** "Window table noted" reads as a promise. If the floor plan cannot guarantee it, the acknowledgement is worse than the receipt it replaces (the Kucina review is exactly this shape). Wording must distinguish _noted_ from _guaranteed_.
- **Allergy is a safety claim, not copy.** "The kitchen knows" must be backed by something that reaches the kitchen. A templated sentence with no chain behind it is a liability, not hospitality.
- **Incumbent parity unknown.** If OpenTable/Resy already acknowledge by email, this is parity and polish, not "award-winning". Still charter-valid; the framing changes.
- **Unobservable population.** Dashboards sit behind Auth0 with no credentials and zero observed humans. The public confirmation and manage pages _are_ observable in production without auth; success evidence has to be gathered there or it will not be gathered at all.
- **Data is partial by design.** `occasion` may be `other`/`none`, `seatingPreference` may be `no_preference`, `dietaryRestrictions` is free JSON, `staffNotes` is staff-private. The sentence has to degrade to nothing gracefully rather than to "Happy none".
- **No external pull.** Community silence plus population-of-one means the only demand signal is the author's judgement and the charter. It dies quietly if no real guest ever books.
- **Schema rule.** Any new field must be additive (charter guardrail 3). The hunch needs none, but the PRD should confirm.
