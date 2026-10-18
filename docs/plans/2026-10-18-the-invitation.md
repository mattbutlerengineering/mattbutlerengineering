# The Invitation — feasibility check + build plan

> **Status: future plan — unblocked, not yet filed.** Needs no venue history and no LLM key. Nothing here is filed as an issue; run `/decompose` on this file to start it. File references verified against `main` at `56fedb2c2`, 2026-10-18.

## Context

The hospitality product has no users yet. Every other 2026-10-18 idea wows the people already using it; The Invitation is the one that **brings new people in**.

After booking, the guest gets a beautiful, branded invitation card for the night (venue, date, time, party, animated reveal) and one link to **send to everyone in the party**. Friends open it, see the card, tap "I'm in" and add it to their calendar; the booker sees who's confirmed. Pasted into iMessage/WhatsApp, the link unfurls as a rich preview card. Every booking reaches 2–6 more people, each seeing the venue's brand and a subtle "Booked with …". Owners get fewer no-shows (whole-party commitment) and a pre-arrival headcount ("4 of 5 confirmed"). Matt loved it (2026-10-18). Companion plans: Snap Your Room (#7047), Brand Match (#7048, styles the card), Dress Rehearsal (#7049), Choose Your Table (#7050, "your table: the window booth" on the card).

## Verdict: feasible — one new token, one small table, one edge renderer

| Piece                                             | Exists?                   | Where                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar export (.ics)                            | yes — reuse               | `apps/hospitality/src/utils/ics.ts` (`buildReservationIcs`, `downloadIcsFile`), used by `ConfirmationView.tsx:224` and `ManageReservationPage.tsx:271`                    |
| Login-free guest page reached by a token link     | yes — pattern             | `apps/hospitality/src/pages/ManageReservationPage.tsx`                                                                                                                    |
| Signed-token infra (HMAC, timing-safe compare)    | yes — pattern, NOT format | `generateManageToken` / `secureCompareHex` (`services/reservations/src/routes/public-reservations.ts:26-38`), secret via `config/manage-token.ts` (`MANAGE_TOKEN_SECRET`) |
| Booking confirmation surface for the share button | yes                       | `apps/hospitality/src/components/booking-widget/ConfirmationView.tsx`                                                                                                     |
| Edge worker in front of the apps                  | yes                       | `infrastructure/worker/` (`edge-router.js`, `origin-proxy.js`, `csp.js`, `rate-limiter.js`)                                                                               |
| Share / invite / RSVP of any kind                 | **no** — new              | no `navigator.share`, no invite token, no RSVP model                                                                                                                      |
| Link-preview (`og:`) image                        | **no** — new              | chat apps need PNG, not SVG                                                                                                                                               |

### Security finding that shapes the design

The manage token is `base64url(reservationId:guestEmail:expiry:signature)` — **signed, not encrypted**. Anyone holding it can decode the booker's email. That's acceptable for a link mailed only to the booker, but an invite link is _meant_ to be forwarded. **The invite token must not reuse the manage-token format, and must never grant manage/cancel rights.**

## Approach

### 1. Invite token

Opaque random id (≥128 bits, `crypto.randomBytes`), stored hashed on a new `ReservationInvite { id, reservationId, tokenHash, revokedAt, createdAt }` row — revocable, carries no PII, independent of `MANAGE_TOKEN_SECRET`. Created lazily on first share. Revoked automatically when the reservation is cancelled. Additive migration (`migration-reviewer`).

### 2. RSVP storage

`ReservationRsvp { id, inviteId, firstName (≤40 chars), status: IN | OUT, createdAt }` — first name only, no contact data. Cap RSVPs at `partySize + 2`. Per-IP rate limit on writes.

### 3. Public invite API — `services/reservations/src/routes/public-invites.ts`

- `GET /public/v1/invites/:token` → `{ venue: { name, slug, theme? }, date, time, partySize, rsvps: [{ firstName, status }], status }` — **never** booker name/email/phone, notes, or reservation id. Response-schema snapshot test pins the field list.
- `POST /public/v1/invites/:token/rsvp` `{ firstName, status }`.
- Cancelled / revoked / past → 410 with a friendly page state.

### 4. Invite page — `/i/:token` in hospitality

The card (animated reveal, `prefers-reduced-motion` respected), RSVP list, "I'm in" / "Can't make it", add-to-calendar via existing `buildReservationIcs` (without the cancellation URL). Rialto tokens; Brand Match theme when available. Strings in `en-US.json` / `fr-CA.json` / `es-MX.json`.

### 5. Share entry points

"Invite your party" on `ConfirmationView` and `ManageReservationPage`: `navigator.share` with copy-link fallback. Booker-side RSVP summary on the manage page.

### 6. Link preview

Edge worker handles `/i/:token` for crawler user-agents (or always): injects `og:title` / `og:description` / `og:image` into the HTML. `og:image` → `/i/:token/card.png` rendered at the edge (Satori + resvg-wasm), cached per invite. **Fallback first:** ship a static per-venue PNG, then the dynamic one. Check `csp.js` and worker bundle-size limits before choosing the renderer.

### 7. Staff view

"4 of 5 confirmed" chip on the reservation in `TimelineGrid` / reservation details.

## Risks

- **PII leakage via forwarded links** → opaque token, explicit response allow-list, snapshot test; never reuse the manage-token format.
- **Abuse of public RSVP writes** (spam names) → per-IP rate limit, RSVP cap, length/charset validation, owner can revoke an invite.
- **Edge PNG rendering** is new infra (wasm size, cold start) → static fallback ships first.
- **Growth attribution** → add a `ref=invite` param so invite-driven visits are measurable once usage instrumentation exists.

## Delivery

`/decompose` into ordered issues: (1) `ReservationInvite` + token create/revoke, (2) public GET invite with allow-list snapshot, (3) `ReservationRsvp` + POST rsvp, (4) `/i/:token` page, (5) share buttons on confirmation + manage page, (6) static `og:` preview via worker, (7) staff RSVP chip, (8) dynamic PNG card, (9) E2E. Steps 1–6 are the shippable loop. TDD each. Suggested order across plans: Dress Rehearsal → **The Invitation** (growth) → Choose Your Table.

## Verification

- Unit: token generation/hash/compare, revoke-on-cancel, RSVP cap and validation.
- Route: GET invite payload contains only allow-listed fields (snapshot); revoked/cancelled → 410; RSVP rate limit 429; manage endpoints reject an invite token.
- E2E (hospitality Playwright): book → "Invite your party" → open `/i/:token` in a fresh context → RSVP "I'm in" → booker's manage page shows it → cancel reservation → invite page shows cancelled.
- Manual: paste a preview-deploy invite link into iMessage, WhatsApp and Slack and confirm the card unfurls; probe the deployed page for CSP refusals.
