# Spike: Guest Passport

Refs #9496. Source: `docs/ideas/2026-10-11.md` #4. Decision doc only, no code. Not legal advice.

## Answer first

Guests are strictly per venue today, by design and by database policy. A passport needs a new,
guest-proven identity that sits above those per-venue rows, plus per-venue consent. The smallest
honest pilot is two venues in one `VenueGroup` under one owner, sharing a single reliability
signal after the guest opts in at each venue.

**Recommendation: defer.** No code until the Owner has a legal review of the consent and data
model below. If that review clears it, build the two-venue same-group pilot. Cut the cross-owner
network version for now.

## Identity model today

- **A guest is a per-venue row.** `Guest` has `venueId` and unique `(venueId, email)` and
  `(venueId, phone)` (`services/reservations/prisma/schema.prisma`). The same person at two venues
  is two unrelated rows with separate `visitCount`, `noShowCount`, `dietaryRestrictions`,
  `stripeCustomerId`.
- **Cross-venue linking is blocked on purpose.** `services/reservations/src/services/guest-link.ts`
  says "Cross-venue linking is impossible by construction": lookups use the venue-scoped uniques
  and an id is checked against `guest.venueId`.
- **The database enforces it.** `guests` carries `FORCE ROW LEVEL SECURITY` keyed on
  `app.venue_id` (ADR-026, `services/reservations/CLAUDE.md`). A query without a venue context
  returns zero rows.
- **Guests have no account.** The users service `User` (`services/users/prisma/schema.prisma`) is an
  Auth0 identity keyed by email. Public bookings are anonymous; guests act through signed manage
  links (`manage-token-scope.ts`, `MANAGE_TOKEN_SECRET`). `Reservation.userId` exists for signed-in
  bookers and is not linked to `Guest`.
- **Precedent for a narrow cross-venue read.** `app_reservation_venue_ids_for_user()` (a `SECURITY
DEFINER` function) returns venue ids only, and the caller then reads each venue in its own
  context (`reservation.ts` `listByUserId`). `app_cross_venue_venues()` is the other named hatch.
  ADR-026 §3.1 says adding a caller needs review.
- **Groups exist but share nothing.** `VenueGroup` (id, name, slug, settings) and
  `Venue.venueGroupId` exist. No guest code reads the group.
- **Recognition today.** `recognizeGuest` (`guest-recognition.ts`) answers by email within one
  venue. The public route (`public-guest-recognition.ts`, 10/min) returns first name and visit
  count for any email, with no proof that the caller owns it.
- **Reliability today.** `assessGuestReliability` (`guest-reliability.ts`) turns `noShowCount`,
  `visitCount` and `lastNoShowAt` into a risk score against the venue's `autoDepositAfterNoShows`.
  That score decides whether the deposit step shows.

## Options for cross-venue identity

| Option                      | How it links                                               | Verdict                                                                                                        |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Silent email/phone match    | Join `Guest` rows across venues on equal email or phone.   | **Reject.** No consent. Shared or recycled phones give false matches. Would read across RLS for every booking. |
| Group-level guest graph     | Venues in a `VenueGroup` share guest rows by owner choice. | **Reject as default.** The owner consents, the guest does not.                                                 |
| Explicit, guest-proven link | Guest proves email ownership, then opts in per venue.      | **Choose.** Consent is per venue and revocable. The link is a row we can delete.                               |

Chosen model:

- `GuestPassport { id, emailHash, verifiedAt, revokedAt }`. One per verified email. Not
  venue-scoped. Holds no profile data.
- `PassportLink { passportId, venueId, guestId, consentedAt, revokedAt, consentTextVersion }`.
  Venue-scoped and under RLS like `guests`. One row per venue the guest opted into.
- Verification: a one-time signed link emailed to the address, reusing the HMAC token pattern.
  Booking with an email is not proof.
- Reads: one new `SECURITY DEFINER` function returns, for a passport, the derived signal from
  other linked venues only. It never returns a `Guest` row. Same shape as
  `app_reservation_venue_ids_for_user`.

## Consent flow

1. After a booking at venue A, the confirmation or manage page offers "Carry your good standing to
   other venues in <group>". Off by default.
2. The guest verifies their email (signed link) and ticks a consent box that names exactly what is
   shared and with whom. We store `consentedAt` and `consentTextVersion`.
3. At venue B, the guest sees the same offer and opts in separately. Nothing flows to B until B's
   link exists. Consent is per venue, not per group.
4. **Revoke:** a "my passport" page reached from the manage link
   (`apps/hospitality/src/pages/ManageReservationPage.tsx`) lists linked venues. Revoking one sets
   `revokedAt` and stops all reads for that venue at once. Revoking the passport revokes every link.
5. **Venue side:** staff see "Passport: reliable" on the booking. They cannot see which other venue
   it came from, and cannot opt a guest in.

## Exactly what is shared

Shared, from other linked venues, computed at read time:

- One reliability band: `reliable`, `new` or `review`. Derived from summed `visitCount` and
  `noShowCount` through `assessGuestReliability`. No counts, dates or venue names.

Not shared, ever, in the pilot:

- Name, phone, notes, `staffNotes`, `tags`, `lifetimeSpend`, visit history, occasions, reservation
  details, `stripeCustomerId`, which venues the guest visits.
- `dietaryRestrictions`. Allergies can be health data. A later, separate opt-in could add it, after
  legal review. Not in the pilot.

What the band does at venue B: it can waive the deposit step the same way a low risk score does
today. Nothing else.

## Smallest two-venue pilot

- Two venues in one `VenueGroup`, same owner. In the live deployment that is the `demo-bistro` demo
  venue (`services/reservations/src/services/demo-venue.ts`) plus a seeded sister venue, so it can
  be shown without real guests.
- One signal (the band), one effect (deposit waiver), one consent screen, one revoke page.
- No cross-owner sharing, no guest agents, no public credential format.
- Measure for 6 weeks with a real operator: opt-in rate at booking, waivers granted, no-shows
  among waived bookings vs the venue's base rate. Kill if opt-in is under 10% or waived bookings
  no-show more than the base rate.

## Legal-risk list for the Owner

This list flags questions. It is not legal advice. **This feature needs review by a qualified
lawyer before any code ships.**

1. **Lawful basis and consent.** GDPR and CCPA/CPRA-style laws treat sharing personal data between
   businesses as a distinct purpose. Is per-venue, opt-in, unticked-by-default consent enough? Does
   the consent text meet "specific, informed, unambiguous"?
2. **Controller roles.** Within one owner's group, who is the controller? Across owners (out of
   scope here), each venue is likely a separate controller, and the platform may be a processor or
   a joint controller.
3. **"Sale" or "sharing" under CCPA/CPRA.** Does a reliability band that waives a deposit count as
   sharing for value? Does it need a "do not sell or share" path?
4. **Profiling and automated decisions.** A band that changes whether a deposit is required is an
   automated decision about a person. Does it need an explanation or a way to contest it?
5. **Health data.** Dietary and allergy notes may be special-category data. The pilot excludes
   them. Confirm that exclusion is enough.
6. **Data minimisation.** Confirm a single derived band is the minimum needed, and that raw counts
   never leave the venue.
7. **Deletion and access requests.** Today only staff can delete a guest (`guestService.delete`,
   `routes/guests.ts`). There is no guest self-service export or delete. A passport adds a
   guest-facing identity, which makes access and deletion requests a direct obligation.
8. **Retention.** How long do `PassportLink` rows and revoked consents stay? Proof of consent may
   need to outlive the link.
9. **Children and age.** No age data is collected. Confirm that is acceptable.
10. **Cross-border.** Venues in different jurisdictions (EU, UK, California, Canada) may each need
    different consent text.
11. **Existing recognition leak.** The current public recognition route reveals first name and
    visit count to anyone who knows an email. Review it before building more recognition on top.

## Recommendation

**Defer. Gate on legal review. If cleared, build the two-venue same-group pilot. Cut the
cross-owner network.**

Reasons:

- Identity changes are HITL-only under `PRODUCT.md` guardrail 2 ("no auth-model changes"), and
  this adds a guest-facing identity.
- RLS isolation of `guests` is a deliberate security property. Any read across it must be one
  named, reviewed function, not a general join.
- The pilot is small once cleared: two new tables, one function, two screens.
- The cross-owner version has the cold-start problem the idea doc names and the heaviest legal
  load. It has no path until the pilot proves guests opt in.

## Proposed child issues

**Proposed, not filed: the Owner decides. All blocked on the legal review.**

1. **chore(legal): passport consent and data review.** AC: the Owner records the outcome of a
   lawyer's review of this doc's consent text, shared fields and deletion path.
2. **feat(reservations): `GuestPassport` and `PassportLink` models.** AC: additive migration;
   `PassportLink` under FORCE RLS; RLS sweep fixture; no profile columns on `GuestPassport`.
3. **feat(reservations): email verification for a passport.** AC: a one-time signed link verifies
   ownership; expired or reused links fail with 410.
4. **feat(reservations): passport band read function.** AC: one `SECURITY DEFINER` function
   returns only the band from other linked, unrevoked venues; integration test proves no row data
   leaks and revoked links are excluded.
5. **feat(hospitality): opt-in and revoke screens.** AC: opt-in from confirmation or manage page,
   per venue, unticked by default; "my passport" lists and revokes links.
6. **feat(reservations): deposit waiver from the band.** AC: at a linked venue, `reliable` skips the
   deposit step exactly as a low risk score does; covered by a route test.
7. **feat(reservations): guest delete cascades the passport.** AC: deleting a guest or passport
   removes its links; consent proof retention follows the legal outcome.
