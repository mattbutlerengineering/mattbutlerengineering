---
stage: review
run: feature:localization
date: 2026-10-18
verdict: no critical findings; 3 majors open for the Owner's fix-or-defer answer; 6 minors deferred
assumptions:
  - "Reviewed the change as merged. The 26 commits in the brief were each confirmed as ancestors of origin/main d5afd3ab4 with `git merge-base --is-ancestor`. A `git log` over the run's core paths (i18n/, LocalePicker, locale-sweep.spec.ts, check-i18n-catalogs.mjs, local-rules.js, format.ts, useVenueFormat.ts, main.tsx) found two more commits: #6975 546d1d44b and #6976 53e882fdd (ChangeBookingDialog, mbe-feature-drain). They are reviewed only where they touch catalogs. They are another run's feature, not this one's."
  - "Code was read at this branch's head 7150c5fac (base 482ed0bc6). Per verification.md, the only non-docs difference from origin/main d5afd3ab4 is #7051 (PageHeader CSS), which touches no i18n code."
  - "Severity follows consequence (references/adr-compliance.md § Report). An untranslated aria-label on one control is ranked major, not critical: it breaks a PRD success criterion in production, but loses no data, exposes nothing and blocks no task. Critical is reserved for a security, data or money defect, and none was found."
  - "Minors are deferred under the skill's default ('Minors … may be deferred freely'). Each one carries backlog-seed text inside this artifact. Per the brief, nothing was appended to docs/backlog.md and no issue was filed."
  - "docs/standards.json does not exist in this repo. The plugin's own index (4 statements, domains factory/pipeline/eval) has no statement about this diff's subject, so no finding cites a standard."
  - "adr_status.py reports every ADR here with standing `unrecognized`. Each has the raw status 'active', so all are treated as live, per references/adr-compliance.md."
  - "The repo's specialist reviewers (e2e-selector-drift-reviewer, rialto-prop-drift-detector, stripe-flow-reviewer, dependency-update-reviewer) were not dispatched, as the brief instructs. Their checklists were applied by hand in the passes below."
---

# Review: Localization — Phase 1 (foundation + hospitality)

## Scope

The diff is the 26 run commits, from #6591 `5c53ebf86` to #7016 `babc45120`: 331 distinct paths (`git show --name-only` over each SHA). Per-commit sizes range from 1 file (#6734) to 55 files and 2,777 insertions (#6591). There are about 25,000 changed lines in all, most of them catalog JSON.

**Read in full:**

- `apps/hospitality/src/i18n/runtime.tsx` and `locales.ts`; `default-t.ts`
- `components/booking-widget/{WidgetLocaleScope,WidgetLocalePicker,ToastLocaleOverride}.tsx`
- `components/LocalePicker/{LocalePicker.tsx,machine-translation-tags.ts}`
- `hooks/useVenueFormat.ts` and `utils/format.ts`; `hooks/useCancellationQuote.ts`
- `packages/rialto/src/i18n/RialtoLocaleProvider.tsx` and `locales/*`
- The `no-literal-ui-strings` rule in `packages/config/eslint/local-rules.js:127-194`
- The `#6706` deposit diff: `StaffDepositSection.tsx`, `services/reservations/src/routes/deposits.ts`, `services/venue.ts`, `packages/types/src/schemas/reservation-requests.ts`
- The dependency diff in `#6685`

**Sampled:**

- `e2e/locale-sweep.spec.ts`: lines 100-250 (the detection logic) plus every locator line found by grep.
- The `useRialtoLocale()` call sites in all 46 rialto components, by grep. ConfirmDialog, Calendar and RialtoProvider were read for precedence.
- The three `<Trans>` call sites.
- The head of `scripts/check-i18n-catalogs.mjs`.
- `apps/hospitality/CLAUDE.md` and `packages/rialto/CLAUDE.md` § Localization.

**Not read line by line:**

- The translated catalog values (~1,236 keys each in es-MX and fr-CA). Their structure was checked by script instead (see Security).
- The per-surface translation diffs (#6703, #6708, #6711, #6728, #6730, #6735, #6739, #7016). These were covered by an AST sweep of the whole of `apps/hospitality/src` and `packages/rialto/src` for literal UI text the lint rule cannot see.

**Commands run in this worktree:**

| Command                                                                                                           | Outcome                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir packages/rialto exec size-limit`                                                                      | exit 0. Locale en-GB 118 B, es-MX 1.28 kB, fr-CA 1.36 kB (limit 1.5 kB each). Dialog 1.13/1.45 kB, Select 2.11/2.25 kB, Button 798/900 B |
| `npx vite build` in `apps/hospitality`                                                                            | exit 0. `es-MX-DMGesuRt.js 51.84 kB │ gzip 16.31 kB`, `fr-CA-BIoB24kY.js 55.26 kB │ gzip 16.73 kB`, `en-GB-DOwCrGXH.js 0.07 kB`          |
| `pnpm --dir apps/hospitality size:check`                                                                          | Hospitality App (JS) 33.15 kB / 500 kB. Rialto Vendor 75.65 kB / 88 kB                                                                   |
| `pnpm --dir packages/rialto typecheck`                                                                            | exit 0 (all three tsconfigs)                                                                                                             |
| `npx eslint --stdin` fixture with ternary / `&&` literals (below)                                                 | exit 0. The conditional literals were not flagged                                                                                        |
| AST scan (`scratchpad/loc-review/jsx-cond-scan.mjs`, TypeScript compiler API)                                     | 9 conditional-branch literals with letters in non-test `.tsx` under `apps/hospitality/src` and `packages/rialto/src`                     |
| `curl` of the production `/hospitality/` index and its `rialto-vendor-BrEE8F5T.js`                                | `1 Switch to dark mode`, `1 Switch to light mode`. ``popover:`Ventana emergente` `` is present in the same eager chunk                   |
| Node probe of react-i18next 17.0.16 `<Trans>` with `escapeValue: false` (`scratchpad/loc-review/trans-probe.mjs`) | No HTML injection. See Security                                                                                                          |
| Catalog tag-parity script (`<tag>` sets per key, en-US vs each locale)                                            | `es-MX tag mismatches 0`, `fr-CA tag mismatches 0`, `en-GB tag mismatches 0`                                                             |
| `adr_status.py .`                                                                                                 | 28 ADRs, all status `active`                                                                                                             |

Scratch output lives outside the repo, in `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/9f059937-a91e-47c7-ae4e-a488cb7e8818/scratchpad/loc-review/`. The `apps/hospitality/dist` build is gitignored, and `git status --porcelain` stayed empty.

## Findings

### Major: English accessible name on the theme toggle on every authenticated hospitality route, in every locale — live in production

- **Scenario:** A staff member opens any gated route in es-MX or fr-CA. A screen reader announces the GlobalNav theme button as "Switch to light mode" (or "Switch to dark mode"), in English.
  - `packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx:28`: `aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}`
  - It is rendered by `GlobalNav.tsx:94`, which hospitality mounts in `apps/hospitality/src/App.tsx:101-110` with `theme` and `onThemeToggle` set.
  - Production's `rialto-vendor-BrEE8F5T.js` contains both strings, and neither appears in `RialtoMessages` or any hospitality catalog.
- **Contract broken:**
  - PRD criterion 1: no untranslated UI text, and the sweep's own rule covers `aria-label`.
  - PRD criterion 5: rialto built-in text in all 4 locales.
  - `packages/rialto/CLAUDE.md:198`: "Every string rialto renders on its own (accessible names …) comes from one typed dictionary".
- **Why the gates missed it:**
  - The lint rule only flags a bare literal (see the third major).
  - The sweep only forbids values that exist in the en-US catalog or the Rialto messages (`locale-sweep.spec.ts:110-145`). A string that never entered a catalog is invisible to it.
  - verification.md's criterion 5 PASS rests on "lint has 0 errors", so it is contradicted here.
- **Fix:** add `switchToLightMode` / `switchToDarkMode` to `RialtoMessages` and all three locale modules, read them in ThemeToggle, and add a patch changeset.
- **Standard:** none
- **Decision:** **open — awaiting the Owner's fix-or-defer answer.**

### Major: rialto still renders built-in English in five more components (PRD criterion 5 unmet for rialto consumers)

- **Scenario:** A consumer wraps rialto in `RialtoProvider locale="fr-CA" messages={frCA}` and still sees or hears English:
  - **Form:** error summary "1 field needs attention" / "`${n}` fields need attention" (`Form/Form.tsx:86-88`, a `role="alert"` region).
  - **TapeChart:**
    - "Reservation(s)" stat pill (`TapeChart/TapeChartStatPills.tsx:34`)
    - "reservation(s)" day-card meta (`TapeChartMobileStack.tsx:83`). Neither is overridable by the component's `strings` prop.
    - All `defaultStrings.ts` labels ("Tentative", "Double-booked", "`${n} nights`" …), which are English unless the consumer passes `strings`.
  - **DataTable:** row-selection label falls back to "Select row" (`DataTable/DataTable.tsx:405`), even though `messages.selectRow` exists (`messages.ts:240`).
  - **PinInput:** live-region announcement "Code complete" (`PinInput/PinInput.tsx:189,250`).
  - **ChatPanel:** a denial with no server `reason` renders `t.toolBlocked("Not allowed")` (`ChatPanel/useChatStream.ts:139`, rendered at `ChatPanel.tsx:104`). This one is reachable in hospitality's `/chat`.
- **Hospitality exposure:** apart from ChatPanel's fallback, hospitality does not render these components (grep of `apps/hospitality/src` for `DataTable|<Form|PinInput|TapeChart`: no non-test hit). So the exposure is to rialto's npm consumers and to the PRD/CLAUDE.md claim.
- **Fix:** move each string into `RialtoMessages`. For TapeChart, default `strings` from the context.
- **Standard:** none
- **Decision:** **open — awaiting the Owner's fix-or-defer answer.** Could be split: fix ThemeToggle with the finding above, and defer the rest as a rialto follow-up.

### Major: neither CI gate can catch a hardcoded string inside a conditional or logical expression (PRD criterion 7 holds only for bare literals)

- **Scenario:** A contributor adds `<span>{a ? "Open" : "Closed"}</span>`, `aria-label={a ? "Expand" : "Collapse"}`, or `{a && "Saved"}` to any `src/**` file in hospitality or rialto. Lint passes and the sweep passes.
- **Lint evidence:**
  - `isTextual` (`local-rules.js:166-174`) accepts only a `Literal` or `TemplateLiteral` as the whole expression.
  - Measured: `npx eslint --stdin --stdin-filename src/components/ReviewFixture.tsx` on exactly those three shapes reported only the bare `x` text and the bare template literal. Exit 0, with no error for any conditional branch.
- **Sweep evidence:** the sweep cannot catch it either, because it only matches strings already present in a catalog.
- **This is the root cause of both majors above.** The AST scan finds 9 such literals on main today:
  - 6 are the strings above
  - "Select row" and "1 field needs attention", also above
  - `DashboardLayout.tsx:364` `"Ctrl"`, a key name, which is acceptable
- **Contract decayed:**
  - PRD criterion 7 is graded PASS in verification.md, using a bare-literal fixture only.
  - architecture.md § Literal-UI-string lint rule lists only plain objects as a "Known limit".
- **Fix:** make `isTextual` recurse through `ConditionalExpression` consequent/alternate, `LogicalExpression` right operands and `ParenthesizedExpression`, and add RuleTester cases for each shape. The existing hits then fail until they are fixed.
- **Standard:** none
- **Decision:** **open — awaiting the Owner's fix-or-defer answer.**

### Minor: rialto locale dictionaries ship in the eager `rialto-vendor` chunk, not lazily

- **Scenario:**
  - `runtime.tsx:44-48` dynamic-imports `@mattbutlerengineering/rialto/locales/<tag>`.
  - `vite.manualChunks.ts` routes every id containing `/packages/rialto/` to `rialto-vendor`, which `index.html` modulepreloads. So every visitor, en-US included, downloads all three dictionaries (about 2.8 kB brotli: 118 B + 1.28 kB + 1.36 kB).
  - The "lazy" import then resolves from a chunk that is already loaded.
- **Evidence:** the local build has `Ventana emergente` in `rialto-vendor-G9rFcXUH.js` and 0 hits in `es-MX-DMGesuRt.js`. Production `rialto-vendor-BrEE8F5T.js` contains ``popover:`Ventana emergente` ``.
- **Contract decayed:** architecture.md § i18n runtime ("Other catalogs loaded by `loadCatalog`"). The app-side chunks behave as designed: es-MX and fr-CA are separate, lazy chunks of about 16 kB gzip each.
- **Note:** fr-CA is at 1.36/1.5 kB, so about 140 B of headroom is left for new keys.
- **Standard:** none
- **Decision:** deferred (skill default for minors). The cost is under 4% of the rialto-vendor chunk.
- **Backlog seed:** "vite.manualChunks routes `/packages/rialto/` (including `src/i18n/locales/*`) into the eager rialto-vendor chunk, so the three Rialto locale dictionaries are downloaded by every hospitality visitor. Exclude `/packages/rialto/src/i18n/locales/` (and the dist equivalent) from the rialto-vendor rule so the dynamic import gets its own chunk."

### Minor: implementation deviates from architecture.md in three undocumented ways

- **Widget instance:** architecture.md and breakdown item "Widget locale scope" both say `i18n.cloneInstance()`. `WidgetLocaleScope.tsx:19-25` builds a second independent instance through `createLocaleRuntime`.
  - architecture.md rejected "a second independent instance" because it "duplicates init/config". The shared factory avoids that duplication, so the deviation is sound, but it is not recorded.
- **Invalid venue zone:** the contract says "falls back to device zone and reports to Sentry once". `utils/format.ts:15-17` reports with `console.warn`, and no console-capture integration exists (`grep captureConsole` over `packages/sentry/src` and `apps/hospitality/src`: no hits). So bad venue data is invisible in production.
- **Money with no venue:** the contract says "money disallowed (throws in dev)". `useVenueFormat.ts:43` formats in USD (`NO_VENUE`). The code comment justifies it as matching pre-localization behaviour.
- **Fix:** append a dated Notes line to breakdown.md for each (an artifact edit). For the zone, send the report through the app's Sentry client.
- **Standard:** none
- **Decision:** deferred (skill default).
- **Backlog seed:** "format.ts resolveTimeZone reports invalid venue IANA zones via console.warn only; architecture.md promised a once-per-zone Sentry report. Route `defaultReport` through the hospitality Sentry client."

### Minor: #6706 changed two API contracts that architecture.md says Phase 1 does not change

- **Contract decayed:** architecture.md § Data model: "No database or API change in Phase 1."
- **What #6706 changed:**
  - `POST /api/v1/deposits` lost its `currency` default `"usd"` and now answers **400** when the body currency differs from the venue's (`services/reservations/src/routes/deposits.ts`, 29 lines changed per `git show --stat`).
  - Venue create/update now rejects any `currencyCode` that is not `/^[A-Za-z]{3}$/` (`packages/types/src/schemas/reservation-requests.ts`).
- **Assessment:**
  - Both changes are correctness improvements (server-owned currency, the same rule as `public-deposits.ts`), and hospitality is the only client.
  - Neither appears in breakdown.md's Notes or in architecture.md's "Accepted behaviour changes".
  - The 400's `detail` is English server text shown in localized UI through `describeApiError`. That is Phase 2's server-copy scope.
- **Standard:** none
- **Decision:** deferred (skill default). The change is safe, and the record is what is missing.
- **Backlog seed:** "Record in the localization run's artifacts (or a reservations-service changelog) that #6706 made deposit currency server-owned (400 on mismatch, no 'usd' default) and tightened venue currencyCode to 3 letters."

### Minor: locale picker endonyms carry no `lang` attribute (WCAG 2.2 SC 3.1.2 Language of Parts, AA)

- **Scenario:** An es-MX screen-reader user opens the sidebar or compact picker. "Français (Canada)", "English (US)" and the MT tags "Traducción autom." / "Traduction autom." are read with the Spanish voice.
  - `LocalePicker.tsx:88-101`: the item `Text` spans have no `lang`.
  - The trigger already does it right: `lang={current}` at lines 76 and 81.
  - The settings `Select` options (line 60) are plain strings and cannot carry `lang` at all.
- **Standard:** none
- **Decision:** deferred (skill default).
- **Backlog seed:** "LocalePicker menu items: set `lang={l.tag}` on each endonym and MT tag span; for the settings Select, render options with a lang-capable label or document the gap."

### Minor: `<Trans>` with `escapeValue: false` re-parses user-entered guest names as markup (display corruption, no injection)

- **Scenario:** `runtime.tsx:109` sets `escapeValue: false`, and `CancelReservationDialog.tsx:95` and `MarkNoShowDialog.tsx:87` interpolate the guest's `displayName` into a `<strong>{{name}}</strong>` template. The name is entered by the public on the booking form. Measured with react-i18next 17.0.16:
  - `"<0>hi</0>"` renders as `<strong>hi</strong>` (the brackets disappear).
  - `"Jo</strong><em>x"` renders as `<strong>Jo</strong>&lt;em&gt;x` (the name is split).
  - `"<img src=x onerror=alert(1)>"` renders as escaped text.
  - `"Bob <3"` and `"A & B"` render correctly.
- **Impact:** only staff's confirmation copy for an adversarial name is affected.
- **Standard:** none
- **Decision:** deferred (skill default).
- **Backlog seed:** "Cancel/no-show dialogs: pass the guest name to `<Trans>` as a component child (e.g. `components={{ strong: <strong>{displayName}</strong> }}` with an empty `<strong></strong>` in the catalog) instead of a `{{name}}` value, so markup-like names render verbatim."

### Minor: `lean:` marker without ceiling or trigger, and a duplicated `defaultT`

- **`apps/hospitality/src/i18n/runtime.tsx:141`:** the marker reads `// lean: boot failure is silent and stays en-US; …`. It names neither a ceiling nor the trigger that should end the leanness. The skill rule says a `lean:` marker with no trigger is a finding.
  - A silent boot failure is also unobservable: a broken es-MX chunk would put every Spanish-browser user in English with no signal.
- **`apps/hospitality/src/nav-sections.ts:39`:** `reuse`. `const defaultT = (): TFunction => localeRuntime.i18n.t` duplicates `src/i18n/default-t.ts:9`.
  - Both yield the dashboard runtime's `t`. `apps/hospitality/CLAUDE.md` names `default-t.ts` as the one helper.
  - Replace it with an import of `defaultT` from `./i18n/default-t.js`.
- **Standard:** none
- **Decision:** deferred (skill default).
- **Backlog seed:** "runtime.tsx bootLocale: give the `lean:` marker a trigger (e.g. 'until a non-en-US Sentry event shows boot failures') or report boot load failures once to Sentry; nav-sections.ts: import defaultT from i18n/default-t.ts."

## Passes with no findings

- **Correctness (beyond the findings):**
  - `resolveLocale` is total and per-entry ordered (breakdown note 2026-10-13).
  - `apply()` caches only after both loads succeed, so a timeout leaves language, storage and `lang` unchanged.
  - `changeLocale` persists only after the switch. A refused write still applies for the session.
  - `LocalePicker` guards re-entry with `pending`. Two separate pickers on the same runtime can race, but whichever finishes last sets both language and storage, so they stay consistent.
  - `WidgetLocaleScope` boots once per scope and renders nothing before boot only for a non-en-US target. The worst case is a 10 s blank, then en-US.
  - `useCancellationQuote` writes the audit note in en-US, and the dialog label follows the dashboard locale on re-render.
  - `majorToMinorUnits` rounds to integers per the currency exponent.
- **Security:**
  - No `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML` or `document.write` in `apps/hospitality/src` or `packages/rialto/src` (grep: no hits).
  - React escapes all `t()` output.
  - `<Trans>` never produced live HTML in the probe (the minor above is display only).
  - Catalogs hold only `<strong>` and `<phoneLink>` tags, with identical sets in every locale.
  - `tel:${phone}` takes the venue's configured phone.
  - The deposit route now ignores a client-chosen currency.
  - No secrets found.
- **Complexity:** no cuts beyond the minor above. The two-mechanism split (i18next in the app, a typed dictionary in rialto) is ADR-028's, not over-building.
  - `ToastLocaleOverride`'s module-level store is unusual. It is documented and has a single writer.
  - Shape concerns for `deepen`: none raised.
- **ADR compliance:** the ADRs whose subject this diff reaches were read in full: ADR-001, ADR-024, ADR-025 and ADR-028.
  - **ADR-028 is met:**
    - `RialtoMessages` is typed, and es-MX/fr-CA each define all 88 keys with no spread.
    - The `./locales/{en-GB,es-MX,fr-CA}` subpaths exist with size-limit entries.
    - `useRialtoLocale()` never throws, and with no provider returns `{ locale: undefined, messages: enUS }`.
    - Precedence is prop → context → default (ConfirmDialog, Calendar `localeProp ?? contextLocale`).
    - `RialtoProvider` composes the provider only when a prop is set (`RialtoProvider.tsx:75`).
    - Rialto peers are unchanged.
  - **ADR-025:** the no-throw pattern is followed.
  - **ADR-001:** Rialto primitives and CSS Modules are used, with no Tailwind.
  - **ADR-024:** unaffected.
  - **Out of scope:** the other 24 ADRs (API errors, auth, edge routing, health, agents, merge policy, RLS, jobs, batching).
  - **No violations.**
- **Accessibility (beyond the minor):**
  - `<html lang>` follows the dashboard runtime, and guest scopes mark their subtree with `lang` (`WidgetLocaleScope.tsx:45`).
  - The picker error is `role="alert"`, the root shows `aria-busy` while pending, and the collapsed trigger keeps a translated accessible name.
  - #6740 relabels the single toast live region in the guest locale without mounting a second one.
- **Performance:**
  - App catalogs are lazy (es-MX/fr-CA about 16 kB gzip each), and the en-US catalog is in the entry bundle by design.
  - All hospitality and rialto size budgets pass (table above).
- **E2E selector drift (checklist applied by hand to `locale-sweep.spec.ts`):**
  - `getByRole("option").first()` (lines 362/364) is intentional first-match.
  - Other locators are role and name scoped, and the names come from the catalog via `label(locale, key)`, so they are not volatile copy.
  - Every route asserts `unmocked` is empty, so there is no stateful-mock gap.
  - CI run 39144888634 is green.
  - Known limit, not a finding: the overflow rule measures horizontal clipping only.
- **Rialto prop drift:** `pnpm --dir packages/rialto typecheck` passes all three projects, including tests and showcase. #6591's manifest and registry test edits match the two new `RialtoProvider` props.
- **Domain passes:**
  - **Payments** was selected (`deposits.ts`, `StaffDepositSection.tsx`, `PaymentStep.tsx`, `DepositExposureWidget.tsx`, `formatDepositCancellationTerms.ts`) and came back clean:
    - Amounts stay integer minor units (`Math.round(amount * 10 ** exponent)`), with zero- and three-decimal currencies handled.
    - Currency is now server-owned.
    - No webhook, idempotency or state-transition code was touched.
  - **Dependencies** was selected (#6685; #6591's addition of i18next/react-i18next) and came back clean:
    - `i18next 26.4.2 → 26.4.3`, `react-i18next 17.0.15 → 17.0.16` (exact pins, hospitality only), `@eslint-react/eslint-plugin ^5.26.0 → ^5.26.1` (packages/config).
    - All patch bumps, each resolved once in `pnpm-lock.yaml` (`i18next@26.4.3`, `react-i18next@17.0.16`).
    - The new dependencies are justified in architecture.md § Stack.
    - Rialto takes no i18n dependency.
  - **Migrations** was not selected: no migration, SQL or Prisma schema path in the diff.

## Verdict

**The run is released and needs no rollback. No critical finding and no live security, data or money defect was found.**

Three majors stay **open for the Owner's fix-or-defer answer** and are not decided here:

1. the English theme-toggle `aria-label` on every staff route (live)
2. the remaining English in five rialto components
3. the lint rule's blindness to conditional literals, which caused both of the others

Fixing (3) first makes (1) and (2) fail CI until they are translated.

The six minors are deferred, with seed text above. Ship may record the release. Its record should carry these three majors as open known defects against PRD criteria 1, 5 and 7, which verification.md graded PASS.
