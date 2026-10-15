---
stage: prd
run: feature:localization
date: 2026-10-13
ux: required
---

# PRD: Localization — Phase 1 (foundation + hospitality)

## Problem statement

Every app in the monorepo speaks only en-US: user-visible text is hardcoded English and
date/number/currency/time formatting is ad hoc. Nothing stops a new change from adding
another hardcoded string, so the retrofit cost grows with every PR. Localization here is
per **locale** (language + region), covering strings _and_ formats. The driver is a
portfolio showcase of the factory, not observed user demand (see `idea.md`).

The idea's goal is all 4 apps in 4 locales. This PRD scopes **Phase 1** to defuse the
idea's top risk (scope stall): a shared foundation plus one app done end to end. Other
apps and server-sent notifications follow as later runs reusing the foundation.

## Solution

When Phase 1 ships:

- The **hospitality app** (guest booking pages and staff dashboard) is fully usable in
  **en-US, en-GB, es-MX, fr-CA**. Its locale is detected from the browser and can be
  changed with a visible switcher; the choice is remembered on that device.
- Dates, times, numbers and money render in the viewer's locale **format**. Currency and
  timezone always come from the **venue** — amounts are never converted.
- **Rialto** components carry built-in strings for the same 4 locales and follow the
  locale the consuming app sets, without breaking existing consumers.
- es-MX and fr-CA text is machine-generated, and the app says so.
- **CI blocks** a PR that adds a hardcoded user-visible string to a localized package, or
  a translation key missing from a required locale.

## Actors

- **Guest** — member of the public booking a table at a venue via hospitality.
- **Venue staff** — restaurant employee using the hospitality dashboard.
- **Rialto consumer** — a developer building an app with the published rialto package.
- **Contributor** — a human or agent opening a PR against the monorepo.

## User stories

1. As a **guest**, I want the booking pages in my browser's language and regional format,
   so that I can book without translating the page myself.
2. As a **guest**, I want to switch locale manually and have it remembered, so that a
   wrong detection doesn't trap me.
3. As a **guest**, I want prices and times shown in the venue's currency and timezone, in
   my locale's format, so that what I agree to matches what I'm charged and when I arrive.
4. As **venue staff**, I want the dashboard in my chosen locale, so that I can run service
   in my working language.
5. As a **rialto consumer**, I want components to render their built-in text in my app's
   locale, so that my localized app has no stray English.
6. As a **rialto consumer** who changes nothing, I want components to behave exactly as
   before, so that upgrading rialto doesn't break my app.
7. As a **contributor**, I want CI to fail on an untranslated or hardcoded string, so that
   localization can't silently regress.

## Success criteria

- [ ] With each of en-GB, es-MX, fr-CA selected, every hospitality guest and staff screen
      shows no untranslated en-US UI text (en-GB may reuse en-US wording where identical) —
      checked by an automated test per locale across the hospitality routes.
- [ ] A browser whose preferred language is es-MX (or fr-CA, en-GB) opens hospitality in
      that locale on first visit; an unsupported language opens in en-US.
- [ ] Changing locale via the switcher updates the visible UI without losing in-progress
      form input, and persists across reload in the same browser.
- [ ] For a venue in a USD/America-Los_Angeles setup, an en-GB viewer sees a USD amount
      (not GBP, not converted) and the venue-local time, in en-GB format (e.g. 24h,
      dd/mm/yyyy).
- [ ] Every rialto component with built-in user-visible text (labels, aria-labels,
      month/day names, etc.) renders it in all 4 locales when the app sets the locale.
- [ ] Existing rialto tests and visual baselines pass unchanged when no locale is set
      (non-breaking), and rialto does not require consumers to install an i18n library.
- [ ] A PR adding a hardcoded user-visible string in hospitality or rialto fails CI;
      a PR adding an en-US key absent from es-MX or fr-CA fails CI. Both demonstrated by
      a deliberately failing fixture.
- [ ] A visible notice states that es-MX and fr-CA translations are machine-generated.
- [ ] No hospitality screen has truncated or overflowing text in any locale at the
      supported viewport widths.

## Out of scope

- marketing, rialto-web and gen apps (later runs; gen's user-authored JSON specs and
  AI output are content, not UI strings).
- Server-sent email, SMS and calendar (ICS) content, and storing a guest's or staff
  member's locale on their account (Phase 2 — needs schema/API change).
- Currency conversion or showing a currency other than the venue's.
- Right-to-left languages and any locale beyond the four.
- Native-speaker review of translations.
- Locale in the URL / SEO-indexed localized pages.
- Translating venue-entered content (menus, venue names, descriptions).

## Open questions

- i18next is the stated library choice (user) — how hospitality uses it, and how rialto
  stays i18n-library-free for consumers, is Architect's call.
- Where machine translation runs (authoring time vs CI) and how regenerated strings are
  reviewed — Architect.
- Is "venue currency/timezone" already fully available to every hospitality screen that
  shows money or time, or are some screens assuming USD/browser timezone? — Architect
  (codebase check).
- Placement and wording of the switcher and machine-translation notice — UX Design.
- How es/fr text expansion affects dense staff screens (floor plan, tables) — UX Design.
