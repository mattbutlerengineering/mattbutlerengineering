---
stage: verify
run: feature:localization
date: 2026-10-18
assumptions:
  - "Graded at this branch's base, 482ed0bc6. At grading time origin/main was d5afd3ab4. The only non-docs change between them is #7051 (PageHeader.module.css and its test), which touches no i18n code, catalog or rialto locale code. Its CI and E2E runs are cited below as evidence for main."
  - "E2E Tests (e2e.yml) has no push-to-main trigger. It runs only on pull_request and workflow_dispatch. The newest Hospitality E2E run is 39144888634, on #7051's head fef471b79, which merged as main's 5f9e049f2. It is used as the main-state evidence for e2e/locale-sweep.spec.ts. A pull_request run tests the merge of the head with main."
  - "The PRD's 'supported viewport widths' are not defined anywhere in the run. They are taken as the widths the sweep uses: 375x812 (public and gated) and 1280x720 (gated)."
  - "No real public venue slug can be found from the repo or the public API. GET /public/v1/venues answers 404 (no listing). Synthetic-journey venues are deleted after each run. The only repo slug, the-oak-table, is documented as 'Venue not found' in production. The production book route was therefore probed with a deliberately absent slug, as the repo's own surface probes do. The found-venue booking flow is graded on CI evidence only. This is the skill's named default: verify the completed subset and note the gap."
  - "Breakdown acceptance criteria are graded under the PRD criterion that covers them. Those no PRD criterion covers are graded together under 'Breakdown acceptance criteria' by their passing suites."
---

# Verification: Localization — Phase 1 (foundation + hospitality)

## Summary

All 9 PRD criteria **PASS** on automated evidence. 0 fail.

The production probe agrees for the parts it could reach:

- The public error states of the guest routes render fully translated in es-MX and fr-CA, and in English for en-GB.
- Browser-language detection and the stored guest choice behave as specified.

Some parts were **not shown in production**:

- the found-venue booking flow (no real public slug is discoverable)
- every authenticated staff surface (behind Auth0; CI only)
- en-GB money and time formatting (it needs a real venue)

Two findings sit outside the run's scope and do not fail any criterion:

- The known local failure in `onboarding-localization.test.tsx` comes from test isolation. It is not a product defect and not a macOS/ICU difference, and CI is green.
- Every hospitality page, en-US included, triggers one enforced CSP refusal (`script-src eval`). It comes from zod's own eval capability probe and is not from localization.

Verdict: the run meets its PRD. It routes to Review.

Soft gate: `breakdown.md` has 25 `[x]` and 0 `[ ]`.

## Commands and CI runs (shared evidence)

Every command ran in `.claude/worktrees/localization-close`, after `pnpm build --filter '@mbe/hospitality^...'` (`Time: 14.147s`, exit 0).

| Check                                                              | Outcome                                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:i18n-catalogs`                                         | `PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.` exit 0                        |
| `pnpm --dir apps/hospitality lint` (`eslint src/`)                 | `✖ 145 problems (0 errors, 145 warnings)`, exit 0. No `no-literal-ui-strings` hit                                      |
| `pnpm --dir packages/rialto lint`                                  | `✖ 168 problems (0 errors, 168 warnings)`, exit 0. No `no-literal-ui-strings` hit                                      |
| `pnpm --dir apps/hospitality typecheck`                            | `tsc --noEmit -p tsconfig.test.json && tsc --noEmit -p tsconfig.e2e.json`, exit 0                                      |
| `vitest run` in `apps/hospitality`                                 | `Test Files 222 passed (222)` / `Tests 2983 passed (2983)`, exit 0                                                     |
| `vitest run` in `packages/rialto`                                  | `Test Files 172 passed (172)` / `Tests 2681 passed (2681)`, exit 0                                                     |
| `vitest run` in `packages/cancellation-policy`                     | `Test Files 2 passed (2)` / `Tests 34 passed (34)`                                                                     |
| `vitest run eslint/no-literal-ui-strings` in `packages/config`     | `Test Files 1 passed (1)` / `Tests 21 passed (21)`                                                                     |
| `pnpm --dir scripts test -- check-i18n-catalogs`                   | `Test Files 1 passed (1)` / `Tests 13 passed (13)`                                                                     |
| CI run **39145301873** (`ci.yml`, push, main `5f9e049f2`)          | `CI Gate` success. `Lint`, `Typecheck`, `Build`, `Test (Node 22, hospitality)`, `Test (Node 22, rialto)` all succeeded |
| E2E run **39144888634** (`e2e.yml`, #7051 head `fef471b79`)        | job `Hospitality E2E` (117726750603) success. `252 passed (11.2m)`, no failed or flaky line                            |
| Deploy run **39145301837** (`deploy-static.yml`, main `5f9e049f2`) | job `Deploy Hospitality` (117727857706) success. This is the build the production probe hit                            |

`e2e/locale-sweep.spec.ts` holds 114 tests. `playwright test --list --project=chromium e2e/locale-sweep.spec.ts` lists them (dummy `E2E_AUTH*` vars, listing only):

- 6 public tests: `book/:venueSlug — date, time, details and confirmation steps` and `reservations/manage — details and cancel dialog`, each in en-GB, es-MX and fr-CA.
- 108 authenticated tests: 18 ledger routes × 2 viewports × 3 locales.

The run lists `Total: 115 tests in 2 files`; the other one is the `setup` project. In run 39144888634 the sweep ran inside the 252 that passed:

```
2026-10-18T16:27:20.8027771Z Running 252 tests using 1 worker
2026-10-18T16:38:32.6507292Z   Slow test file: [chromium] › e2e/locale-sweep.spec.ts (5.2m)
2026-10-18T16:38:32.6511122Z   252 passed (11.2m)
```

The job's reporter is `github` + `json`, and the JSON file is uploaded only on failure. So the log carries no per-test lines. The sweep's own pass count (114) is inferred from `252 passed` having no `failed` or `flaky` line, plus the sweep file being named in the run.

## Criteria & evidence

### 1. With each of en-GB, es-MX, fr-CA selected, every hospitality guest and staff screen shows no untranslated en-US UI text, checked by an automated test per locale across the routes

- **Check:** CI result for the sweep. It fails on any visible text, placeholder, aria-label, title or alt that equals an en-US catalog or Rialto value the locale translates differently. It also fails on a public-namespace value left identical to en-US without a cognate acknowledgement. Unit render tests per surface.
- **Evidence:**
  - E2E run 39144888634: `252 passed (11.2m)`, with `locale-sweep.spec.ts (5.2m)` in the run.
  - That covers the 6 public tests (every booking step plus the manage details and cancel dialog) and the 108 gated tests. The gated routes are `*`, `/`, `admin`, `booking-widget`, `briefing`, `chat`, `dashboard`, `floor-plans`, `floor-plans/:id`, `guests`, `onboarding`, `profile`, `reservations`, `settings`, `setup`, `setup/hours`, `timeline` and `waitlist`.
  - Each gated test also asserts `html[lang]` equals the locale.
  - Local unit suites, all passing:

    ```
    ✓ src/i18n/shell-localization.test.tsx (6 tests)
    ✓ src/i18n/timeline-localization.test.tsx (18 tests)
    ✓ src/i18n/reservations-guests-localization.test.tsx (8 tests)
    ✓ src/i18n/guest-booking-localization.test.tsx (17 tests)
    ✓ src/i18n/onboarding-localization.test.tsx (13 tests)
    ✓ src/i18n/floor-plan-localization.test.tsx (7 tests)
    ✓ src/i18n/staff-pages-localization.test.tsx (12 tests)
    ```

- **Limits:** Each gated test sweeps the route's landing render. Dialogs, menus and toasts opened by interaction on staff routes are covered by the unit render tests, not the sweep. Pre-auth screens (LoginGate, CallbackPage, SessionExpiredGate and the rest) are not ledger routes. They are covered by `shell-localization.test.tsx` only.
- **Result: PASS**

### 2. A browser whose preferred language is es-MX (or fr-CA, en-GB) opens hospitality in that locale on first visit; an unsupported language opens in en-US

- **Check:** Unit tests for `resolveLocale` and the boot runtime. A production probe with a fresh Playwright context per browser locale and no storage, against `https://mattbutlerengineering.com/hospitality/reservations/manage`.
- **Evidence:**
  - Units:

    ```
    ✓ locales.test.ts > resolveLocale > matches a browser tag exactly, case-insensitively
    ✓ locales.test.ts > resolveLocale > falls back to the supported locale for the same language
    ✓ locales.test.ts > resolveLocale > skips unsupported languages and unparseable tags
    ✓ locales.test.ts > resolveLocale > defaults to en-US with nothing to go on
    ✓ runtime.test.tsx > locale runtime > boots into the locale resolveLocale picks from the browser, without persisting it
    ```

  - Production, `navigator.languages` → `<html lang>` and heading:

    ```
    ["es-MX"] lang=es-MX "Sin enlace de acceso"
    ["fr-CA"] lang=fr-CA "Aucun lien d’accès"
    ["en-GB"] lang=en-GB "No Access Link"
    ["de-DE"] lang=en-US "No Access Link"
    ["es-AR"] lang=es-MX "Sin enlace de acceso"
    ["fr-FR"] lang=fr-CA "Aucun lien d’accès"
    ["en-AU"] lang=en-US "No Access Link"
    ```

  - The staff dashboard was not loaded in production (Auth0). The document `lang` above is set by the dashboard runtime (`bootLocale`), which runs on these public routes too.

- **Result: PASS**

### 3. Changing locale via the switcher updates the visible UI without losing in-progress form input, and persists across reload in the same browser

- **Check:** Component tests for both staff placements and for the guest widget, the CI e2e reload test, and a production check that a stored guest choice wins after reload.
- **Evidence:**
  - Units:

    ```
    ✓ StaffLocaleSwitcher.test.tsx > staff locale switcher in the sidebar footer > switches in place without losing form input and persists the choice
    ✓ StaffLocaleSwitcher.test.tsx > staff locale switcher in the Settings card > switches from the Settings select without losing form input and persists the choice
    ✓ WidgetLocaleScope.test.tsx > WidgetLocaleScope > switching mid-flow keeps entered guest details
    ✓ LocalePicker.test.tsx > LocalePicker > shows a spinner and keeps the current text while the load is pending
    ✓ LocalePicker.test.tsx > LocalePicker > on rejection keeps the value, shows Retry, and Retry succeeds
    ```

  - E2E: `e2e/settings.spec.ts` › `Staff locale switcher` › `sidebar switch updates the UI in place and persists across reload` picks Español, asserts `Idioma y región`, then runs `mockedPage.reload()` and asserts `Idioma y región` again. It is part of `252 passed` in run 39144888634.
  - Production: es-MX browser with `mbe-booking-widget-locale=fr-CA` stored, after `page.reload()`:

    ```
    {"locale":"es-MX","stored":"fr-CA","lang":"es-MX","scopes":["DIV:fr-CA"],"h":"Aucun lien d’accès"}
    ```

    The guest scope follows the stored choice over the browser and marks its subtree `lang="fr-CA"`. The document `lang` stays with the dashboard runtime (es-MX), which matches the design: the widget scope is independent.

- **Result: PASS.** The production switch itself was not exercised: the probed error states render no picker.

### 4. A USD / America-Los_Angeles venue shown to an en-GB viewer: USD amount (not GBP, not converted), venue-local time, en-GB format

- **Check:** Unit tests of `useVenueFormat` and the staff call sites.
- **Evidence:**
  - `src/hooks/useVenueFormat.test.tsx`:

    ```
    it("binds the active language to the venue's zone and currency (en-GB, USD venue)"
      expect(result.current.locale).toBe("en-GB");
      expect(result.current.formatMoney(4000)).toBe("US$40.00");
      expect(result.current.formatTime("2024-03-15T21:30:00Z")).toBe("14:30");
      expect(result.current.formatShortDate("2024-03-15")).toBe("15/03/2024");
    ✓ useVenueFormat > binds the active language to the venue's zone and currency (en-GB, USD venue)
    ✓ useVenueFormat > falls back to the device zone for an invalid venue zone without throwing
    ✓ staff-venue-formatting.test.tsx > staff time uses the venue timezone, not the device's > ReservationBlock
    ✓ staff-venue-formatting.test.tsx > staff time uses the venue timezone, not the device's > ReservationList
    ✓ staff-venue-formatting.test.tsx > staff time uses the venue timezone, not the device's > OfflineBanner
    ```

  - `21:30Z` → `14:30` is Los Angeles PDT, so the time is venue-local in 24h form.

- **Result: PASS** on unit evidence. Not shown in production, because no real venue was reachable (see Not verified).

### 5. Every rialto component with built-in user-visible text renders it in all 4 locales when the app sets the locale

- **Check:** The rialto locale suites, which cover all three migration batches, and the subpath export test.
- **Evidence:**

  ```
  ✓ src/components/overlays-locale.test.tsx (24 tests)
  ✓ src/components/navigation-data-locale.test.tsx (60 tests)
  ✓ src/components/inputs-composites-locale.test.tsx (54 tests)
  ✓ src/i18n/__tests__/useRialtoLocale.test.tsx (6 tests)
  ✓ src/i18n/__tests__/locales.test.ts (6 tests)
      ✓ exposes one ./locales/<tag> subpath per non-default locale (ADR-028)
  ```

  The rialto lint scope is `LOCALIZED_FILES = ["src/**/*.{ts,tsx}"]` with `mbe-local/no-literal-ui-strings: "error"`, and lint has 0 errors. So no component source carries a literal UI string.

- **Result: PASS**

### 6. Existing rialto tests and visual baselines pass unchanged when no locale is set, and rialto requires no i18n library

- **Check:** Whether any committed rialto baseline changed across the run's commits, the rialto-visual runs at each rialto-touching merge, whether pre-existing rialto tests were edited, and rialto's dependency fields.
- **Evidence:**
  - All 53 rialto baselines live under `packages/rialto/src/test/visual/__screenshots__/`. `git diff --stat 5c53ebf86~1 42f81075f` over those directories printed nothing. Each of the 26 run and post-ship commits listed in the brief shows `rialto-png=0`.
  - `rialto-visual.yml` push runs at the rialto merges all succeeded:

    ```
    38689146000 success 5c53ebf86 (#6591)
    38752720327 success 2bec613c0 (#6689)
    38764696811 success aa8eeb225 (#6710)
    38803016929 success 7d05cdca5 (#6724)
    38938681631 success dba88e32e (#6868)
    ```

  - Pre-existing rialto tests modified (status `M`) in those commits:
    - `scripts/generate-exports.test.ts` and `scripts/generate-manifest.test.ts` (#6591). These are new `./locales/*` subpaths and new `RialtoProvider` props, a deliberate API addition.
    - `src/i18n/__tests__/useRialtoLocale.test.tsx`, which is the run's own new test.
    - No component test was modified. #6724 and #6868 show none.
  - Rialto dependencies:

    ```
    deps: [] peers: [ 'framer-motion', 'lucide-react', 'react', 'react-dom' ]
    ```

  - Today's full rialto suite: `Tests 2681 passed (2681)`.

- **Result: PASS**

### 7. A PR adding a hardcoded UI string in hospitality or rialto fails CI, and a PR adding an en-US key absent from es-MX or fr-CA fails CI, each shown by a deliberately failing fixture

- **Check:** A fixture fed through ESLint on stdin with an in-scope filename, so no file was written. The parity check's fixture tests. Confirmation that CI runs both gates.
- **Evidence:**
  - Hospitality:

    ```
    $ printf '…<button type="button">Save</button>…' | npx eslint --stdin --stdin-filename src/components/VerifyFixture.tsx
      2:32  error  Hardcoded UI text. Render it through the locale's messages (t() in apps, useRialtoLocale() in rialto)  mbe-local/no-literal-ui-strings
    exit=1
    ```

  - Rialto:

    ```
    $ printf '…<span aria-label="Close dialog">x</span>…' | npx eslint --stdin --stdin-filename src/components/VerifyFixture/VerifyFixture.tsx
      2:16  error  Hardcoded "aria-label" text. …  mbe-local/no-literal-ui-strings
      2:42  error  Hardcoded UI text. …            mbe-local/no-literal-ui-strings
    exit=1
    ```

  - Catalog parity fixtures:

    ```
    ✓ check-i18n-catalogs.test.mjs > compareCatalog > flags a key missing from a required locale
    ✓ check-i18n-catalogs.test.mjs > compareCatalog > lets an optional locale (en-GB) omit keys
    ✓ check-i18n-catalogs.test.mjs > compareCatalog > flags placeholders that differ from en-US
    ✓ check-i18n-catalogs.test.mjs > compareCatalog > requires every plural category the target locale uses
    ✓ check-i18n-catalogs.test.mjs > findCatalogFindings > reports unparseable JSON as a finding, not a crash
    ```

  - CI wiring:
    - `ci.yml` job `Lint` runs `pnpm lint` and is in `ci-gate.needs`.
    - `scripts/run-repo-audit.mjs:130` registers `check-i18n-catalogs`, which `Build` runs via `pnpm repo-audit`.
    - Run 39145301873 `Build` log:

      ```
      ── repo-audit: check-i18n-catalogs ──
      PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
        PASS  check-i18n-catalogs
      ```

- **Result: PASS**

### 8. A visible notice states that es-MX and fr-CA translations are machine-generated

- **Check:** LocalePicker tests (all three variants carry the notice by design: ux.md says "No page banners").
- **Evidence:**

  ```
  ✓ locales.test.ts > SUPPORTED_LOCALES > flags only es-MX and fr-CA as machine-translated
  ✓ LocalePicker.test.tsx > LocalePicker > lists all four endonyms, machine-translation tags on es-MX and fr-CA only
  ✓ LocalePicker.test.tsx > LocalePicker > settings variant: labelled select plus a machine-translation note only for MT locales
  ✓ LocalePicker.test.tsx > LocalePicker > stacks the machine-translation tag under the endonym, not in the end-aligned shortcut slot the sidebar clips (#6866)
  ```

- **Result: PASS.** Not shown in production: the probed guest error states render no picker, and the staff picker is behind Auth0.

### 9. No hospitality screen has truncated or overflowing text in any locale at the supported viewport widths

- **Check:** The sweep's overflow rule. It fails on any element whose content is wider than its box unless it sits inside a `data-truncate` cell, and on any page-level sideways scroll. It runs at 375x812 (public and gated) and 1280x720 (gated). Production screenshots of the probed pages at 375x812.
- **Evidence:**
  - E2E run 39144888634 `252 passed`, with the sweep file in the run.
  - `LocalePicker.test.tsx > keeps each endonym on one line next to its machine-translation tag (#6866)` passes.
  - Production screenshot `fr-CA-reservations_manage_token_locale_verify_invalid_token.png` (375 wide) shows "Lien non valide" and its description, plus the CTA "Retour à Matt Butler Engineering". The CTA wraps to two lines inside its button and nothing is clipped.
- **Result: PASS.** Widths are an assumption, logged in the frontmatter.

### Breakdown acceptance criteria not covered by a PRD criterion

- **Check:** The suites named in each item, from the full local runs above (2983 hospitality, 2681 rialto, 34 cancellation-policy, 21 lint-rule and 13 parity tests, all passing).
- **Covered items:**
  - Locale policy (`locales.test.ts`, 10 tests).
  - i18n runtime: failure, timeout and missing-key fallback (`runtime.test.tsx`, 13 tests). This includes `a load slower than the timeout rejects and changes nothing` and `renders en-US text for a key the active catalog lacks, never the raw key`.
  - Venue formatting equivalence (`format.test.ts`, 31 tests; `staff-venue-formatting.test.tsx` › `en-US output is unchanged without a venue`).
  - Cancellation-policy description (34 tests).
  - LocalePicker a11y (`LocalePicker.a11y.test.tsx`, 5 tests).
  - Widget scope independence (`WidgetLocaleScope.test.tsx`, 7 tests).
  - `ToastLocaleOverride.test.tsx` (5 tests).
  - The typed-key contract (`typecheck` exit 0).
- **Result: PASS** for those items.
- **Not re-run here:** `/perf-budget`, rialto `size-limit` and `pnpm changeset status` (see Not verified).

## Production probe (https://mattbutlerengineering.com, deploy run 39145301837)

The probe used Playwright 1.64 chromium with a fresh context per case at 375x812. A `securitypolicyviolation` listener was injected before load. There was no login, no booking and no email.

- **DNS:** `dig +short` with the LAN resolver and with `@1.1.1.1` both returned `104.21.25.32` and `172.67.222.73`. No sinkhole on the app host.
- **Pages:** All nine pages returned 200.

| Locale | `book/locale-verify-absent-venue` (title / heading / button)                    | `reservations/manage` (no token) | `reservations/manage?token=locale-verify-invalid-token`              |
| ------ | ------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| es-MX  | `Reserva una mesa — Hospitality` / `No se encontró el restaurante` / `Regresar` | `Sin enlace de acceso`           | `Enlace no válido`: "Este enlace ya se usó o no es válido."          |
| fr-CA  | `Réserver une table — Hospitality` / `Établissement introuvable` / `Retour`     | `Aucun lien d’accès`             | `Lien non valide`: "Ce lien a déjà été utilisé ou n’est pas valide." |
| en-GB  | `Book a table — Hospitality` / `Venue not found` / `Go Back`                    | `No Access Link`                 | `Invalid Link`                                                       |

- **Language attributes:** Every page had `<html lang>` and the guest scope `DIV[lang]` equal to the locale. en-GB has no wording that differs from en-US in these namespaces, so English text is the correct result there.
- **Console:** Only expected resource errors appeared: `404` on the absent venue and `401` on the invalid token.
- **CSP:** Each page logged one enforced refusal. The same refusal appears in **en-US**:

  ```
  {"d":"script-src","b":"eval","src":".../hospitality/assets/json-render-vendor-rNBYv5WP.js","line":1,"col":2682,"disp":"enforce"}
  ```

  The code at that column is zod's JIT capability probe, which is caught and logs nothing to the console:

  ```
  try{return Function(``),!0}catch{return!1}
  ```

  This refusal is not caused by localization, and no i18n request or catalog chunk was blocked.

Scratch output, outside the repo: `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/9f059937-a91e-47c7-ae4e-a488cb7e8818/scratchpad/loc-verify/probe/`.

## Known local failure: `onboarding-localization.test.tsx > currency option labels > open the select with locale-named options`

- **In CI on main it passes.** Run 39145301873, job `Test (Node 22, hospitality)` (117727991426, Linux). The suite ran live, not as a turbo cache replay:

  ```
  2026-10-18T16:33:38.0596894Z  ✓ src/i18n/onboarding-localization.test.tsx (13 tests) 800ms
   Test Files  222 passed (222)
        Tests  2983 passed (2983)
  ```

- **Locally on macOS it also passes in the full suite**: `✓ src/i18n/onboarding-localization.test.tsx (13 tests) 875ms`, `2983 passed`.
- **It fails only when the file runs alone.** This failed in 3 of 3 runs:

  ```
  $ npx vitest run src/i18n/onboarding-localization.test.tsx
  FAIL  … > currency option labels > open the select with locale-named options
  Error: expect(element).toBeVisible()
  Received element is not visible:
    <div aria-selected="false" class="_option_1ookx_110" data-focused="true" … role="option" …/>
   ❯ src/i18n/onboarding-localization.test.tsx:237:87
  Tests  1 failed | 12 passed (13)
  ```

- **It passes with any co-runner.** With `src/i18n/` the result is `11 passed (11)`. With the file plus `src/components/venue-onboarding` it is `16 passed (16)`. Alone through `-t "currency option labels"` it is `1 passed | 12 skipped`.
- **Classification:** test-isolation fragility, not a product defect and not a macOS/ICU difference.
  - `findByRole("option", { name: "USD - dólar estadounidense" })` _found_ the option, so ICU produced the expected Spanish currency name.
  - What fails is `toBeVisible()` on an option whose ancestor is not yet visible.
  - That outcome depends on which other files or tests share the run, not on the operating system.
- No code was changed.
- Backlog-seed text, not appended: "onboarding-localization currency test fails when run as the only file (toBeVisible on an option of a not-yet-visible listbox); passes in any multi-file run, CI included. Make it wait for the listbox to be visible, or assert presence plus name, so a single-file run is green."

## Failures

None against the PRD.

The CSP refusal and the single-file test fragility are findings outside the run's scope. Backlog-seed text for the CSP refusal, not appended: "hospitality bundles zod's JIT probe (`Function('')`) in json-render-vendor; the enforced CSP refuses it on every page load (`script-src eval`, caught, no console error). Set zod `jitless` globally to stop the refusal noise, which otherwise masks real CSP regressions in probes."

## Not verified

- **Found-venue guest booking flow in production**, in any locale: time slots, details, deposit amount formatting and the widget's compact picker. No real public venue slug is discoverable (assumption 4). The flow is covered by the CI sweep's 6 public tests against mocked APIs only. **Surfaced for the Owner:** a stable public demo venue slug would make this probe possible.
- **Authenticated staff surfaces in production.** These are evidenced by CI only, per the brief: the 108 gated sweep tests and `settings.spec.ts` reload. The gated sweep loads a real Auth0 session (ROPC setup) but mocks every API.
- **en-GB money and time formatting in production.** It needs a real venue. Unit evidence only.
- **The production locale switcher**, both guest and staff. The probed guest error states render no picker. Only the stored-choice-wins-after-reload half was observed.
- **Per-test lines for the sweep in CI.** The JSON report is not uploaded on success. Pass is inferred from `252 passed` with no failed or flaky line.
- **`/perf-budget`, rialto `size-limit` per locale subpath, and `pnpm changeset status`.** These were not re-run in Verify. Rialto `package.json` declares the `./locales/es-MX` export and a size-limit entry at `dist/lib/i18n/locales/es-MX.js`. Whether the changesets were versioned and published is Ship's to state.
- **Pre-auth screens in es-MX/fr-CA/en-GB.** These are covered by unit tests only (es-MX), because they are not ledger routes in the sweep.
