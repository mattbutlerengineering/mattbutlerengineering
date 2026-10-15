---
stage: architect
run: feature:localization
date: 2026-10-13
---

# Architecture: Localization — Phase 1 (foundation + hospitality)

## Approach

Two localization mechanisms, one per audience, joined at the app. **Hospitality** uses
i18next + react-i18next (user's choice) with one JSON catalog per locale, en-US bundled and
the others lazy-loaded. **Rialto** stays i18n-library-free: it owns a typed
`RialtoMessages` dictionary delivered through an optional, never-throwing context — the
ADR-025 pattern — with en-US inlined as the default and each other locale shipped as its
own subpath (ADR-028). The app bridges them: when i18next's language changes, the app loads
the matching rialto dictionary and hands it to rialto's locale provider. Formatting moves
behind one venue-bound formatter, so locale picks the _format_ while the venue supplies
currency and timezone. Two gates keep it from regressing: an ESLint rule for literal UI
strings and a repo-audit check for catalog parity; a per-locale e2e sweep catches what
static analysis cannot (English in data arrays, overflow).

Alternative shape considered: one shared i18next instance that rialto also reads (via
`react-i18next` as a rialto peer). Loses because it forces every npm consumer of rialto to
install and configure i18next, which the PRD forbids, and couples a published package's
API to a library choice made for one app.

## Components

### Rialto messages (`packages/rialto/src/i18n/`)

- Responsibility: owns every user-visible string rialto renders by itself (≈50 today:
  dismiss/close aria-labels, pagination, calendar nav, number-input steppers, GlobalNav
  item labels, ChatPanel/CommandPalette copy, existing English prop defaults) and the
  locale rialto's `Intl` calls fall back to.
- Shape: `RialtoMessages` interface — plain strings, plus functions for interpolated
  entries (`removeItem(label)`, `page(n)`). `en-US` object inlined in the main bundle;
  `locales/en-GB.ts` (spreads en-US, overrides only what differs), `locales/es-MX.ts`,
  `locales/fr-CA.ts`, each exported as `@mattbutlerengineering/rialto/locales/<locale>`
  and typed `RialtoMessages` — TypeScript is the parity check for rialto.
- `RialtoLocaleProvider` (`locale`, `messages`) + `useRialtoLocale()` →
  `{ locale: string | undefined, messages: RialtoMessages }`. Never throws; with no
  provider returns `{ locale: undefined, messages: enUS }`. `RialtoProvider` gains optional
  `locale` / `messages` props that compose the same provider.
- Precedence inside components: explicit prop (e.g. `confirmLabel`, `locale`) → context →
  en-US default / `undefined` locale (today's runtime-default behaviour).
- Collaborators: every rialto component with built-in text; hospitality locale bridge.

### Locale policy (`apps/hospitality/src/i18n/locales.ts`)

- Responsibility: the list of supported locales and the rule for choosing one. Pure.
- `SUPPORTED_LOCALES` (`en-US`, `en-GB`, `es-MX`, `fr-CA`) with endonym and
  `machineTranslated` flag; `resolveLocale({ stored, browser: readonly string[] })` →
  exact match first, then same-language match (`es-*` → es-MX, `fr-*` → fr-CA, `en-GB`
  only for `en-GB`, any other `en-*` → en-US), else `en-US`. Invalid stored values ignored.
- Collaborators: i18n runtime, widget locale scope, LocalePicker.

### i18n runtime (`apps/hospitality/src/i18n/index.ts`)

- Responsibility: the app's i18next instance and the only code that loads catalogs or
  changes language.
- Initialised at module level before `createRoot`, en-US resources bundled,
  `fallbackLng: "en-US"` (so a missing key renders en-US, never the raw key). Other
  catalogs loaded by `loadCatalog(locale)` = dynamic `import()` of
  `./locales/<locale>.json` + `addResourceBundle`. `changeLocale(locale)` loads the app
  catalog and the rialto dictionary in parallel, then switches language, persists to
  `localStorage["mbe-hospitality-locale"]` (try/catch, like `VenueContext`), and sets
  `document.documentElement.lang`.
- `LocaleBridge`: subscribes to `languageChanged` and renders `RialtoLocaleProvider` with
  the loaded rialto messages. Mounted in `main.tsx` inside `RialtoProvider` around **both**
  `Root` branches, so pre-auth screens, public routes and `AuthConfigError` are covered.
- Typed keys: react-i18next module augmentation from the en-US catalog — `t("no.such.key")`
  fails typecheck.

### Widget locale scope (`apps/hospitality/src/components/booking-widget/`)

- Responsibility: gives the booking widget a locale independent of the dashboard.
- `i18n.cloneInstance()` with its own language, persisted to
  `localStorage["mbe-booking-widget-locale"]`; wraps the widget in its own
  `I18nextProvider` + `LocaleBridge`. Initial locale: stored → (demo page only) dashboard
  language → `resolveLocale` from browser. Used by `PublicBookingPage`,
  `ManageReservationPage` and `BookingWidgetDemoPage`.

### LocalePicker (`apps/hospitality/src/components/LocalePicker/`)

- Responsibility: the switcher UI in its three placements (sidebar footer, settings row,
  widget header compact) and its loading/error states. Built from rialto menu/select
  primitives.
- Props: `value`, `onChange(locale) => Promise<void>`, `variant`. Pending promise → spinner,
  current text stays; rejection → inline "Couldn't load … — Retry", value unchanged.
- `DashboardSidebar` gains a `footerSlot` (mirrors its existing `headerSlot`);
  `SettingsPage` Appearance card gets the settings variant with format preview + MT line.

### Venue formatting (`apps/hospitality/src/utils/format.ts`)

- Responsibility: every display format of date, time, number and money in the app.
- Formatters take explicit `{ locale, timeZone, currency }`; the forced `hour12: true` is
  removed (locale decides). `useVenueFormat()` binds the active i18n language plus the
  selected venue's `ianaTimezone` / `currencyCode` (from `VenueContext`, or the widget's
  venue config) and returns bound formatters. The ≈15 ad-hoc `Intl` display call sites
  (OfflineBanner, ReservationList, ProfilePage, TimelinePage, GuestCard, GuestTable,
  ActivityFeed, AdminPage, FloorPlansPage, useSSESync, reservation-display,
  venueOpenLabel) move onto it. Computation-only `formatToParts("en-US")` uses
  (`getHourIn`, `venueWallClock`, `ics.ts`) and the `en-CA` date-key trick stay.
- Collaborators: i18n runtime, VenueContext, every screen showing time or money.

### Cancellation-policy description (`packages/cancellation-policy`)

- Responsibility: unchanged policy logic; adds `describeCancellationPolicy(policy)` →
  discriminated union (`{ kind: "free-until", hours } | { kind: "fee", hours, amountCents,
currency } | …`). The existing English sentence function is kept, re-implemented over
  the description, for server callers (SMS) until Phase 2. The widget renders the
  description through `t()` + `useVenueFormat`.

### Literal-UI-string lint rule (`packages/config/eslint/local-rules.js`)

- Responsibility: blocks new hardcoded UI text in localized packages.
- `mbe-local/no-literal-ui-strings`: flags JSX text containing a letter, and string /
  template literals in UI attributes (`aria-label`, `aria-description`, `title`,
  `placeholder`, `alt`, `label`, `description`, `heading`, `message`, `loadingText`,
  `emptyText`). Ignores tests, stories, and rialto's `src/i18n/**`. RuleTester tests
  alongside the existing rules. Enabled `error` in `apps/hospitality/eslint.config.js` and
  `packages/rialto/eslint.config.js` `files: src/**` blocks.
- Known limit: English in plain objects (`label: "Home"` in a nav array) is invisible to it
  — that is the e2e sweep's job.

### Catalog parity check (`scripts/check-i18n-catalogs.mjs`)

- Responsibility: blocks a catalog key present in en-US but missing elsewhere.
- Globs `apps/*/src/i18n/locales/*.json`. For each app: every en-US key exists in es-MX and
  fr-CA; en-GB may omit keys (falls back by design); no locale has a key en-US lacks;
  `{{placeholders}}` per key are identical; plural keys carry every category
  `Intl.PluralRules(locale)` requires. Uses `runCheck` (`scripts/lib/fitness-check.mjs`)
  and `walkFiles`; test in `scripts/__tests__/`; registered in `REPO_AUDIT_CHECKS` and as
  `check:i18n-catalogs` (CI `build` job → `ci-gate`).

### Per-locale e2e sweep (`apps/hospitality/e2e/`)

- Responsibility: proves "no untranslated UI text" and "no overflow" on real pages.
- Reuses the route ledger + fixtures behind `e2e/visual.spec.ts`; for each of en-GB,
  es-MX, fr-CA sets the stored locale before load, then (a) collects visible text nodes
  and fails on any that equals an en-US catalog value whose target-locale value differs,
  and (b) fails on elements with `scrollWidth > clientWidth` unless marked
  `data-truncate` (the sanctioned ellipsis cells per ux.md).

## Data model

No database or API change in Phase 1.

- **App catalog** — `apps/hospitality/src/i18n/locales/<locale>.json`, one namespace,
  nested keys by feature area (`booking.header.title`), i18next plural suffixes
  (`_one`, `_many`, `_other`), `{{name}}` interpolation. Lives under `src/` so turbo's lint
  inputs see it.
- **Rialto dictionary** — `RialtoMessages` TS objects, one module per locale.
- **Client preference** — two localStorage keys (`mbe-hospitality-locale`,
  `mbe-booking-widget-locale`), value = a supported locale tag; anything else is ignored.

Access patterns: read the active catalog on every render (in memory after load); load a
catalog once per locale per page session; write the preference only on explicit picker
change. Consistency: preference is per device, eventually irrelevant across devices by
design (account sync is Phase 2).

## Interfaces & contracts

### `resolveLocale({ stored, browser })`

- Input: stored value (string | null), browser preference list.
- Output: a supported locale tag. Total — never throws, never returns unsupported.
- Failure modes: none; garbage input resolves to `en-US`.

### `changeLocale(locale)` (dashboard instance, and the widget clone's equivalent)

- Input: supported locale tag.
- Output: `Promise<void>` resolving once app catalog + rialto dictionary are loaded and the
  language has switched; persists the preference and `<html lang>`.
- Failure modes: chunk fetch fails or exceeds 10 s → rejects; language, storage and
  `lang` stay on the previous locale (LocalePicker shows Retry). Retry is safe — loading is
  idempotent and a cached chunk resolves immediately. Storage write failure is swallowed
  (switch still applies for the session).

### `useRialtoLocale()`

- Input: none (reads optional context).
- Output: `{ locale: string | undefined, messages: RialtoMessages }`.
- Failure modes: none — never throws; no provider ⇒ en-US messages, `undefined` locale
  (byte-identical to today).

### `useVenueFormat()`

- Input: active i18n language + venue (`ianaTimezone`, `currencyCode`) from context.
- Output: bound `date`, `time`, `dateTime`, `number`, `money(cents)` formatters.
- Failure modes: no venue selected (pre-onboarding) → time in device timezone and money
  disallowed (throws in dev; callers only render money with a venue). Invalid IANA zone
  from data → falls back to device zone and reports to Sentry once.

### `describeCancellationPolicy(policy)`

- Input: existing policy object.
- Output: discriminated-union description (no prose, no locale).
- Failure modes: same validation errors the package throws today.

### `check-i18n-catalogs` CLI

- Input: repo tree. Output: findings list; exit 1 on any finding, 0 otherwise.
- Failure modes: unparseable JSON is a finding (not a crash).

## Accepted behaviour changes

Compared old vs new rules over the inputs where they differ:

- **Staff screen times**: device timezone → venue timezone (TimelinePage, ReservationBlock,
  TimelineMobileView, ReservationList, OfflineBanner, ActivityFeed, GuestCard, GuestTable,
  AdminPage, ProfilePage, FloorPlansPage, SSE toasts). Identical whenever device tz =
  venue tz; differs only for a viewer elsewhere. Supersedes the device-clock policy
  documented in `format.ts:66-72` / `service-day.ts:1-12`.
- **en-US output**: removing forced `hour12: true` is a no-op for en-US (`Intl` defaults to
  h12 there) — must be pinned by a test comparing old and new formatter output for en-US
  over a sample of dates/times.
- **Call sites using browser locale** (`undefined` / `[]`): previously followed the OS
  locale; now follow the app's chosen locale. A Spanish-OS user who has not picked a
  locale sees es-MX (via detection) rather than an OS-format/English-text mix.
- **StaffDepositSection** created deposits in `usd` regardless of venue; now uses the
  venue's currency. Identical for USD venues; a correctness fix for others.
- **Rialto with no provider**: no change (en-US strings, `undefined` Intl locale), except
  `resolveWeekStart`'s existing `"en-US"` fallback is kept as-is.

## Stack & dependencies

- **i18next + react-i18next** (hospitality only) — user's choice; mature, typed keys,
  plural rules via `Intl`. Deep: the app touches it through `t()`, `useTranslation`, and
  one runtime module. Check hospitality's bundle budget with `/perf-budget`.
- **No i18next backend plugin** — a 10-line dynamic-import loader covers lazy catalogs.
- **Rialto: no new dependency.** New subpath exports `./locales/*`; `exports:check` and
  size-limit entries updated.

## Decisions & alternatives

- **Rialto via typed context dictionary + per-locale subpaths** over shared i18next
  instance (forces consumers onto i18next) / all locales bundled (breaks per-subpath size
  budgets) / per-component label props (dozens of API additions, no central catalog) —
  ADR-028.
- **Venue timezone on staff screens** over keeping the device-clock policy — PRD says the
  venue owns timezone; differs only for off-site viewers. (User decision, 2026-10-13.)
- **Translations written by the implementing agent in the same PR** over a translate
  script calling an API / a CI auto-fill workflow — no key, spend, or `GITHUB_TOKEN`
  anti-recursion trap; parity check makes omission impossible. Cost: no bulk "regenerate
  all" if quality disappoints.
- **Cancellation policy returns a structured description** over passing a `t` function
  into the package (couples a pure package to i18n shape) / leaving English (violates PRD).
- **Cloned i18next instance for the widget** over a second independent instance (duplicates
  init/config) / inheriting dashboard locale (UX requires independence).
- **ESLint local rule** over `check-adr` regex prohibition (can't scope to packages or
  understand JSX) / adding `eslint-plugin-i18next` (third-party rule with its own heuristics
  to tune; the repo already has a tested local-rules plugin).
- **Catalogs under `src/`** over a top-level `locales/` dir — turbo lint inputs only cover
  `src/**`; outside it, cache hits would skip re-linting after catalog edits.
- **E2E "equals an en-US catalog value" text check** over a pseudo-locale run — tests the
  real shipped locales the PRD names; pseudo-locale left as a future option.

## Requirement trace

| PRD success criterion                       | Component(s)                                                 |
| ------------------------------------------- | ------------------------------------------------------------ |
| No untranslated UI text per locale          | i18n runtime, Rialto messages, e2e sweep                     |
| Browser detection, unsupported → en-US      | Locale policy, i18n runtime                                  |
| Switch keeps form input, persists on reload | i18n runtime (`changeLocale`), LocalePicker, widget scope    |
| Venue USD + venue time in en-GB format      | Venue formatting, cancellation-policy description            |
| Rialto built-in text in all 4 locales       | Rialto messages, LocaleBridge                                |
| Rialto non-breaking, no i18n lib required   | Rialto messages (no-provider default), ADR-028               |
| CI blocks hardcoded string / missing key    | Lint rule, catalog parity check (each with failing fixtures) |
| MT notice visible                           | Locale policy (`machineTranslated`), LocalePicker            |
| No truncation/overflow                      | e2e sweep (overflow assertion), ux.md expansion rules        |

## ADRs

- [ADR-028](../../adr/ADR-028-rialto-localization-through-context.md) — Rialto
  localization through an optional context with typed per-locale dictionaries.
