---
stage: ux-design
run: feature:localization
date: 2026-10-13
---

# UX: Localization — Phase 1 (hospitality)

Context found during design: the guest surface is the booking widget. It renders on two
**public** routes outside the Auth0 gate — `book/:venueSlug` (`PublicBookingPage`) and
`reservations/manage` (`ManageReservationPage`) — and is previewed inside the dashboard
at `/booking-widget` (`BookingWidgetDemoPage`). (Corrected 2026-10-13 at Architect: an
earlier draft said no public route existed; `apps/hospitality/src/main.tsx:128,136`
shows both.) The widget gets its own locale control independent of staff.

Supported locales, always shown by their own name (endonym):
`English (US)` · `English (UK)` · `Español (México)` · `Français (Canada)`.

## Flows

### Staff — first visit and switching (stories 4, 5)

1. Staff opens hospitality. Pre-login screens (LoginGate, Handshake, session-expired,
   auth-failure, sign-out) render in the remembered locale, else the best browser match,
   else en-US. No switcher on these screens.
2. Dashboard renders in that locale — page text, rialto component text (labels,
   aria-labels, calendar month/day names) and all dates/numbers/money formats.
3. Staff opens the locale picker in the GlobalNav sidebar footer, picks a locale.
4. UI updates in place: same route, same scroll, in-progress form input preserved.
5. Choice is remembered on this device and wins over browser detection from then on.
6. Alternate entry: `/settings` → "Language & region" row does the same.

### Guest — booking in a locale (stories 1, 2, 3)

1. Guest-facing widget (public `book/:venueSlug`, public `reservations/manage`, or the
   dashboard demo) opens in: the widget's remembered locale, else (in the demo page) the
   dashboard's current locale, else the best browser match, else en-US.
2. Widget header carries a compact locale picker; guest may change it at any step.
   Changing it does **not** change the dashboard's locale, and vice versa after load.
3. Guest walks date & party → time slot → details → payment → confirmation, all in the
   chosen locale. Entered details survive a locale switch mid-flow.
4. Dates/times show in the **venue's timezone**, money in the **venue's currency**, both
   formatted for the guest's locale (e.g. en-GB on a USD venue: `US$40.00`, `19:30`,
   `13/10/2026`). Amounts are never converted.

### Not a UI flow

- Story 6 (rialto consumer who changes nothing) and story 7 (contributor blocked by CI)
  have no screen; they are verified by tests and CI, not designed here.

## Screens

### Locale picker — dashboard sidebar footer

```
┌──────────────┬──────────────────────┐
│ ◆ Home       │                      │
│   Timeline   │   page content       │
│   Reservas   │                      │
│   Huéspedes  │                      │
│   Planos     │                      │
│ ──────────── │                      │
│ 🌐 Español (México) ▾                │
│ 👤 Perfil    │                      │
└──────────────┴──────────────────────┘

open menu:
┌────────────────────────────────────────┐
│ ✓ English (US)                         │
│   English (UK)                         │
│   Español (México)   Traducción autom. │
│   Français (Canada)  Traduction autom. │
└────────────────────────────────────────┘
```

- Purpose: change the dashboard's locale.
- Collapsed sidebar: globe icon only; accessible name includes the current locale.
- Machine-translation notice: es-MX/fr-CA options carry a tag in their own language.
  No page banners.
- Empty state: n/a (fixed list of 4).
- Loading state: if the chosen locale isn't loaded yet, current text stays on screen and
  the picker shows a spinner until ready — no blank screen, no flash of raw keys.
- Error state: load failure keeps the previous locale; picker shows inline
  "Couldn't load Español (México) — Retry" (in the current locale).

### Settings — "Language & region" row

```
Language & region
  [ Español (México)            ▾ ]
  13/10/2026 · 19:30 · 1.234,5 → preview of formats in the selected locale
  Las traducciones al español son automáticas.
```

- Purpose: same choice as the sidebar, with a format preview and the MT disclosure line.
- Loading / error: same as the sidebar picker.

### Booking widget — header picker

```
┌──────────────────────────────────────┐
│ Reservar mesa          🌐 ES-MX ▾    │
├──────────────────────────────────────┤
│ Fecha       [ 13/10/2026      ]      │
│ Personas    [ 2               ▾ ]    │
│                                      │
│ 19:00   19:30   20:00                │
│                                      │
│ Depósito: US$40.00 (hora local)      │
│                         [ Continuar ]│
└──────────────────────────────────────┘
```

- Purpose: guest picks the widget's locale independently of staff.
- Compact trigger shows a short code; menu shows the same 4 endonyms + MT tags.
- Loading / error: same rules as the sidebar picker; failure leaves the widget in its
  previous locale with entered data intact.
- Empty state (no slots), payment errors, etc.: unchanged behaviour, translated text.

### All other hospitality screens

- No layout change; every visible string, aria-label, empty/loading/error message,
  toast, dialog and validation message is localized.

## Conventions to match

- Rialto components only; switcher built from existing rialto menu/select primitives.
- Text expansion (es/fr run ~30% longer):
  - **Actions, labels, nav: wrap, never truncate.**
  - **Dense data cells** (timeline reservation blocks, floor-plan table badges): may
    ellipsize, with full text on hover **and** keyboard focus — same as long guest names
    today.
  - Status words that can't fit long-form (e.g. table status badges) use a short-form
    translation key, not truncation.
- A missing key renders its en-US text, never the raw key.
- Locale-formatted values come from the venue's currency/timezone, never the viewer's.
- Accessibility: picker reachable by keyboard; `lang` on the document matches the
  active locale so screen readers switch voice.

## Deliberately not designed

- Account-level locale preference synced across devices (Phase 2, server-side).
- Email/SMS/ICS templates (Phase 2).
- Locale in the URL; per-venue default locale.
- RTL layout.
- Visual polish of the picker beyond rialto defaults.
