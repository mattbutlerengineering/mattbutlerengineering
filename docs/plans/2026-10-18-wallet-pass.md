# Wallet Pass — feasibility check + build plan

> **Status: future plan — blocked on external accounts.** Needs an Apple Developer Program membership (Pass Type ID certificate + APNs) and a Google Wallet issuer account. Needs no venue history and no LLM key. Nothing here is filed as an issue; run `/decompose` on this file once the accounts exist. File references verified against `main` at `56fedb2c2`, 2026-10-18.

## Context

Every booking gets "Add to Apple Wallet / Google Wallet". The pass is the venue's branded card (logo, colours, date, time, party, table) and it **updates itself**: it surfaces on the lock screen on the night (relevant date + venue location), changes when staff move the reservation, and flips to "Your table is ready" when Host Stand (#7055) seats a waitlist party. Airline-grade polish from a 40-seat bistro; a lock-screen nudge on the night helps no-shows. Matt loved it (2026-10-18). Companion plans: Brand Match (#7048) styles it, Choose Your Table (#7050) prints the table, The Invitation (#7053) can hand each invitee a pass.

## Verdict: feasible, but the heaviest external setup of the 2026-10-18 plans

| Piece                                                            | Exists?        | Where                                                                                                                                                   |
| ---------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Add to calendar" surfaces to sit beside                         | yes            | `apps/hospitality/src/utils/ics.ts`; `booking-widget/ConfirmationView.tsx:224`; `pages/ManageReservationPage.tsx:271`                                   |
| Guest token flow (login-free)                                    | yes — pattern  | `generateManageToken` (`services/reservations/src/routes/public-reservations.ts:26`) — signed, NOT encrypted (carries email); passes must not embed it  |
| Domain events to trigger updates                                 | yes            | `reservation:updated/cancelled`, `table-status:changed` (`services/reservations/src/services/events.ts`)                                                |
| Background job runner                                            | yes — degraded | `@mbe/jobs` `JobWorker` (`services/reservations/src/services/job-worker.ts`); prod has no `REDIS_URL`, so jobs never schedule there (`docs/backlog.md`) |
| Wallet pass generation / PassKit web service / Google Wallet API | **no** — new   | nothing in repo                                                                                                                                         |

## Approach

### 0. Accounts (human, blocking)

Apple Developer Program → Pass Type ID + signing certificate + APNs auth key; Google Wallet issuer + service account. Store as secrets (never in repo — see `docs/SECRETS.md`); startup validation that they're present when the feature flag is on. Calendar-reminder for certificate expiry.

### 1. Pass model + pure builder

`buildPassContent(reservation, venue, theme?) → PassContent` (pure, unit-tested): fields, colours (Brand Match theme or rialto defaults, contrast-checked), relevant date, venue location if the profile has coordinates. **No guest phone/email on the pass.** One content model, two renderers.

### 2. Apple

- `.pkpass` = zip of `pass.json` + images + `manifest.json` (SHA-1 per file) + detached PKCS#7 `signature` with the Pass Type cert + WWDR intermediate. Use a maintained library (evaluate `passkit-generator`) via `dependency-update-reviewer`.
- `GET /public/v1/passes/apple/:serial` behind an opaque per-pass `authenticationToken` (random, hashed at rest).
- PassKit web service: register/unregister device, list updated serials, latest pass, log — per Apple's spec, under `/public/v1/passes/apple/v1/...`.
- `WalletPassRegistration { deviceLibraryId, pushToken, serial, createdAt }` + `WalletPass { serial, reservationId, authTokenHash, updatedAt, platform }` — additive migration (`migration-reviewer`).

### 3. Google

Pass class per venue + object per reservation; "Save to Google Wallet" signed-JWT link; updates via Wallet REST API `PATCH` on the object.

### 4. Live updates

Listener on `reservation:updated/cancelled` and `table-status:changed` → bump `WalletPass.updatedAt` → Apple: empty APNs push to registered devices; Google: object `PATCH`. Run inline with timeouts + retry-once until the job queue has Redis in prod; never block the guest-facing request on it.

### 5. UI

Official "Add to Apple Wallet" / "Add to Google Wallet" badges (brand guidelines) on `ConfirmationView` and `ManageReservationPage`, platform-detected, beside the .ics button. Strings in `en-US.json` / `fr-CA.json` / `es-MX.json`.

## Risks

- **External accounts + cert expiry** are the real blocker and an ongoing chore → secret validation at startup, expiry alert.
- **PII on a forwardable artifact** → pass shows venue/date/time/party/table only; opaque per-pass token; never embed the manage token.
- **Update delivery without a queue** → inline best-effort with logging; revisit when prod gets Redis.
- **Signing correctness** is unforgiving (iOS silently rejects bad passes) → golden-file tests of `manifest.json` hashing and a real-device check before release.

## Delivery

After step 0: `/decompose` into ordered issues: (1) `buildPassContent`, (2) Apple `.pkpass` generation + download route, (3) wallet badges in UI, (4) PassKit web service + registrations, (5) update listener + APNs, (6) Google pass + save link, (7) Google updates, (8) E2E + device checklist. Steps 1–3 already ship a static pass. TDD each.

## Verification

- Unit: `buildPassContent` fields and no-PII guarantee; manifest hashing; token hashing/compare.
- Route: pass download 401 on bad token; PassKit endpoints per spec status codes; cancelled reservation → pass shows cancelled.
- E2E: confirmation page shows platform-correct badge; download returns `application/vnd.apple.pkpass`.
- Manual (required): add pass on a real iPhone and Android, move the reservation in the dashboard, confirm the pass updates on both; lock-screen relevance on the night.
