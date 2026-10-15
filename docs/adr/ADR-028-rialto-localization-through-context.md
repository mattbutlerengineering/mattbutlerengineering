---
id: ADR-028
title: Localize Rialto Through an Optional Context with Typed Per-Locale Dictionaries
status: active
date: 2026-10-13
---

# ADR-028: Localize Rialto Through an Optional Context with Typed Per-Locale Dictionaries

## Context

The localization feature run (`docs/features/localization/`) requires rialto — a
package published to npm — to render its built-in text (≈50 strings: dismiss/close
aria-labels, pagination, calendar navigation, number-input steppers, GlobalNav labels,
English prop defaults such as `ConfirmDialog`'s "Confirm"/"Cancel") in en-US, en-GB,
es-MX and fr-CA, following a locale set by the consuming app. Three constraints:

- **Non-breaking.** A consumer who changes nothing must see byte-identical English; about
  23 rialto test files and the Storybook visual baselines assert those strings.
- **No forced i18n library.** The app chose i18next; rialto's consumers must not be made to
  install or configure it.
- **Size budgets.** Per-subpath size-limit budgets are tight (Button 900 B, Dialog 1450 B,
  Select 2250 B); bundling every locale's strings into each component chunk would break
  them.

Month and weekday names already come from `Intl` via optional `locale` props, falling back
to the runtime default.

## Decision

Rialto owns a typed `RialtoMessages` dictionary. The en-US object is inlined as the
default. Each other locale is a separate module exported as
`@mattbutlerengineering/rialto/locales/<locale>` and typed `RialtoMessages`, so the
compiler enforces key parity. Interpolated entries are functions
(`removeItem(label)`, `page(n)`).

Delivery follows ADR-025: `RialtoLocaleProvider` (`locale`, `messages`) and a
`useRialtoLocale()` hook that **never throws** and, with no provider, returns
`{ locale: undefined, messages: enUS }`. `RialtoProvider` accepts the same optional props.
Inside components the precedence is explicit prop → context → en-US default (and for
`Intl`, explicit `locale` prop → context locale → `undefined`).

## Consequences

- Consumers opt in with one import per locale they support and two provider props; i18next
  (or any library) stays an app concern, bridged by the app.
- Adding a string to rialto means adding it to `RialtoMessages`, which fails typecheck
  until every locale module provides it.
- New public API surface (`./locales/*`, `RialtoLocaleProvider`, `useRialtoLocale`,
  `RialtoMessages`) that must be kept stable once published.
- The a11y matrix fixtures and `exports:check` must learn the new exports.

## Alternatives Considered

- **Share the app's i18next instance (react-i18next as a rialto peer).** Rejected: forces
  every consumer onto i18next and ties a published API to one app's library choice.
- **Bundle all four locales and take only a `locale` prop.** Simpler consumer API, but
  every component chunk carries every locale's strings — breaks size budgets and grows
  with each locale.
- **Per-component label props (`closeLabel`, `dismissLabel`, …).** Dozens of API
  additions, no central catalog, and the app must thread translated strings into every
  call site.

## See Also

- ADR-025 — motion presets through context (the no-throw optional-context pattern).
- ADR-024 — ISO date-value vocabulary (rialto date components).
- `docs/features/localization/architecture.md`
