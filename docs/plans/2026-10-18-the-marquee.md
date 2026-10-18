# The Marquee — feasibility check + build plan

> **Status: future plan — unblocked, not yet filed.** Needs no venue history and no LLM key. Nothing here is filed as an issue; run `/decompose` on this file to start it. File references verified against `main` at `56fedb2c2`, 2026-10-18.

## Context

The hospitality product has no users yet. Most 2026-10-18 ideas make the product great once someone is in it; The Marquee is the **reason to sign up**. Many independent restaurants have a weak website or none (an Instagram bio link). Pitch: "Sign up and your restaurant has a gorgeous website with booking built in — in 60 seconds."

One click turns the venue into a single-page site: hero, live "Open now" hours, floor-plan peek, embedded booking widget, map link — at a hosted subdomain now, the owner's own domain later. Onboarding ends with a "Your site is live" reveal. Matt loved it (2026-10-18). It is also the hub the other plans plug into: Brand Match (#7048) themes it, Choose Your Table (#7050) and The Invitation (#7053) live on it, Dress Rehearsal (#7049) is its "see it in action".

## Verdict: feasible — start by upgrading the existing public booking page

| Piece                                                      | Exists?              | Where                                                                                                                                                                                  |
| ---------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public, login-free venue page at a slug                    | yes — minimal        | route `book/:venueSlug` (`apps/hospitality/src/main.tsx`), `pages/PublicBookingPage.tsx` renders only `venue.name` + `BookingWidget`                                                   |
| Public venue payload                                       | yes — needs widening | `GET /public/v1/venues/:slug` → `getPublicConfigBySlug`; `PublicVenueSchema` = `id, name, slug, ianaTimezone, operatingHours, settings, phone` (`packages/types/src/schemas/venue.ts`) |
| Hours data for live "Open now"                             | yes                  | `Venue.operatingHours` + `ianaTimezone`; `booking-widget/hasOperatingHours.ts`                                                                                                         |
| Free-form per-venue JSON for profile fields                | yes                  | `Venue.settings Json?` (`services/reservations/prisma/schema.prisma`)                                                                                                                  |
| Edge worker that can rewrite HTML                          | yes                  | `infrastructure/worker/edge-router.js` (hospitality via Service Binding), `response-formatter.js` (`NonceInjector` uses `HTMLRewriter`), `csp.js`                                      |
| Address, description, cuisine, price, social links, photos | **no** — new         |                                                                                                                                                                                        |
| SEO for an SPA (server-visible meta, JSON-LD, sitemap)     | **no** — new         | crawlers currently get the SPA shell                                                                                                                                                   |
| Subdomain / custom-domain routing                          | **no** — new         | `infrastructure/worker/wrangler.toml` routes only the apex and `www`                                                                                                                   |
| Object storage for photos                                  | **no** — later phase | none in repo                                                                                                                                                                           |

## Approach

### 1. Venue profile

`VenueProfileSchema` in `@mbe/types`: `{ address?: { line1, city, region, postalCode, country }, description? (≤280), cuisine?: string[], priceLevel?: 1..4, links?: { instagram?, website?, menu? } }` stored at `Venue.settings.profile` (no migration). Owner editor in venue settings; optional "tell guests about you" step at the end of onboarding. Widen `PublicVenueSchema` + `getPublicConfigBySlug` to expose the profile (all fields are intentionally public).

### 2. Marquee layout on the public page

Evolve `PublicBookingPage` (keep the `book/:venueSlug` route working; add a cleaner `v/:venueSlug` alias): typographic hero (name, cuisine, price, Brand Match logo when present), live open-now / closes-at chip computed in the venue's `ianaTimezone` (pure function, unit-tested across DST), weekly hours, description, embedded `BookingWidget`, "Get directions" deep link (Apple/Google Maps URL — no map API key), social links, small read-only floor-plan peek (`FloorPlanCanvas readOnly`) when the venue opts in. Rialto tokens throughout; `prefers-reduced-motion` respected.

### 3. SEO

Edge worker, for Marquee paths: `HTMLRewriter` injects `<title>`, `meta description`, `og:*`, canonical, and `schema.org/Restaurant` JSON-LD (name, address, hours, `acceptsReservations`, `servesCuisine`, `priceRange`) fetched from the public venue endpoint and cached briefly. Nonce/CSP via the existing `NonceInjector` path. `sitemap.xml` of active venues. Pure builders for meta + JSON-LD, unit-tested.

### 4. Hosted subdomains

`<slug>.<marquee-domain>` → wildcard route in `infrastructure/worker/wrangler.toml` (Pulumi-managed DNS), `edge-router.js` maps host → Marquee page for that slug. Reserved-slug list (`www`, `api`, `app`, …); slug validation already constrains characters.

### 5. Onboarding reveal

After Launch: "Your site is live" moment with the URL, copy button, QR code, and an open-in-new-tab preview.

### Later (out of scope v1)

- Photos — needs the repo's first object storage (R2) + upload path; v1 uses a typographic hero.
- Custom domains via Cloudflare for SaaS (custom hostnames + DCV).
- Menu page.

## Risks

- **SPA SEO**: without step 3, crawlers see a blank shell → step 3 ships with step 2, not after.
- **Silent CSP refusals** on a new surface (fonts, maps links, JSON-LD script) → probe the deployed page with a real browser (gotchas: CSP kills silently).
- **Wildcard subdomains** widen the edge attack surface → strict host parsing, reserved names, rate limiting via existing `rate-limiter.js`.
- **Stale meta** after an owner edits their profile → short edge cache TTL, purge on profile save.

## Delivery

`/decompose` into ordered issues: (1) `VenueProfileSchema` + public payload, (2) profile editor, (3) open-now pure function, (4) Marquee layout, (5) edge meta + JSON-LD injection, (6) sitemap, (7) subdomain routing, (8) onboarding reveal, (9) E2E + deployed-page probe. Steps 1–5 are shippable on the existing path; 7 makes it feel like "your own site". TDD each.

## Verification

- Unit: open-now across timezones/DST/overnight hours; meta + JSON-LD builders (validate JSON-LD shape); host → slug parsing incl. reserved names.
- Route: public payload exposes only allow-listed profile fields.
- E2E (hospitality Playwright): onboard → fill profile → reveal → open Marquee → booking works end to end from it.
- Deployed: `curl` the page as a crawler UA and assert title/description/JSON-LD in raw HTML; Google Rich Results test on a real venue; real-browser probe for CSP refusals; Lighthouse SEO + performance.
