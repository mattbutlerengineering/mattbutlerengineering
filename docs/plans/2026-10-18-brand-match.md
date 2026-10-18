# Brand Match — feasibility check + build plan

> **Status: future plan — unblocked, not yet filed.** Needs no venue history and no LLM key. Nothing here is filed as an issue; run `/decompose` on this file to start it. File references verified against `main` at `56fedb2c2`, 2026-10-18.

## Context

The hospitality product has no users and no service history yet, and no Anthropic API key in production — so Service Replay (needs history) and Snap Your Room (`docs/plans/2026-10-18-snap-your-room.md`, needs an LLM) both wait. Brand Match is the "wow" that needs neither.

A new owner pastes their restaurant's website URL. In a few seconds the booking widget re-skins to their brand — accent colour, surface, font, logo — shown as a live preview. Owners switch booking tools when the widget looks like _theirs_; this removes "it'll look off on my site" before they think it.

## Verdict: feasible, no migration

| Piece                                                                              | Exists?                      | Where                                                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Widget colours are rialto tokens (`--rialto-accent`, `--rialto-text-on-accent`, …) | yes                          | `apps/hospitality/src/components/booking-widget/*.module.css` (`DatePartySelector`, `TimeSlotPicker`, `ConfirmationView`) |
| Per-venue JSON storage                                                             | yes — `Venue.settings Json?` | `services/reservations/prisma/schema.prisma` (`model Venue`)                                                              |
| Public venue payload the widget already reads                                      | yes                          | `GET /public/v1/venues/:slug` → `venueService.getPublicConfigBySlug` (`services/reservations/src/services/venue.ts`)      |
| Public settings schema                                                             | yes — needs widening         | `PublicVenueSchema.settings` is `{ maxPartySize? }` only (`packages/types/src/schemas/venue.ts`)                          |
| Contrast discipline on accent fills                                                | yes — pattern to copy        | `apps/hospitality/src/pages/PublicBookingPage.contrast.test.ts`                                                           |
| Public booking page + embed code page                                              | yes                          | `apps/hospitality/src/pages/PublicBookingPage.tsx`, `BookingWidgetDemoPage.tsx`                                           |
| Server-side URL fetch / site extraction                                            | **no** — new                 |                                                                                                                           |
| Theme applied per venue                                                            | **no** — new                 | today the widget inherits the app/global rialto theme                                                                     |

## Approach

### 1. Theme schema — `@mbe/types`

`VenueThemeSchema`: `{ accent: hex, surface?: hex, fontFamily?: string (Google Fonts allow-list), logoUrl?: https URL, source?: { url, extractedAt } }`. Stored at `Venue.settings.theme` (no migration). Widen `PublicVenueSchema.settings` to include `theme` and pass it through `getPublicConfigBySlug`.

### 2. Pure palette builder — `packages/rialto` or `@mbe/types` util

`buildThemeTokens(theme) → Record<"--rialto-…", string>`: derives hover/subtle shades and `--rialto-text-on-accent` from `accent`. **Contrast is non-negotiable:** if the brand accent can't reach WCAG AA 4.5:1 against its on-accent text, darken/lighten it until it does and report the adjustment. Heavily unit-tested (this is where correctness lives).

### 3. Extractor endpoint — `services/reservations` (authed, venue-scoped)

- `POST /api/v1/venues/:id/theme/extract`, body `{ url }`, `requireAuth` + `requireVenueAccess` (ADR-020), per-user rate limit (pattern: `config.rateLimit` with user key, see `services/agent/src/routes/gen-route-factory.ts`).
- **SSRF guard first, as its own unit:** https only, resolve DNS and reject private/loopback/link-local/metadata ranges (re-check after redirects, max 3), 5s timeout, 2MB cap, HTML + linked CSS only (cap 5 stylesheets).
- Pure `extractBrand(html, cssTexts) → candidates`: CSS custom properties named like `--primary/--brand/--accent`, `<meta name="theme-color">`, most-frequent saturated colours in CSS, Google Fonts `<link>` families, logo from `<link rel="icon">` / `apple-touch-icon` / `og:image`. Returns ranked candidates, not one answer.
- Returns candidates only — saving is a separate `PATCH` of `settings.theme`, so nothing persists without the owner accepting.

### 4. Widget theming

A `VenueThemeScope` wrapper (mirroring `WidgetLocaleScope.tsx`) that applies `buildThemeTokens` as inline CSS custom properties on the widget root, plus a Google Fonts `<link>` for allow-listed families only. Check the edge CSP (`infrastructure/worker`) allows `fonts.googleapis.com`/`fonts.gstatic.com` on the booking page — see gotchas: CSP refusals are silent; probe the deployed page.

### 5. Onboarding / settings UI

"Match my website" step (onboarding wizard, also reachable from venue settings): URL input → extraction → **live preview of the real `BookingWidget`** themed with the candidate → swatches to pick among candidates → manual colour picker + font select always available → contrast-adjustment notice when step 2 changed the colour → Save. Failure or a JS-only/bot-blocked site → friendly message, manual picker still there (no dead end). Strings in `en-US.json` / `fr-CA.json`.

### Out of scope v1

Screenshot of the owner's homepage behind the preview (needs a headless browser service), licensed/self-hosted fonts, dark-mode brand variants, theming emails/SMS.

## Risks

- JS-rendered / bot-blocking sites yield thin candidates → manual picker is mandatory, not a fallback afterthought.
- SSRF is the real security surface → guard is its own tested module, reviewed before the fetcher lands.
- Brand colours that fail contrast → auto-adjust + tell the owner; brand never overrides a11y.

## Delivery

`/decompose` into ordered issues: (1) theme schema + public payload, (2) `buildThemeTokens` + contrast adjust, (3) `VenueThemeScope` in widget, (4) SSRF-guarded fetcher, (5) `extractBrand` + endpoint, (6) onboarding/settings UI, (7) E2E. Steps 1–3 alone already ship value (manual brand picker) before any fetching exists. TDD each.

## Verification

- Unit: `buildThemeTokens` (contrast always ≥ 4.5:1 across a colour sweep), SSRF guard (private IPs, redirects to private, IPv6, DNS rebinding), `extractBrand` against saved fixture HTML from ~10 real restaurant sites.
- Route: 401/403 (other venue)/429/400 bad URL/422 unreachable.
- E2E (hospitality Playwright): mocked extract → pick swatch → save → public booking page renders with the brand accent.
- Manual: real restaurant URLs on a preview deploy; probe the deployed booking page for CSP font refusals.
