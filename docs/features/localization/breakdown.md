---
stage: decompose
run: feature:localization
date: 2026-10-13
---

# Breakdown: Localization — Phase 1 (foundation + hospitality)

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Conventions for every item: TDD (failing test first); `pnpm lint`, `pnpm typecheck`,
`pnpm test` green in touched packages; any new en-US catalog key lands **with** its
en-GB (where wording differs), es-MX and fr-CA values in the same PR (architecture:
author-time translation). Rialto-source PRs carry a changeset. "Lint scope" below means
the `files:` globs in `apps/hospitality/eslint.config.js` /
`packages/rialto/eslint.config.js` under which `mbe-local/no-literal-ui-strings` is
`error`; each translation item widens it to the directories it converted.

## Milestone 1: Foundation — locale switching works end to end on one string, gates run

- [x] **Locale policy** — `apps/hospitality/src/i18n/locales.ts`: `SUPPORTED_LOCALES`
      (tag, endonym, `machineTranslated`) and `resolveLocale({ stored, browser })`.
  - Accept: unit tests cover exact match, same-language match (`es-AR`→es-MX,
    `fr-FR`→fr-CA, `en-AU`→en-US, `en-GB`→en-GB), invalid stored value ignored, empty
    browser list → en-US; function never throws.
  - Blocked by: —
- [x] **Rialto messages core** — `RialtoMessages` interface, inline en-US object,
      `RialtoLocaleProvider`, `useRialtoLocale()`, optional `locale`/`messages` props on
      `RialtoProvider`.
  - Accept: test renders `useRialtoLocale()` with no provider and gets
    `{ locale: undefined, messages: enUS }` without throwing; with provider gets the
    supplied values; existing rialto test suite and visual baselines unchanged.
  - Blocked by: —
- [x] **Rialto locale subpaths** — `locales/en-GB.ts` (spreads en-US), `es-MX.ts`,
      `fr-CA.ts` exported as `@mattbutlerengineering/rialto/locales/<locale>`.
  - Accept: each module typechecks as `RialtoMessages` (removing a key fails
    `pnpm typecheck`); `exports:check` passes; size-limit has an entry per locale
    subpath and existing per-component budgets are unchanged.
  - Blocked by: Rialto messages core
- [x] **i18n runtime** — i18next init in `apps/hospitality/src/i18n/index.ts`, en-US
      catalog, dynamic-import `loadCatalog`, `changeLocale`, `LocaleBridge` mounted around
      both `Root` branches in `main.tsx`, typed-key module augmentation, `<html lang>` sync,
      `mbe-hospitality-locale` persistence. Converts one visible string (the "Skip to main
      content" link) as the proving slice.
  - Accept: tests show (a) first load resolves locale via `resolveLocale`; (b)
    `changeLocale("es-MX")` switches the string and the rialto messages, persists, sets
    `lang="es-MX"`; (c) a rejected/timed-out (10 s) catalog load rejects and leaves
    language, storage and `lang` unchanged; (d) a missing es-MX key renders en-US text;
    (e) `t("no.such.key")` fails typecheck (type test). Hospitality bundle checked with
    `/perf-budget`.
  - Blocked by: Locale policy, Rialto locale subpaths
- [x] **Catalog parity check** — `scripts/check-i18n-catalogs.mjs` +
      `scripts/__tests__/check-i18n-catalogs.test.mjs`, registered in `REPO_AUDIT_CHECKS`
      and as `check:i18n-catalogs`.
  - Accept: fixture tests fail on: key missing from es-MX or fr-CA; key present only in
    a non-en-US catalog; placeholder mismatch; missing plural category per
    `Intl.PluralRules`; unparseable JSON. en-GB omitting a key passes. Real catalogs pass.
    `check-fitness-check-wiring` test stays green.
  - Blocked by: i18n runtime
- [x] **Literal-UI-string lint rule** — `mbe-local/no-literal-ui-strings` in
      `packages/config/eslint/local-rules.js` with RuleTester tests; wired into both
      packages' configs with an initially empty lint scope.
  - Accept: RuleTester valid/invalid cases cover JSX text, each listed UI attribute,
    template literals, ignored paths (tests, stories, rialto `src/i18n/**`); a fixture
    file with `<button>Save</button>` placed inside a lint-scoped path fails `pnpm lint`.
  - Blocked by: —

## Milestone 2: Guest booking — public booking and manage pages fully usable in 4 locales

- [x] **Venue formatting** — refactor `apps/hospitality/src/utils/format.ts` to explicit
      `{ locale, timeZone, currency }`, drop forced `hour12`, add `useVenueFormat()`. (tracker: #6612)
  - Accept: equivalence test: for en-US, old and new formatters produce identical output
    over a sample of ≥20 date/time/money inputs across two venue timezones; en-GB test
    shows `US$40.00`, 24h time, `dd/mm/yyyy` for a USD / America/Los_Angeles venue;
    invalid IANA zone falls back to device zone and reports once.
  - Blocked by: i18n runtime
- [ ] **Cancellation-policy description** — `describeCancellationPolicy()` discriminated
      union in `packages/cancellation-policy`; English sentence function re-implemented
      over it. (tracker: #6613)
  - Accept: existing English-sentence tests pass unchanged; new tests cover every
    description kind.
  - Blocked by: —
- [ ] **LocalePicker** — `apps/hospitality/src/components/LocalePicker/` with `sidebar`,
      `settings`, `compact` variants. (tracker: #6614)
  - Accept: tests: endonyms listed, MT tag on es-MX/fr-CA only, spinner while
    `onChange` pending with current text retained, rejection shows Retry and keeps value,
    keyboard operable; axe clean.
  - Blocked by: i18n runtime
- [ ] **Rialto migration — overlays & dismiss** — Alert, Banner, Toast, ToastAnimated,
      Dialog, Drawer, Popover, HoverCard, ConfirmDialog defaults onto `useRialtoLocale()`. (tracker: #6615)
  - Accept: each component renders es-MX text under a provider and byte-identical English
    with none; those component directories added to rialto lint scope.
  - Blocked by: Rialto locale subpaths
- [ ] **Rialto migration — navigation & data** — Pagination, Calendar, DateRange,
      DatePicker, DateRangePicker, TimePicker, NumberInput, Breadcrumb, Steps, Timeline,
      Sidebar, NavigationMenu, GlobalNav, Navbar, Skeleton, ScrollArea, ImageUpload,
      Odometer; context locale becomes the `Intl` fallback. (tracker: #6616)
  - Accept: same as the previous rialto item, plus a Calendar test showing es-MX month
    names via context with no `locale` prop, and today's behaviour with no provider.
  - Blocked by: Rialto locale subpaths
- [ ] **Rialto migration — inputs & composites** — Tag, Combobox, Autocomplete, Select,
      CommandPalette, ChatPanel, MasterOverride, Progress/Spinner, Button `loadingText`. (tracker: #6617)
  - Accept: same as the overlays item; afterwards rialto lint scope is `src/**` and
    `pnpm lint` passes for rialto.
  - Blocked by: Rialto migration — overlays & dismiss, Rialto migration — navigation & data
- [ ] **Widget locale scope** — cloned i18next instance, `mbe-booking-widget-locale`,
      compact LocalePicker in the widget header, used by `PublicBookingPage`,
      `ManageReservationPage`, `BookingWidgetDemoPage`. (tracker: #6618)
  - Accept: tests: widget locale independent of dashboard both ways; demo page defaults
    to dashboard locale; public page defaults to browser; switching mid-flow preserves
    entered guest details.
  - Blocked by: LocalePicker, Venue formatting
- [ ] **Translate guest surfaces** — all strings in `components/booking-widget/**`,
      `PublicBookingPage`, `ManageReservationPage`, cancellation-policy rendering via
      `describeCancellationPolicy`. (tracker: #6619)
  - Accept: those paths in hospitality lint scope with `pnpm lint` green;
    `check:i18n-catalogs` green; es-MX/fr-CA render tests for each booking step.
  - Blocked by: Widget locale scope, Cancellation-policy description, Rialto migration —
    inputs & composites
- [ ] **Per-locale e2e sweep (public routes)** — spec reusing the route ledger/fixtures
      behind `e2e/visual.spec.ts`; for en-GB, es-MX, fr-CA asserts no visible text equals
      a differing en-US catalog value and no non-`data-truncate` overflow. (tracker: #6620)
  - Accept: passes on `book/:venueSlug` (every step) and `reservations/manage` in all
    three locales; a deliberately reverted string makes it fail.
  - Blocked by: Translate guest surfaces

## Milestone 3: Staff dashboard — every hospitality screen in 4 locales, gates strict

- [ ] **Staff switcher placement** — `footerSlot` on `DashboardSidebar` with sidebar
      LocalePicker (icon-only when collapsed), Settings "Language & region" row with format
      preview and MT line. (tracker: #6621)
  - Accept: switching from either placement updates the UI in place without losing form
    input and persists across reload (component + e2e test).
  - Blocked by: LocalePicker
- [ ] **Staff time & money onto venue formatting** — move the ad-hoc `Intl` display call
      sites (OfflineBanner, ReservationList, ProfilePage, TimelinePage, ReservationBlock,
      TimelineMobileView, GuestCard, GuestTable, ActivityFeed, AdminPage, FloorPlansPage,
      useSSESync, reservation-display, venueOpenLabel, HomePage `?? "USD"`) onto
      `useVenueFormat`; `StaffDepositSection` uses venue currency. (tracker: #6622)
  - Accept: tests show staff timeline times in venue tz when device tz differs (accepted
    behaviour change); deposit for a CAD venue is created in `cad`; `format.ts`/
    `service-day.ts` device-clock policy comments replaced; no display `Intl` call in
    hospitality `src` outside `format.ts` (grep check in test).
  - Blocked by: Venue formatting
- [ ] **Translate shell & pre-auth** — `UnauthenticatedShell`, LoginGate, CallbackPage,
      SessionExpiredGate, AuthFailurePage, SignOutPage, LoadingPage, AuthConfigError,
      `DashboardLayout` (breadcrumbs), `DashboardSidebar` nav labels,
      `constants/session-lapse-copy.ts`, `lib/describe-auth-error.ts`. (tracker: #6623)
  - Accept: paths in lint scope, catalogs parity-green, render tests in es-MX.
  - Blocked by: i18n runtime
- [ ] **Translate Home & Timeline** — `HomePage`, `TimelinePage`, `components/timeline/**`,
      `components/dashboard/**`; status badges use short-form keys; ellipsis cells marked
      `data-truncate`. (tracker: #6624)
  - Accept: paths in lint scope, parity-green, render tests in es-MX and fr-CA.
  - Blocked by: Translate shell & pre-auth, Staff time & money onto venue formatting
- [ ] **Translate Reservations & Guests** — `ReservationsPage`, `GuestsPage`,
      `components/crm/**`, walk-in/new-reservation dialogs, waitlist, toasts. (tracker: #6625)
  - Accept: paths in lint scope, parity-green, render tests in es-MX and fr-CA.
  - Blocked by: Translate shell & pre-auth, Staff time & money onto venue formatting
- [ ] **Translate Floor plans** — `FloorPlansPage`, `FloorPlanEditorPage`,
      `components/floor-plan/**`, `TableStatusBadge`. (tracker: #6626)
  - Accept: paths in lint scope, parity-green, render tests in es-MX and fr-CA.
  - Blocked by: Translate shell & pre-auth
- [ ] **Translate Onboarding** — `VenueOnboardingPage`, `components/venue-onboarding/**`
      (incl. `LocationTimeStep` currency option labels via `Intl.DisplayNames`). (tracker: #6627)
  - Accept: paths in lint scope, parity-green, wizard render tests in es-MX and fr-CA.
  - Blocked by: Translate shell & pre-auth
- [ ] **Translate Profile, Settings, Admin, Widget demo** — `ProfilePage`, `SettingsPage`,
      `AdminPage`, `BookingWidgetDemoPage` (`FEATURES`, `DEVICE_LABELS`), any remaining
      `src/**` files. (tracker: #6628)
  - Accept: hospitality lint scope becomes `src/**` (per-directory globs removed) and
    `pnpm lint` is green — the gate is strict.
  - Blocked by: Translate Home & Timeline, Translate Reservations & Guests, Translate Floor
    plans, Translate Onboarding, Staff switcher placement
- [ ] **Per-locale e2e sweep (authenticated routes)** — extend the sweep to every
      Auth0-gated ledger route. (tracker: #6629)
  - Accept: passes for en-GB, es-MX, fr-CA across all routes; overflow defects found are
    fixed (wrap) or sanctioned (`data-truncate`) per ux.md.
  - Blocked by: Translate Profile, Settings, Admin, Widget demo, Per-locale e2e sweep
    (public routes)

## Milestone 4: Release prep

- [ ] **Rialto release notes & ADR index** — rialto minor changeset describing the new
      `./locales/*` exports and provider props; ADR-028 index row in `docs/adr/README.md`
      on a branch from current `origin/main`; `apps/hospitality/CLAUDE.md` and
      `packages/rialto/CLAUDE.md` document the i18n conventions (where catalogs live,
      lint rule, parity check). (tracker: #6630)
  - Accept: `pnpm changeset status` lists rialto minor; ADR index renders ADR-028;
    `/claude-md-improver`-style dangling-path check finds no broken references.
  - Blocked by: Per-locale e2e sweep (authenticated routes)

## Design gaps found

none.

## Notes

- Ordering lets Milestone 2 ship a demonstrable public guest flow before any staff screen
  is touched; the lint gate tightens per directory so it is never red on main.
- Translation items are sized at ~100–150 strings each (≈600–800 total per architecture
  research); split further during Implement if one runs long.
- 2026-10-13 (Locale policy): `resolveLocale` applies "exact match, then same-language
  match" **per browser entry**, in the browser's preference order — `["fr-FR", "es-MX"]`
  resolves to fr-CA, not es-MX. A whole-list exact pass first would override the user's
  top preference. Interpretation of architecture wording, not a design change.
- 2026-10-13 (Rialto messages core): `RialtoMessages` starts with only the keys the first
  migration batch needs (`dismiss`, `close`); each migration item adds its own keys with
  all four locale values, rather than translating the full ≈50-string inventory up front.
  New exports ship through the existing `./providers` subpath. `RialtoProvider` gained two
  public props, so `registry.json` and the manifest test's expected prop list changed.
- 2026-10-13 (Rialto messages core): rialto changesets are **patch**, not minor —
  `packages/rialto/CLAUDE.md` says every pre-1.0 release is a patch bump. Overrides the
  "minor changeset" wording in Milestone 4.
- 2026-10-13 (Rialto locale subpaths): found that `tsconfig.lib.json` did not include
  `src/i18n`, so the previous item's `./providers` re-exports shipped with no `.d.ts`
  (source typecheck can't see it). Fixed by adding `src/i18n` to the include, and guarded
  by a `generate-exports.test.ts` case requiring every library entry's source to be under
  that include. Locale subpath budgets are 1.5 kB each (≈130 B today; headroom for the
  full ≈50-string inventory).
- 2026-10-13 (i18n runtime): app catalogs live at `apps/hospitality/src/i18n/catalogs/<tag>.json`,
  not `src/i18n/locales/` as architecture.md says — a `locales/` dir beside `locales.ts`
  reads ambiguously. The **Catalog parity check** item globs `apps/*/src/i18n/catalogs/*.json`.
- 2026-10-13 (i18n runtime): `bootLocale()` (detection) never persists; only `changeLocale()`
  (explicit pick) writes `mbe-hospitality-locale`, so detection never becomes sticky.
  First render waits for `bootLocale()` (≤10 s, en-US on failure) so text never flashes.
- 2026-10-13 (i18n runtime): `createLocaleRuntime()` calls `.use(initReactI18next)`, which
  makes the newest instance react-i18next's global default. The **Widget locale scope**
  item must give the widget an explicit `I18nextProvider` and not rely on the global.
- 2026-10-13 (i18n runtime): hospitality's tsconfig excludes `*.test.ts(x)`, so the
  typed-key contract lives in `src/i18n/typed-keys.typecheck.ts` (never imported).
- 2026-10-14 (Literal-UI-string lint rule): the initial lint scope is each package's
  `src/i18n/**` rather than literally empty — flat config rejects an empty `files` list,
  and `src/i18n/**` is already literal-free. Translation items append their paths to
  `LOCALIZED_FILES` in `apps/hospitality/eslint.config.js` / `packages/rialto/eslint.config.js`.
  The rule also covers `aria-placeholder`, `aria-roledescription`, `aria-valuetext`,
  `confirmLabel` and `cancelLabel` beyond the architecture's attribute list.
- 2026-10-14: remaining 19 items mirrored as GitHub issues #6612–#6630 (tracking #6631),
  each line above carrying `(tracker: #N)`. None is labelled `ready` until #6591 merges,
  because every item builds on Milestone 1 code not yet on `main`. The breakdown has 25
  items, not 24 as stated earlier in the run.
