# UX audit — GUEST-FACING SURFACES + FRONT DOOR (phone-first)

Playbook read (`## Finding format`, `## Ordering`, `## 1. Correctness`, `## 10. Inert mechanisms`). Tree audited: `.claude/worktrees/hospitality-service-ux` @ `5f642aa42` (= origin/main). Live site probed 2026-09-04 04:34–04:52 UTC (2026-09-03 21:34–21:52 PDT) as an anonymous guest; no writes performed on prod (no hold, no confirm, no cancel, no sign-in completed — stopped at the Auth0 login form).

`$OUT` below = `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/7021d85d-b6aa-49c2-ad30-8ddcadb02175/scratchpad/ux-audit/out/guest/`. Each state dir holds `mobile.png` (390×844), `mobile-full.png`, `desktop.png` (1440×900), `aria.yaml`, `meta.json` (h1/h2/buttons, body text, every `/api/`+`/public/` request with status + content-type + body head, console, timing). Specs: `apps/hospitality/e2e/.ux-audit/specs/guest/{local-states,local-flow,live,followup}.spec.ts` + `helpers.ts` (git-excluded).

## What was walked

| Surface                                                                                                                                                                                                          | Local (mocked, anonymous)                                     | Live (prod, anonymous)                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `book/<slug>` full flow: date+party → slots → hold → details → confirm → confirmation; cancel-button click; unload                                                                                               | `$OUT/local-flow/01…07`, `60-unload-beacon`                   | `book/the-oak-table`, `book/test-venue` → `$OUT/live/book-*` (+ `book-not-found-after-go-back`)                         |
| Edge states: no slots→waitlist→joined; hold 409; confirm 500; availability 500; hold expiring (6 s) + already-past; past date typed; party cap; deposit-enabled venue; guest TZ ≠ venue TZ                       | `10–12`, `20–22`, `30–32`, `40–41`, `50–52`, `70-timezone-la` | not reachable (no venue resolves, see F-02)                                                                             |
| `reservations/manage`: no token / 404 / 410 / valid / HTML-200-like-prod                                                                                                                                         | `$OUT/local-states/manage-*`                                  | `$OUT/live/manage-probe-token`, `manage-no-token`                                                                       |
| Front door: landing, `/callback` (no params / code+bad state / access_denied), Sign-In click (IdP blocked), session-expired (storageState with `expires_at` in past), `/signout`, `/auth-failure`, unknown route | `$OUT/local-states/*`                                         | `$OUT/live/landing`, `callback-no-params`, `signout-route`, `auth-failure-route`, `unknown-route`, `signin-handoff-idp` |
| Embed demo (authed, `booking-widget`, "Mobile" frame)                                                                                                                                                            | `$OUT/local-embed/demo-mobile-frame` (+ `frame-only.png`)     | not walked (needs sign-in)                                                                                              |

Viewports: every state captured at 390×844 and 1440×900. Environmental noise excluded: `static.cloudflareinsights.com/beacon.min.js` `ERR_CONNECTION_REFUSED` on every live page (LAN DNS sinkhole); local `localhost:3999` `ERR_CONNECTION_REFUSED` for the unmocked `/public/v1/venues/*/guests/recognize` call (harness — dead `VITE_API_URL`); Auth0 tenant branding on the hand-off page (#4848 / PR #4924); the default `mockApi` hold fixture's `expiresAt` in the past (harness, already handled by `booking-widget-calendar.spec.ts:43`); fixture-vs-typed name mismatch on the confirmation (`Alice Johnson` is the fixture reservation).

## Findings

### [CORRECTNESS-01] Every `/public/v1/*` guest call on prod gets the SPA's HTML, not the API — manage links, guest recognition, waitlist join, deposit config and add-to-calendar are all silently dead

- **Evidence**: `infrastructure/worker/edge-router.js:143` — only `url.pathname.startsWith("/api/")` is proxied to `API_ORIGIN`; `/public/*` falls through to the static-site catch-all (`routes-config.json` prefix `""`). `packages/api-client/src/reservations.ts:179`, `venues.ts:88`, `public-venue.ts:35,46,57,71` — five guest endpoints live under `/public/v1/`. `packages/api-client/src/client.ts:104` — `await response.json()` on a 200 with an HTML body throws, so every consumer's `catch` fires: `ManageReservationPage.tsx:41` → `ManageTokenError("Invalid link")`; `useBookingFlow.ts:387-390` → "Non-fatal — proceed without deposit" (also drops `venueConfig`, which hides Add-to-Calendar per `ConfirmationView.tsx:190`); `useGuestRecognition.ts:49` → no "Welcome back".
- **Reproduction**: live, `$OUT/live/manage-probe-token/meta.json`: `GET https://mattbutlerengineering.com/public/v1/reservations/manage?token=… → 200 text/html` (body `<!doctype html>…`), page renders **"Invalid Link — This link has already been used or is invalid."** (`mobile.png`). Same mechanism replayed locally with an HTML-200 mock: `$OUT/local-states/manage-html-200-like-prod` renders identically to the 404 case. `curl https://mattbutlerengineering.com/public/v1/venues/the-oak-table` → HTML; `https://api.mattbutlerengineering.com/public/v1/venues/the-oak-table` → Fastify 404 `Route GET:/public/v1/venues/... not found` (route isn't even mounted at that origin's path).
- **Impact**: every "manage your reservation" link in every confirmation email/SMS resolves to "Invalid Link" — a guest who wants to cancel is told their link is used up. When a venue does resolve (F-02), the widget runs deposit-less, recognition-less, waitlist-less and calendar-less with zero error surfaced anywhere (no Sentry, no console — the catch is total).
- **Effort**: S for ingress (#4565's PR); S for the client hardening below.
- **Risk**: LOW — additive route; client change only turns a silent branch into a distinct error.
- **Keeps it fixed**: `nothing` today. Ship with it: a live probe in `site-audit` that asserts `content-type: application/json` on `GET /public/v1/venues/<known-slug>`, and an `api-client` unit test that a `text/html` 200 raises `ApiValidationError`-class "non-JSON response", not a generic catch.
- **Fix sketch**: land #4565 (proxy `/public/*` like `/api/*`). In `client.ts`, reject non-JSON `content-type` before `.json()` with a typed error; in `ManageReservationPage` map that error to "We couldn't reach the reservation service — try again in a moment" rather than "already been used"; in `useBookingFlow` log the deposit/venue-config failure to Sentry instead of swallowing.

### [CORRECTNESS-02] The live booking widget has no reachable venue — both known slugs 404, and the only action on the not-found page sends the guest to a blank tab

- **Evidence**: `apps/hospitality/src/pages/PublicBookingPage.tsx:36` `publicApiClient.venues.getBySlug(venueSlug)`; `:60` `onClick={() => window.history.back()}` is the sole action on the not-found card; `services/reservations/src/routes/venues.ts:589-591` returns 404 when `getPublicBySlug` finds nothing.
- **Reproduction**: `$OUT/live/book-the-oak-table/meta.json` and `book-test-venue/meta.json`: `GET https://mattbutlerengineering.com/api/v1/venues/by-slug/<slug> → 404 application/json {"detail":"Venue not found"}` (the `/api/v1` proxy itself works); UI = "Venue not found … Go Back" (`mobile.png`). `$OUT/live/book-not-found-after-go-back/meta.json`: clicking Go Back from a direct link → `urlAfter: "about:blank"`.
- **Impact**: PRODUCT.md theme 1 ("close the guest-facing loop") has zero guest-reachable entry on prod for the two slugs anyone in this repo has ever referenced. A guest arriving from a link is dumped onto a blank page. Whether _any_ live venue has a bookable slug could not be determined anonymously — if none does, this is the whole loop.
- **Effort**: S (page) / unknown (data: confirm or publish a live venue slug).
- **Risk**: LOW.
- **Keeps it fixed**: a `site-audit` smoke that fetches `/api/v1/venues/by-slug/<canonical-demo-slug>` and expects 200; today `nothing`.
- **Fix sketch**: confirm a real prod slug (or seed a demo venue) and link it from the marketing site (sitemap only lists `/hospitality`). On the not-found card replace `history.back()` with real exits: "Back to <venue site>" when a `returnTo` is known, else "mattbutlerengineering.com/hospitality".

### [CORRECTNESS-03] Slot times and meal-period headings render in the guest's browser timezone, not the venue's

- **Evidence**: `apps/hospitality/src/utils/format.ts:43-48` `formatTime` → `toLocaleTimeString(LOCALE, {...})` with no `timeZone`; `components/booking-widget/TimeSlotPicker.tsx:60-61` `getHour = new Date(isoTime).getHours()` groups Lunch/Dinner/Late by local hour; `ConfirmationView.tsx:58` reuses `formatTime`; `PublicVenueSchema` (`packages/types/src/schemas/venue.ts:43-48`) has no `ianaTimezone`, and the config that does (`PublicVenueConfigSchema:61`) is fetched from the dead `/public/v1` path (F-01).
- **Reproduction**: `$OUT/local-flow/70-timezone-la/meta.json` — Playwright context `timezoneId: America/Los_Angeles`, venue `America/New_York`, fixture slot `2026-05-17T17:00:00Z` (= **1:00 PM** at the restaurant) renders as **"10:00 AM"** under **"Lunch"**; confirmation (`06-confirmation`) shows `18:00Z` (2:00 PM NY) as "11:00 AM".
- **Impact**: a traveller, a guest in another state, or anyone whose phone TZ differs from the venue books "10:00 AM" and is expected at 1:00 PM. The confirmation and the email agree with each other and disagree with the restaurant. No hint anywhere that a timezone is in play.
- **Effort**: M — add `ianaTimezone` to `PublicVenue`, thread it through `formatTime`/grouping/confirmation.
- **Risk**: MED — `formatTime` is shared with Timeline/ReservationBlock (`format.ts:40-41` "Used by:" list); staff views may _want_ device-local. Introduce `formatTimeIn(iso, tz)` rather than changing the shared one.
- **Keeps it fixed**: a unit test rendering `TimeSlotPicker` under `process.env.TZ=America/Los_Angeles` for a NY venue asserting "1:00 PM" / "Lunch"; ships with the fix.
- **Fix sketch**: widen `PublicVenueSchema` with `ianaTimezone`; pass it into `TimeSlotPicker`, `GuestDetailsForm`, `ConfirmationView`; format with `{ timeZone }`; append the zone abbreviation when it differs from the device.

### [RECOVER-04] Transport errors reach guests verbatim — "POST /api/v1/holds failed: 409 Time slot no longer available"

- **Evidence**: `packages/api-client/src/client.ts:320-321` builds `"${method} ${path} failed: ${status} ${detail}"`; `apps/hospitality/src/components/booking-widget/useBookingFlow.ts:450,485,534` pass `err.message` straight into `slotsError`/`holdError`/`confirmError`; `TimeSlotPicker.tsx:113` and `GuestDetailsForm.tsx:141` render them inside `<Alert variant="error">`.
- **Reproduction**: `$OUT/local-flow/20-hold-409/meta.json` alert = `POST /api/v1/holds failed: 409 Time slot no longer available`; `21-confirm-500` = `POST /api/v1/holds/hold_ux_001/confirm failed: 500 Internal Server Error`; `22-availability-500` = `GET /api/v1/availability/ven_e2e_001?date=2026-09-05&partySize=2 failed: 500 Internal Server Error` (screenshots in each dir).
- **Impact**: the single most likely real-world race (two guests pick the same slot) shows an HTTP verb, an internal path and a venue id to the guest. Contrast: the not-found page deliberately hides exactly this (`PublicBookingPage.tsx:52-54`).
- **Effort**: S.
- **Risk**: LOW.
- **Keeps it fixed**: `useBookingFlow.test.ts` case asserting `holdError` never contains `/api/`; ships with the fix.
- **Fix sketch**: map by `ApiClientError.statusCode` → 409 "Someone just took that time — here are the others still open" (and auto-refresh slots); 5xx/network → "We couldn't reach the restaurant's system. Your details are still here — try again"; keep raw message for Sentry only.

### [INERT-05] The "release hold on tab close" mechanism can never fire — `activeHoldIdRef` has no writer, and the beacon would use the wrong verb anyway

- **Evidence**: `apps/hospitality/src/pages/PublicBookingPage.tsx:25` declares the ref; `:107` is the **only** assignment and it sets `null`; `:44-47` reads it and calls `navigator.sendBeacon(\`${BASE_URL}/api/v1/holds/${holdId}\`)`—`sendBeacon`is always POST, while release is`DELETE` (`packages/api-client/src/availability.ts:97` `release(id)`; mock at `e2e/api-mocks.ts:617-624`accepts only DELETE).`BookingWidget` never exposes the hold id to the page.
- **Reproduction**: `$OUT/local-flow/60-unload-beacon/meta.json` — after creating a hold and navigating away, `nonGetHoldRequestsDuringUnload: []`; total hold traffic for the session is exactly `POST /api/v1/holds 200`. Trace per playbook §10: writer set = ∅.
- **Impact**: every guest who picks a time and closes the tab (phone: the majority) leaves a 10-minute table lock nobody can release; the next guest sees that slot as gone. Meanwhile the code reads as if this is handled.
- **Effort**: S–M.
- **Risk**: LOW — `pagehide`/`visibilitychange` + `keepalive` DELETE is well-trodden; the server already expires holds so the worst case is today's behaviour.
- **Keeps it fixed**: a `PublicBookingPage.test.tsx` asserting a DELETE with `keepalive` is dispatched on `pagehide` when a hold is active; today `nothing`.
- **Fix sketch**: have `useBookingFlow` expose `onHoldChange(hold)`; in the page store the id and on `pagehide` call `fetch(url, { method: "DELETE", keepalive: true })`. Or delete the dead beacon code so the file stops claiming it.

### [NO-DEAD-END-06] "Cancel Reservation" on the public confirmation does nothing

- **Evidence**: `apps/hospitality/src/components/booking-widget/ConfirmationView.tsx:220` renders the button when `cancellationUrl || onCancellation`; `:222-229` only navigates if `cancellationUrl`; `PublicBookingPage.tsx:106-108` passes `onCancellation` (which nulls a ref, F-05) and never passes `cancellationUrl`.
- **Reproduction**: `$OUT/local-flow/07-after-cancel-click/meta.json` — `cancelPresent: 1`, click → `apiCallsDuringCancel: []`, `urlChanged: false`, `stillOnConfirmation: true`; `mobile-full.png` unchanged from `06-confirmation`.
- **Impact**: the one moment a guest most needs a working exit ("oops, wrong day") is a ghost button. Combined with F-01, there is currently no path from a completed booking to a cancellation anywhere on prod.
- **Effort**: S.
- **Risk**: LOW.
- **Keeps it fixed**: `ConfirmationView.test.tsx` asserting the button is absent when no `cancellationUrl`; ships with the fix.
- **Fix sketch**: gate the button on `cancellationUrl` only; have the confirm response carry the manage URL (the server already mints manage tokens for the email) and pass it as `cancellationUrl`.

### [RECOVER-07] Hold expiry throws away everything the guest typed and drops them back to the slot list

- **Evidence**: `useBookingFlow.ts:255-263` `EXPIRE_HOLD` → `step: "time-slot"`; `GuestDetailsForm.tsx:58-61` keeps name/email/phone/notes in component `useState`, so the unmount loses them; `GuestDetailsForm.module.css:13-17` styles the countdown as static amber caption with no escalation.
- **Reproduction**: `$OUT/local-flow/30-hold-countdown-low` (timer "0:05", name+email filled) → `31-hold-expired/meta.json`: `backOnTimeSlots: true`, `nameStillThere: "(form gone)"`, alert "Your hold has expired. Please select a new time."; `mobile.png`. `32-hold-past-expiresAt` shows the same bounce fires within ~2 s when the server returns an already-past `expiresAt`.
- **Impact**: a slow typist on a phone (autofill declined, notes about an allergy) loses it all at 10:00 and must re-enter — the classic "re-entering known data" dead end. The copy is fine; the state loss isn't.
- **Effort**: S–M.
- **Risk**: LOW — lift form state into the reducer (keep `GuestDetails` in `BookingFlowData`).
- **Keeps it fixed**: `useBookingFlow.test.ts` case: EXPIRE_HOLD preserves `guestDetails`; ships with the fix.
- **Fix sketch**: persist typed details in flow state; on expiry re-fetch slots and, if the same slot is still free, offer one-tap "Hold 10:00 AM again" with the form pre-filled; escalate the timer visually only under 60 s.

### [CORRECTNESS-08] Deposit-enabled venues show a "Payment" step that never happens when no Stripe key is built in — and the prod build sets none

- **Evidence**: `useBookingFlow.ts:280-292` `SET_DEPOSIT_CONFIG` sets `depositRequired = provisionalDepositRequired(config)` = `Boolean(config.enabled)` (`effectiveDepositPolicy.ts:59-61`) — ignores `stripePublishableKey`; `effectiveDepositPolicy` at confirm (`useBookingFlow.ts:515-520`) does require it, so the verdict flips. `BookingWidget.tsx:66` defaults the key from `VITE_STRIPE_PUBLISHABLE_KEY`; `.github/workflows/deploy-static.yml:175-180` sets `VITE_AUTH_*`, `VITE_API_URL`, `VITE_SENTRY_DSN` — no `VITE_STRIPE_PUBLISHABLE_KEY`.
- **Reproduction**: `$OUT/local-flow/50-deposit-date-party/meta.json` steps = "1 Date & Party / 2 Time / 3 Details / **4 Payment**"; `51-deposit-guest-details` still shows step 4; `52-deposit-after-confirm` lands on "Reservation Confirmed!" with no payment, no deposit block, no cancellation-policy block (`stripeKeyPresent: false`).
- **Impact**: today masked by F-01 (config fetch dies → 3 steps). The moment #4565 lands, every deposit-enabled venue on prod promises a payment step, collects nothing, and confirms a "deposit-protected" table with no deposit — the venue believes it is covered.
- **Effort**: S.
- **Risk**: LOW.
- **Keeps it fixed**: `useBookingFlow.test.ts` — `SET_DEPOSIT_CONFIG` with `enabled: true` and no key yields 3 steps; plus a `check-env-sync`-style assertion that `deploy-static.yml` provides every `VITE_*` the app reads.
- **Fix sketch**: make the provisional verdict use `effectiveDepositPolicy({ …, guestIsRisky: false })` so both agree; either wire `VITE_STRIPE_PUBLISHABLE_KEY` into the prod build or have the server refuse to enable deposits for a venue when payments aren't configured.

### [ANTICIPATE-09] Party size is capped at 8 regardless of the venue's own maximum, and "please call us" has no number to call

- **Evidence**: `PublicBookingPage.tsx:101-108` renders `<BookingWidget>` without `maxPartySize`; `BookingWidget.tsx:60` default `8`; `DatePartySelector.tsx:19,42` filters options to `≤ maxPartySize`, `:96-100` "For parties larger than N, please call us." only renders for a size the guest can't select; `PublicVenueSchema` (`venue.ts:43-48`) exposes no phone/address; fixture venue `settings.maxPartySize: 12`.
- **Reproduction**: `$OUT/local-flow/01-date-party/meta.json` buttons `["1"…"8","Find Available Times"]` for a venue configured for 12; `40-party-cap-and-past-date` confirms no larger option and no note rendered.
- **Impact**: a party of 9–12 at a venue that seats 12 is turned away silently; a party of 20 gets a sentence with no phone, no email, no link — a dead end dressed as help.
- **Effort**: S.
- **Risk**: LOW.
- **Keeps it fixed**: `PublicBookingPage.test.tsx` asserting `maxPartySize` is forwarded from `venue.settings`; ships with the fix.
- **Fix sketch**: forward `venue.settings?.maxPartySize` (already on `PublicVenueConfig`, add to `PublicVenue`); add a "9+ guests" option that reveals the venue phone (`tel:`) and email; widen `PublicVenue` with `phone`.

### [TONE-10] "No available times" offers a walk-in waitlist with a hardcoded "~30 min" wait for a date two days out, and never suggests another time or day

- **Evidence**: `BookingWidget.tsx:69` `defaultWaitMinutes = 30`, `:149` passed as `estimatedWaitMinutes` regardless of date; `TimeSlotPicker.tsx:155-160` renders `Estimated wait: ~30 min` + "Join Waitlist" and drops the "Try a different date or party size" line whenever a waitlist exists; no call to `**/availability/*/dates*` (which exists — `api-mocks.ts:595`) to find the nearest open day.
- **Reproduction**: `$OUT/local-flow/10-no-availability/mobile.png` — "Saturday, September 5 · 2 guests · No available times · Estimated wait: ~30 min · Join Waitlist" captured on Sept 3. `11-waitlist-join`: "No tables available on Saturday, September 5 … Estimated wait: ~30 min … Required for SMS notifications when your table is ready."
- **Impact**: a great host says "Saturday's full — Friday at 7 or Sunday at 6?" This says "wait 30 minutes" about a table 48 hours away, then asks for a phone number to text when it's "ready". It reads as a bug to a guest, and it is the only alternative offered.
- **Effort**: S (copy/gating) to M (nearest-availability suggestions).
- **Risk**: LOW.
- **Keeps it fixed**: `TimeSlotPicker.test.tsx` — no wait estimate for a future date; ships with the fix.
- **Fix sketch**: show the waitlist (and estimate) only for today; for future dates query the dates endpoint and offer the 2–3 nearest days with openings plus "change party size"; keep "Join Waitlist" as a secondary action labelled for what it is ("Notify me if Saturday opens up").

### [NO-DEAD-END-11] The manage-reservation page is read-only, prints raw ISO timestamps, and every error state ends with nothing to click

- **Evidence**: `apps/hospitality/src/pages/ManageReservationPage.tsx:52-65,76-92` — "No Access Link", "Invalid Link", "Link Expired" each render `<Text>` only: no venue contact, no booking link, no retry; `:128-133` `{reservation.date}` and `{reservation.startTime} – {reservation.endTime}` unformatted; `:95-152` no cancel/modify/add-to-calendar/directions despite `venue` being present; document title stays `Dashboard - Matt Butler Engineering` (`index.html:41`; no `document.title` set on public pages).
- **Reproduction**: `$OUT/local-states/manage-valid/mobile.png`: "Date 2026-09-12 · Time 2026-09-12T23:00:00.000Z – 2026-09-13T00:30:00.000Z", zero buttons/links (`meta.json` `buttons: []`, `links: []`, title `Dashboard - …`). `manage-no-token`, `manage-invalid-404`, `manage-expired-410`: `buttons: []`, `links: []`. Live `$OUT/live/manage-probe-token`, `manage-no-token`: same, title `Dashboard - Matt Butler Engineering`.
- **Impact**: the page whose whole purpose is "let the guest do something about their booking" lets them do nothing, tells them the time in UTC ISO, and — once F-01 is fixed and links start resolving — will still be a cul-de-sac. On a phone the tab reads "Dashboard".
- **Effort**: M.
- **Risk**: LOW–MED (cancel needs the public cancel endpoint and the deposit-fee banner already built for `CancelReservationDialog`).
- **Keeps it fixed**: `ManageReservationPage.test.tsx` asserting formatted date/time and at least one action per state; ships with the fix.
- **Fix sketch**: reuse `formatLongDateWithYear`/`formatTime` (venue-TZ aware, F-03); add Cancel (with fee terms), Add-to-Calendar, "Call <venue>"; give each error state a "Book a table at <venue>" link and a support contact; set `document.title` to "<Venue> — Your reservation".

### [TIME-12] The first screen on a phone: no target reaches 44 px, the date field is a cold `mm/dd/yyyy`, and the tab says "Dashboard"

- **Evidence**: `DatePartySelector.tsx:72-79` native `<Input type="date">` with `value=""` (no default), `:105` CTA disabled until a date is typed; `DatePartySelector.module.css` party buttons and `TimeSlotPicker.module.css:65-67` `.slot { padding-block: var(--rialto-space-xs) }` give 32 px rows; `index.html:41` title; `PublicBookingPage.tsx` sets none.
- **Reproduction**: `$OUT/local-flow/01-date-party/meta.json` `targets`: all 10 interactive elements flagged `small` — party buttons 72×32, date input 310×38, "Find Available Times" 310×34; `nextDisabledOnLoad: true`, `dateDefault: ""`; `02-time-slots`: slots 98×32, "← Back" 69×23; title `Dashboard - Matt Butler Engineering` (also live `$OUT/live/book-the-oak-table`). `40-party-cap-and-past-date`: a past date typed into the field is accepted and `41-past-date-result` fires `GET /api/v1/availability/…?date=2026-09-01` — `min=` only guides the picker.
- **Impact**: the widget is phone-first in intent and desktop-sized in practice; a great host would already have "Tonight, 2 guests" set. The first thing the guest sees is a browser date placeholder and a disabled gold button.
- **Effort**: S.
- **Risk**: LOW (rialto `Button size="lg"` / min-block-size 44 px; default date = today or next open day; clamp typed dates to `min`).
- **Keeps it fixed**: an axe/target-size assertion in `booking-widget.spec.ts` at 390×844 (≥44 px for `option`/`button`); ships with the fix.
- **Fix sketch**: default `selectedDate` to today (or the next day with hours), keep party=2; `size="lg"` on party/slot/CTA; set `document.title = \`Book a table — ${venue.name}\``; validate `selectedDate >= today`in`canProceed`.

## Suspicions (argued, not reproduced)

- **Embed "Mobile" preview is a 375 px `div`, not an iframe** (`BookingWidgetDemoPage.tsx:209-212` `maxInlineSize`), so viewport media queries still see 1440 px. Only the skeleton `.slotGrid` breakpoint (`TimeSlotPicker.module.css:59`) is affected today, so the preview happens to be honest — but any future `@media` in the widget will lie in the frame. `$OUT/local-embed/demo-mobile-frame/frame-only.png` shows a clean 375 px render; the page's "Preview only — not live yet" banner is candid.
- **Guest email travels in a GET query string to an unauthenticated public endpoint** (`useGuestRecognition.ts:49` → `/public/v1/venues/<slug>/guests/recognize?email=…`, seen in `$OUT/local-flow/05-guest-details-filled/meta.json`). Edge/CDN access logs will retain PII. Not harmful today because the route is dead (F-01).
- **`callback?error=access_denied` rendered "That sign-in link expired"** (`$OUT/local-states/callback-access-denied`) — because my fabricated `state` can't match storage, oidc-client-ts throws "No matching state" before reading `error`. Real Auth0 denials carry a matching state and should hit the `ACCESS_DENIED_PATTERN` branch; unverifiable without completing a sign-in.
- **`ManageReservationPage` uses `maxRetries: 3`** (`:31`) where the booking page uses 0; if `fetchWithRetry` retries on network errors, a dead `/public/v1` could triple the wait before "Invalid Link". Not measured.
- **Recognition banner ("Welcome back, X — your 3rd visit!") is unreachable on prod** for the same F-01 reason; the RECOGNIZE principle is implemented and inert.

## Already good

- **Front door is the strongest surface in this cluster.** `LoginGate` (split-flap board, signed-out tagline on `/callback` with no params), `SessionExpiredGate` ("Your session ended — this page is preserved", reproduced with an expired `expires_at`: `$OUT/local-states/session-expired`), `AuthFailurePage` ("Can't reach the sign-in service — check your connection and try again" + `Try again` + collapsed Technical details, reproduced by blocking Auth0: `$OUT/local-states/signin-inflight`). Every auth state offers a way forward; anonymous unknown routes land on the gate, not a 404. Live landing DCL 0.33–0.70 s, ~400 KB.
- **Venue-not-found copy** is branded and leak-free (`PublicBookingPage.tsx:11-13,52-54`) — the pattern F-04 should copy.
- **Widget mechanics**: skeleton while slots load; ARIA listbox with roving tabindex for slots; `aria-live` countdown; step indicator; "Someone else" recovery path exists in the reducer (`EXPIRE_HOLD` re-fetches slots).
- **Confirmation moment**: "Reservation Confirmed! We look forward to seeing you." + details card + Add-to-Calendar (.ics / Google / Outlook) + "Make Another Reservation" — the shape is right (`$OUT/local-flow/06-confirmation/mobile-full.png`); F-01/F-03/F-06 are what undercut it.
- **Waitlist confirmation** ("Added to Waitlist · #3 · 45 min · We'll send you an SMS… keep your phone nearby · Make a Reservation Instead") is warm and specific — the join _offer_ (F-10) is the problem, not the outcome.
- **Embed demo page** is honest: "Coming soon / not functional yet" repeated at page, banner, snippet and footer level.
- **Deposit variant** copy ("Secure your reservation with a deposit") and the risk-aware step derivation are cleanly single-sourced in `useBookingFlow`.

## Coverage

| Scope item                                                                                          | Status                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Booking widget — local full flow (date → party → slot → hold → details → confirm → confirmation) | audited-found (F-03, F-04, F-05, F-06, F-07, F-09, F-12)                                                                                                               |
| 1. Booking widget — live up to last pre-write step                                                  | audited-found (F-01, F-02); flow itself not-reached on live: no venue resolves                                                                                         |
| 1. Edge: no slots / waitlist                                                                        | audited-found (F-10)                                                                                                                                                   |
| 1. Edge: 409 hold, 500 confirm, 500 availability                                                    | audited-found (F-04)                                                                                                                                                   |
| 1. Edge: expired hold (timer + already-past)                                                        | audited-found (F-07)                                                                                                                                                   |
| 1. Edge: past date, party > max                                                                     | audited-found (F-09, F-12)                                                                                                                                             |
| 1. Edge: closed day                                                                                 | not-reached (fixture venue open 7 days; no closed-day fixture, no live venue)                                                                                          |
| 1. Deposit-enabled variant (Stripe)                                                                 | audited-found (F-08); PaymentStep UI itself not-reached (no key → step skipped)                                                                                        |
| 2. Manage: no token / invalid / expired / valid                                                     | audited-found (F-01 live, F-11)                                                                                                                                        |
| 3. Landing `LoginGate` (local + live)                                                               | audited-clean                                                                                                                                                          |
| 3. Sign-In hand-off (local IdP blocked → AuthFailurePage; live → Auth0 form, stopped)               | audited-clean (tenant branding = #4848, cited not refiled)                                                                                                             |
| 3. `/signout`, `/auth-failure` as URLs                                                              | audited-clean (both render `LoginGate` for anonymous; the components render only mid-navigator/on error — `SignOutPage` in-flight not-reached without a real sign-out) |
| 3. Session-expired gate                                                                             | audited-clean (reproduced via expired storageState)                                                                                                                    |
| 3. `/callback` no code / bad state / access_denied                                                  | audited-clean (access_denied copy path = Suspicion)                                                                                                                    |
| 3. Unknown route                                                                                    | audited-clean (anonymous → gate; authed catch-all → `/timeline` per `main.tsx:301`, not walked authed)                                                                 |
| 4. Embed context (demo page, 375 px frame, honesty)                                                 | audited-clean (frame-vs-iframe = Suspicion)                                                                                                                            |
| Desktop 1440×900 for every state above                                                              | audited-clean (centered 36 rem card; no layout defects beyond those already listed)                                                                                    |
