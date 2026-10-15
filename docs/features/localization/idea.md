---
stage: idea
run: feature:localization
date: 2026-10-13
---

# Idea: Localization across all apps

## Problem

Every app in the monorepo (hospitality, marketing, rialto-web, gen) speaks only en-US.
Strings are hardcoded English literals; dates, numbers, currency and time formats are
en-US by default or ad-hoc `Intl.*` calls (`apps/hospitality/src/utils/format.ts`,
`packages/notifications/src/venue-time.ts`, `packages/cancellation-policy`). There is no
i18n framework and nothing stops a new PR from adding another hardcoded string. The unit
of localization is the **locale** (language + region: strings _and_ formats), not the
language.

## Who has it

- **Hospitality guests** — booking widget, confirmation/reminder emails, ICS.
- **Venue staff** — hospitality dashboard.
- **Rialto consumers** — devs using rialto components, whose hardcoded English
  (labels, aria-labels, month/day names) blocks their own localization.
- **Marketing visitors** — prospects reading the marketing site.

Today they cope with browser auto-translate or not at all. Note: all four is close to
"everyone"; no member of any group has been observed asking for this.

## Why now

Portfolio/showcase: properly-done localization — including a gate that keeps it from
regressing — demonstrates the factory-as-a-service capability. Not driven by user demand.

## Evidence

- User demand: **none observed**. Prod has had ~zero observed real users across recent
  runs, so no locale demand could have surfaced.
- Repo evidence (measured 2026-10-13): no i18n library in `apps/`, `packages/`, `services/`;
  only scattered `Intl.*` formatting.

## Solution hunch

- Library: **i18next** (user's stated choice — Architect confirms fit, e.g. react-i18next
  for apps, server-side use for notifications).
- Externalize strings per app; locale-aware formatting for dates/numbers/currency/time.
- Locales beyond en-US: **en-GB** (format-only proof: dd/mm, £, 24h), **es-MX**, **fr-CA**.
- Translations LLM-generated, disclosed on-site; no native reviewer.
- **Lint for missing translations** — CI fails a PR that adds a string without
  translations for every supported locale.

## Success in one sentence

All 4 apps run fully in en-US, en-GB, es-MX and fr-CA, and CI blocks any untranslated string.

## Unknowns & risks

- **Scope stall (top risk)** — 4 apps × 4 locales × strings + formats + notifications;
  work stalls half-extracted and the lint gate can't go strict until every app is clean.
- **Server-side locale** — emails/SMS/ICS need a guest/venue locale persisted; schema + API
  change in services, not just frontend.
- LLM translation quality for es-MX/fr-CA — bad output hurts a showcase more than English-only.
- Rialto component strings may need a messages/locale API — possible breaking change for
  external consumers (published package).
- How `gen` app fits (unexamined).
