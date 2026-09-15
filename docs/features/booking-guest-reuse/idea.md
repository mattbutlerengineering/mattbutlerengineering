---
stage: idea
run: feature:booking-guest-reuse
date: 2026-08-31
---

# Idea: Reuse existing guests when creating a reservation / walk-in / waitlist entry

## Problem

When staff take a reservation or seat a walk-in for a regular, they type the guest's details from scratch and the system treats the guest as a stranger. The guest's history — visit count, no-show record, dietary restrictions, staff notes — doesn't follow them into the booking, and the venue accumulates several disconnected copies of the same person.

## Who has it

Hosts and managers using the hospitality app's staff-side entry points (`NewReservationDialog`, `WalkInDialog`, waitlist add). They cope by retyping guest info every time; guest context lives only on the separate Guests page, unlinked at booking time. The venue's guest CRM itself is the second sufferer: every staff booking can mint an orphan `Guest` row, so profile quality decays with use.

## Why now

The CRM foundation already exists and is being bypassed. The `Guest` model carries `visitCount`, `noShowCount`, `lifetimeSpend`, `dietaryRestrictions`, `tags`, `staffNotes`; the backend already exposes `GET /guests/search` and `POST /guests/find-or-create` plus `findByEmail`/`findByPhone`; `POST /reservations` accepts a `guestId`. Every merged booking-flow improvement increases staff bookings — and each one currently deepens the duplicate problem.

## Evidence

**Design-gap evidence, labelled as such — no duplicate-count has been measured** (no prod-DB access from the dev loop; a count query is a possible later human step, not a blocker).

- `apps/hospitality/src/components/reservations/NewReservationDialog.tsx` collects free-text `guestName`/`guestEmail`/`guestPhone` (lines 17–19) and never calls any lookup; it submits without a `guestId`.
- `services/reservations/src/services/reservation.ts:146` sets `guestId: data.guestId ?? null` — the link exists in the schema but the staff UI never supplies it.
- `apps/hospitality/src/components/timeline/WalkInDialog.tsx` has a single optional free-text "Guest Name" field (line 166) — no email/phone, no lookup.
- `services/reservations/src/routes/guests.ts` already serves `/search` (line 88) and `/find-or-create` (line 267); neither is called from any staff booking flow.
- The public widget already has read-only email recognition (`public-guest-recognition.ts`, rate-limited 10/min) — precedent that matching is wanted, but it stops at recognition.

## Solution hunch

(A hunch, not a design.)

- **Staff surfaces (reservation, walk-in, waitlist):** typeahead against `/guests/search` as staff types name/email/phone; picking a suggestion links the `guestId` and shows a compact history strip (visits, no-show risk, dietary). If staff ignores suggestions, an exact email/phone match at submit still auto-links silently (find-or-create semantics) rather than minting a duplicate.
- **Public booking widget:** no visible change — the widget must not surface any guest information to the person booking. But server-side, a widget booking whose email/phone exactly matches an existing guest should link to that guest instead of creating a new row.

## Success in one sentence

A returning guest booked by staff never creates a duplicate profile, and their history (visits, no-shows, dietary) is visible at booking time.

## Unknowns & risks

- **Match semantics:** shared family phone numbers / group-inbox emails can link the wrong person; exact-match-only vs fuzzy is a real decision (hunch: exact email OR exact normalized phone; name is never a match key, only a search key).
- **Phone normalization:** free-text phone formats today; matching needs a canonical form, and existing rows weren't normalized on write.
- **Privacy at the public edge:** silent server-side matching must not become an existence oracle (the widget response can't differ observably between matched and new guests); the recognition endpoint's rate-limit precedent applies.
- **Walk-in flow friction:** walk-ins are speed-critical and currently name-only; adding lookup must not slow seating (typeahead has to be optional, never a gate).
- **Existing duplicates:** this feature stops NEW duplicates; merging historical ones is a different (out-of-scope) feature — risk that success reads as "duplicates gone" when old rows persist.
- **Guest scoping is per-venue** (`Guest.venueId`): matching stays within a venue; cross-venue identity is explicitly out.
- Dies if: staff find the typeahead slower than retyping (adoption zero), or matching mislinks and staff stop trusting the history shown.
