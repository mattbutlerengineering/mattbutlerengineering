---
stage: verify
run: maintenance:localization-conditional-literals
date: 2026-10-18
assumptions:
  - "Maintenance run with re-entry: implement, so there is no prd.md. The criteria list is defect.md's three defects plus every work item's Accept line (the inline breakdown), per the protocol's maintenance orientation."
  - "Hospitality was built locally with only the non-secret public values deploy-static.yml uses (VITE_AUTH_AUTHORITY default, VITE_AUTH_AUDIENCE, VITE_AUTH_REDIRECT_URI, VITE_API_URL). VITE_AUTH_CLIENT_ID, VITE_STRIPE_PUBLISHABLE_KEY and VITE_SENTRY_DSN were left unset; none of them is read at build time, and the Sentry Vite plugin disables itself without SENTRY_AUTH_TOKEN. The bundle's string content does not depend on them."
  - "The optional real-browser render check was skipped: ThemeToggle renders only on hospitality's authenticated shell, which needs Auth0 credentials this stage does not have. Graded through component tests plus the built-bundle wiring check instead (see Not verified)."
  - "Turbo replayed cached results for tasks whose inputs this branch did not change (lint 5/52 cached, typecheck 22/52 cached). The rialto, hospitality and config lint/typecheck tasks were all cache misses, i.e. executed fresh at this head."
---

# Verification: conditional string literals no longer bypass localization

## Summary

Branch head verified: `591a7ecaf` (not merged, not deployed). **14 of 14 criteria
PASS, 0 FAIL.** The capture reproduction now exits 1 with one
`mbe-local/no-literal-ui-strings` error per shape in both packages; the re-scan
finds zero JSX conditional literals; the built hospitality `rialto-vendor` chunk
reads the ThemeToggle name from `messages` and carries the es-MX/fr-CA values;
every gate is green and every rialto locale bundle is under 2.2 kB. Every
command below was re-run by this stage, not copied from Implement's Notes.

## Criteria & evidence

### Defect 3 / regression test — the lint rule sees literals inside conditionals

- Check: the capture fixture (`{a ? "Open" : "Closed"}`, `aria-label={a ? "x" : "y"}`,
  `{a && "Saved"}`) piped through
  `pnpm exec eslint --stdin --stdin-filename src/__fixture.tsx` in each package;
  the bare-literal control alongside it.
- Evidence (`apps/hospitality`; `packages/rialto` output is identical):
  ```
  == apps/hospitality fixture
  .../apps/hospitality/src/__fixture.tsx
    3:10  error  Hardcoded "aria-label" text. Render it through the locale's messages (t() in apps, useRialtoLocale() in rialto)  mbe-local/no-literal-ui-strings
    4:7   error  Hardcoded UI text. Render it through the locale's messages (t() in apps, useRialtoLocale() in rialto)            mbe-local/no-literal-ui-strings
    5:7   error  Hardcoded UI text. Render it through the locale's messages (t() in apps, useRialtoLocale() in rialto)            mbe-local/no-literal-ui-strings
  ✖ 3 problems (3 errors, 0 warnings)
  exit=1
  == packages/rialto fixture
    3:10  error  Hardcoded "aria-label" text. ...  mbe-local/no-literal-ui-strings
    4:7   error  Hardcoded UI text. ...            mbe-local/no-literal-ui-strings
    5:7   error  Hardcoded UI text. ...            mbe-local/no-literal-ui-strings
  ✖ 3 problems (3 errors, 0 warnings)
  exit=1
  == (both) control: exit=1, 2 errors at 2:15 and 2:30 — unchanged from capture
  ```
  Capture recorded **exit 0, no output** for the same fixture in both packages.
- Result: PASS

### Work item 1 — Lint rule RED then GREEN

- Check: (a) RuleTester suite in `packages/config`; (b) the rule at HEAD run over
  the `origin/main` version of each of the 6 re-scan files (stdin), then over the
  HEAD version — this re-creates the item's RED/GREEN without checking out old code.
- Evidence:
  ```
  packages/config:  Test Files  7 passed (7)   Tests  104 passed (104)

  == origin/main:packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx
    28:9   error  Hardcoded "aria-label" text. ...  mbe-local/no-literal-ui-strings
  == origin/main:packages/rialto/src/components/Form/Form.tsx
    86:19  error  Hardcoded UI text. ...  mbe-local/no-literal-ui-strings
  == origin/main:packages/rialto/src/components/TapeChart/TapeChartStatPills.tsx
    34:15  error  Hardcoded UI text. ...  mbe-local/no-literal-ui-strings
  == origin/main:packages/rialto/src/components/TapeChart/TapeChartMobileStack.tsx
    83:17  error  Hardcoded UI text. ...  mbe-local/no-literal-ui-strings
  == origin/main:packages/rialto/src/components/DataTable/DataTable.tsx
    405:29  error  Hardcoded UI text. ...  mbe-local/no-literal-ui-strings
  == origin/main:apps/hospitality/src/components/DashboardLayout.tsx
    365:18  error  Hardcoded UI text. ...  mbe-local/no-literal-ui-strings
  ```
  At HEAD each of the six files reports no `no-literal-ui-strings` error (three
  carry one pre-existing warning from another rule: `✖ 1 problem (0 errors, 1 warning)`).
  The new RuleTester cases cover a ternary child, a ternary `aria-label`, `&&`,
  `||`, `??`, a parenthesized branch, a nested ternary, template-literal branches
  in a child and in `title`; valid cases cover letterless branches, `t()` /
  `messages.x` branches, `variant={a ? "primary" : "ghost"}` and a `&&` left operand.
- Result: PASS

### Defect 1 — ThemeToggle accessible name live in production (work item 2)

- Check: component tests; source diff; built hospitality bundle.
- Evidence (tests):
  ```
  ✓ ThemeToggle > rendering > has aria-label indicating switch to dark mode when in light theme
  ✓ ThemeToggle > rendering > has aria-label indicating switch to light mode when in dark theme
  ✓ navigation-data-locale.test.tsx > ThemeToggle accessible name follows the locale > es-MX names both toggle directions
  ✓ navigation-data-locale.test.tsx > ThemeToggle accessible name follows the locale > fr-CA names both toggle directions
  ```
  Source: `aria-label={isDark ? messages.switchToLightMode : messages.switchToDarkMode}`
  with `const { messages } = useRialtoLocale();`; es-MX `"Cambiar a modo claro"` /
  `"Cambiar a modo oscuro"`, fr-CA `"Passer au mode clair"` / `"Passer au mode sombre"`;
  en-GB is `{ ...enUS }`.
- Evidence (bundle): `pnpm --dir apps/hospitality build` → `build exit=0`,
  `dist/assets/rialto-vendor-Cu8h-_Rz.js 284.33 kB`. In that chunk:
  ```
  Switch to dark mode: 1        Switch to light mode: 1
  Cambiar a modo oscuro: 1      Passer au mode sombre: 1
  "aria-label":r?i.switchToLightMode:i.switchToDarkMode
  ,switchToLightMode:`Switch to light mode`,switchToDarkMode:`Switch to dark mode`,fieldsNeedAttention:e=>...
  switchToLightMode:`Cambiar a modo claro`,switchToDarkMode:`Cambiar a modo osc...
  switchToLightMode:`Passer au mode clair`,switchToDarkMode:`Passer au mode som...
  ```
  The one remaining occurrence of each English string is the en-US dictionary
  value; the component reads `i.switchToLightMode`/`i.switchToDarkMode`. Production
  had `"aria-label":r?`Switch to light mode`:`Switch to dark mode`` (defect.md).
  The es-MX and fr-CA dictionaries are bundled into the same `rialto-vendor` chunk
  in this build rather than separate locale chunks.
- Note for Operate: the brief's minimum signal ("bundle no longer contains
  'Switch to dark mode'") will **not** be met literally — the string stays as the
  en-US message value. The meaningful check is the absence of the hardcoded
  ternary, as above.
- Result: PASS

### Defect 2 — five more rialto components render English (work items 3–6)

- Check: locale tests per component.
- Evidence:
  ```
  ✓ Form error summary localization > es-MX summarizes 1 error(s)
  ✓ Form error summary localization > es-MX summarizes 3 error(s)
  ✓ Form error summary localization > fr-CA summarizes 1 error(s)
  ✓ Form error summary localization > fr-CA summarizes 3 error(s)
  ✓ TapeChart reservation counts follow the locale > es-MX stat pill
  ✓ TapeChart reservation counts follow the locale > fr-CA stat pill
  ✓ TapeChart reservation counts follow the locale > es-MX mobile day-card meta
  ✓ TapeChart reservation counts follow the locale > fr-CA mobile day-card meta
  ✓ TapeChart reservation counts follow the locale > keeps the en-US wording and casing with no provider
  ✓ TapeChart default strings come from the locale > es-MX labels with no strings prop
  ✓ TapeChart default strings come from the locale > fr-CA labels with no strings prop
  ✓ TapeChart default strings come from the locale > a consumer's strings prop still wins over the locale
  ✓ TapeChart default strings come from the locale > keeps en-US output with no provider
  ✓ defaultStrings.test.ts — 25 tests (DEFAULT_STRINGS / mergeStrings), all ✓
  ✓ announcements and fallbacks built in a conditional localize > DataTable row checkbox fallback name in en-US / es-MX / fr-CA
  ✓ announcements and fallbacks built in a conditional localize > PinInput completion announcement in en-US / es-MX / fr-CA
  ✓ useChatStream > falls back to the es-MX no-reason denial text
  ✓ useChatStream > falls back to the fr-CA no-reason denial text
  ```
  Bundle wiring for ChatPanel/DataTable: `.reason??n.notAllowed`;
  `notAllowed:`Not allowed``, `selectThisRow:`Select row`` (en-US values),
  `d:`No permitido``, `d:`Non autorisé``.
- Result: PASS (Form, TapeChart counts, TapeChart defaults, DataTable, PinInput, ChatPanel)

### Work item 7 — TextArea and Combobox announcements (Owner-widened scope)

- Evidence:
  ```
  ✓ ... > TextArea over-limit counter announcement in en-US / es-MX / fr-CA
  ✓ ... > TextArea within-limit counter announcement in en-US / es-MX / fr-CA
  ✓ ... > Combobox result-count announcement in en-US for 1 / for 2
  ✓ ... > Combobox result-count announcement in es-MX for 1 / for 2
  ✓ ... > Combobox result-count announcement in fr-CA for 1 / for 2
  ```
- Result: PASS

### Work item 8 — Hospitality "Ctrl" key hint

- Evidence:
  ```
  ✓ src/components/DashboardLayout.test.tsx > DashboardLayout > reads the non-Mac command-palette modifier from the catalog
  > node scripts/check-i18n-catalogs.mjs
  PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
  ```
  HEAD `DashboardLayout.tsx` lints with no `no-literal-ui-strings` error (above).
  `pnpm lint` (both packages included, cache miss) exit 0.
- Result: PASS

### Work item 9 — `packages/rialto/CLAUDE.md` claim

- Check: read the diff against the code verified above.
- Evidence: the Lint rule bullet now reads "It only sees JSX: text children and
  the UI attributes it guards … including a literal that reaches them through a
  ternary or a `&&` / `||` / `??` right operand. A literal held in a variable,
  object property or return value is out of its sight …". This matches the rule
  diff (`ConditionalExpression` → consequent/alternate, `LogicalExpression` →
  right) and the fixture results. The two previously surfaced announcements
  (TextArea, Combobox) are fixed (item 7), so the "Every string rialto renders on
  its own … comes from one typed dictionary" claim is not contradicted by any
  finding of the re-scan below.
- Result: PASS

### Re-scan — zero JSX conditional literals remain

- Check: `node scratchpad/loc-capture/scan.mjs <repo> apps/hospitality/src packages/rialto/src`.
- Evidence:
  ```
  total 226
  L lines: 0          (capture baseline: total 214, L: 10)
  ```
  Of the 226 "other"-context hits, 32 are new and all sit in
  `packages/rialto/src/i18n/` (the per-locale plural branches inside message
  functions — expected). The rialto non-i18n residue is all tokens, roles, ids
  and CSS (`"true"`, `"page"`, `"light"`, `"dark"`, `` `${width}px` ``,
  `"progressbar"`, `"ltr"`, …) — no English prose. Hospitality's residual
  non-JSX English, **out of scope and untriaged**, exactly as capture listed it:
  ```
  apps/hospitality/src/hooks/use-command-palette.ts:24  ??  ReturnStatement  "Navigation"
  apps/hospitality/src/hooks/use-form-state.ts:37      ??  CallExpression   "Validation failed"
  apps/hospitality/src/utils/calendarLinks.ts:18       ?:  ReturnStatement  `${partyLine} Cancel or modify: ${cancellationUrl}`
  apps/hospitality/src/utils/ics.ts:115                ?:  ReturnStatement  `${partyLine} Cancel or modify: ${cancellationUrl}`
  apps/hospitality/src/utils/venueOpenLabel.ts:34-35   ?:  ReturnStatement  `Closed, opens at …` / `Closed, opens <weekday> at …`
  ```
- Result: PASS (in-scope); residuals recorded for Review/Ship to seed.

### Work item 10 — Release hygiene

- Evidence:
  ```
  pnpm lint                         exit=0  Tasks: 52 successful, 52 total; 0 lines matching no-literal-ui-strings
  pnpm typecheck                    exit=0  Tasks: 52 successful, 52 total
  pnpm --dir packages/config test   exit=0  Test Files 7 passed (7)     Tests 104 passed (104)
  pnpm --dir packages/rialto test   exit=0  Test Files 173 passed (173) Tests 2717 passed (2717)
  pnpm --dir apps/hospitality test  exit=0  Test Files 231 passed (231) Tests 3045 passed (3045)
  pnpm check:i18n-catalogs          exit=0  PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
  pnpm --dir packages/rialto exec size-limit  exit=0
    Locale en-GB (subpath)  Size limit: 2.2 kB  Size: 114 B   brotlied
    Locale es-MX (subpath)  Size limit: 2.2 kB  Size: 1.89 kB brotlied
    Locale fr-CA (subpath)  Size limit: 2.2 kB  Size: 2 kB    brotlied
  ```
  `.changeset/localization-conditional-literals.md`: `"@mattbutlerengineering/rialto": patch`,
  stating the 1.5 → 2.2 kB budget reason. fr-CA has ~0.2 kB headroom left.
- Result: PASS

## Failures

None.

## Not verified

- **Real-browser render** of a translated ThemeToggle name: skipped. The toggle
  renders only on hospitality's authenticated shell (Auth0 credentials not
  available to this stage). Covered instead by the jsdom locale tests and by the
  built-bundle check that the component reads `messages.*` and the translated
  values ship in the same chunk.
- **Production**: the branch is not merged or deployed; the live
  `rialto-vendor-vaLYernM.js` still carries the hardcoded ternary until the
  Owner merges. Post-deploy confirmation belongs to Operate.
- **`local-ci-precheck` steps** (frozen install, check-adr, check-deps, dep-graph,
  `pnpm regen --check`) were not re-run here; they are the Implement and Ship
  stage hooks (Implement recorded them clean in defect.md Notes; Ship re-runs
  them against the final head).
- **Non-JSX literal positions** are by design outside the lint rule; their
  absence in rialto is shown only by the scan at this head, not by a gate.
- **E2E locale sweep** catalog-only detection remains unchanged (out of scope;
  a seed candidate per defect.md Notes).
