---
stage: operate
run: feature:localization
date: 2026-11-07
users-observed: 0
signal-source: "none identifiable, read 2026-11-07. Sentry MCP (org mattbutlerengineering, project hospitality, 14d): search_errors `has:timestamp` returned 473 error events from 41 distinct users (458 Chrome, 15 HeadlessChrome), and `tags[locale]` and `culture.locale` are the empty string on all 473, so no es-MX, fr-CA or en-GB session can be separated from en-US; search_errors for i18n/i18next/locale/catalog/invalid-time-zone text over 30d returned no results; search_issues for the same terms returned no issues. No locale tag exists in the app (`grep -n 'locale' apps/hospitality/src/main.tsx` has no setTag), no Cloudflare analytics token (docs/backlog.md 'Locale instrumentation', 2026-10-22), and no booking, email or support record carries a locale. gh issue searches ('localization', 'es-MX', 'fr-CA', 'locale-sweep', 'no-literal-ui-strings', 'feature:localization', 'features/localization') found no issue from a person using a localized surface. `git log origin/main --since=2026-10-15` over apps/hospitality/src/i18n, packages/rialto/src/i18n, the locale sweep, scripts/check-i18n-catalogs.mjs and packages/config/eslint/local-rules.js shows follow-up fixes and later feature work, and no revert of the run."
assumptions:
  - "Population count: users-observed counts people who used a localized surface. The 41 Sentry users are people who hit any hospitality error in 14 days, not people who chose or were served es-MX, fr-CA or en-GB, because the events carry no locale. They are counted as nobody here, and the 41 is reported only as the ceiling of what instrumentation could see."
  - "Sentry search_errors takes a natural-language query that an agent translates. The first query (`all error events, last 14 days`) returned 0 events and was discarded as a mistranslation; the `has:timestamp` form returned 473/41 and is the one used. The 473/41 differs from the 235/38 the sibling retro read on 2026-11-03 over its own 14-day window, which ended four days earlier."
  - "Let it breathe: release.md records `released-at: 2026-10-15` for Phase 1, with three post-ship fixes through 2026-10-17. That is 23 days before this retro. The verify/review/ship record is PR #7080 (merged 2026-10-18T20:29:16Z). No `pending-merge:` to resolve."
  - "Open debt scope: the tracker mirror #6612-#6631 and #6737 are the run's own (created 2026-10-14/15, before or on the day of the merge, and the breakdown names #6612-#6631). #8036, #8089, #8105 and #8139 are not counted as the run's debt and not as feedback. They were filed 2026-11-01/02, after the release, and do not cite review.md or verification.md."
  - "Seed status: each carried-over review minor was re-checked against `origin/main` (c4320513d) before being re-seeded. The seeds below are the ones still true there. One (deploy-static path filter) is already fixed and is not re-seeded."
---

# Retro: Localization Phase 1 (foundation + hospitality; #6591 through #7016, record #7080)

## Outcomes vs. intent

The population is 0 (frontmatter), so every outcome's signal is `unobserved`. Each outcome below records state: what is deployed, what is on `main`, what CI shows. None of it records use. Verify's PASS is a CI and unit result, not a person.

### Success in one sentence (idea.md): all 4 apps run fully in en-US, en-GB, es-MX and fr-CA, and CI blocks any untranslated string

- What happened: not met as written, by design. The PRD scoped Phase 1 to the foundation plus hospitality, and marketing, rialto-web and gen are still en-US only (the PRD's Out of scope). Server-sent email, SMS and ICS were also out of scope. On the hospitality side, `release.md` records every merge reaching production through a `Deploy Hospitality` job success (26 PRs, `released-at: 2026-10-15`), and the catalogs and sweep are on `main`. The CI blocker holds for the shapes the lint rule sees. It did not hold for conditional literals until the sibling run (`docs/fixes/localization-conditional-literals/`, #7108, merged 2026-10-19) closed that, and it still does not see English reaching the UI through a variable, object property or return (that run's retro, seeds 2 and 3). English the gates missed has kept turning up on this surface since: #8036 (API error copy), #8089 ("Closed" / "Regular week" beside French), #8105 and #8139 (es-MX "a las 1:00"), all closed. They were found by other runs, not by a user of a localized surface.
- Signal strength: unobserved

### PRD 1: with each of en-GB, es-MX, fr-CA selected, every hospitality guest and staff screen shows no untranslated en-US UI text, checked by a per-locale automated test

- What happened: `apps/hospitality/e2e/locale-sweep.spec.ts` is on `main` and reads gated routes from `metrics/ui-quality-ledger.jsonl`, so a new gated route is swept when it lands. CI run 39144888634 (`Hospitality E2E`) passed 252 tests at Verify (`verification.md`). The sweep forbids only strings already in an en-US catalog or Rialto dictionary, so it cannot see a literal that never entered a catalog. Review's majors 1 and 2 (ThemeToggle `aria-label` and five rialto components) were exactly that, and both were live in production for es-MX and fr-CA between 2026-10-15 and the #7108 deploy. Whether any es-MX or fr-CA screen-reader user heard the English toggle is not known.
- Signal strength: unobserved

### PRD 2: browser-language detection (es-MX / fr-CA / en-GB open in that locale, unsupported opens en-US)

- What happened: `resolveLocale` and `bootLocale` are on `main` in `apps/hospitality/src/i18n/`. Verify's Playwright probe of the production guest error states (deploy run 39145301837) showed `es-AR`→es-MX, `fr-FR`→fr-CA and `de-DE`→en-US. That was Matt's probe, not a person arriving with a browser setting. Not shown: a found-venue booking flow in production (no public venue slug exists).
- Signal strength: unobserved

### PRD 3: the switcher updates the UI without losing form input and persists across reload

- What happened: `LocalePicker` and the staff switcher are on `main`. Verify observed the stored-choice-wins-after-reload half on the guest error states in production. The switcher itself was never rendered in production in Verify (the probed states render no picker, and the staff picker is behind Auth0). Later, #8108 (2026-11-02) renamed the compact picker so its accessible name contains its visible code, which shows the component is still being maintained. It does not show use.
- Signal strength: unobserved

### PRD 4: USD venue, en-GB viewer sees USD (not GBP, not converted) and venue-local time in en-GB format

- What happened: `useVenueFormat` and `utils/format.ts` are on `main` with unit evidence only. `verification.md` lists en-GB money and time in production under Not verified (needs a real venue). #6706 made deposit currency server-owned (400 on mismatch) and is deployed through `Deploy API Services` (run 38780345029, success).
- Signal strength: unobserved

### PRD 5: every rialto component with built-in text renders it in all 4 locales when the app sets the locale

- What happened: Verify graded PASS on lint evidence, and Review overturned it with three majors. The sibling run's PR #7108 then moved ThemeToggle, Form, TapeChart, DataTable, PinInput and ChatPanel strings into `RialtoMessages` (the sibling retro read the deployed chunk on 2026-11-03 and found `switchToLightMode` values in all three locales). Rialto 0.6.2 through 0.8.0 are versioned but unpublished, so no external consumer holds any of it: the registry serves 0.2.0 (`release.md` Release log 5; the backlog line about `RIALTO_PACKAGES_TOKEN`). Every consumer today is `workspace:*`.
- Signal strength: unobserved

### PRD 6: existing rialto tests and visual baselines pass with no locale set; no i18n library required of consumers

- What happened: ADR-028 shipped (typed dictionary, optional `RialtoLocaleProvider`, `useRialtoLocale()` that never throws). Review read it against ADR-028 and found no violation. Rialto peers are unchanged. There is no external consumer to be broken, so "does not break existing consumers" has been tested only by in-repo consumers' CI.
- Signal strength: unobserved

### PRD 7: a PR adding a hardcoded UI string, or an en-US key missing from es-MX/fr-CA, fails CI (deliberately failing fixture)

- What happened: two gates exist. The lint rule `mbe-local/no-literal-ui-strings` is an error across `src/**` in hospitality and rialto (`LOCALIZED_FILES` in both `eslint.config.js`), and `scripts/check-i18n-catalogs.mjs` runs inside `pnpm repo-audit` (`scripts/run-repo-audit.mjs:130`), which `ci.yml:445` calls in the Build chain. Verify's demonstration of criterion 7 used a bare-literal fixture only, so the PASS overstated the rule: ternary and `&&` literals passed lint (Review, measured). The rule was fixed in #7108. Whether either gate has ever failed a real contributor PR is not known from CI: the sibling run searched all 21 failed Lint jobs on `ci.yml` between 2026-10-19 and 2026-11-03 and found the rule in none. The one rejection found was local (#7303 / PR #7318, a rescued branch committed `--no-verify`).
- Signal strength: unobserved

### PRD 8: a visible notice says es-MX and fr-CA translations are machine-generated

- What happened: `machine-translation-tags.ts` and the picker's tags ("Traducción autom." / "Traduction autom.") are on `main`. Review found the tag spans carry no `lang` attribute, and that is still true on `origin/main` (`LocalePicker.tsx` sets `lang` only on the trigger's two spans, lines 80 and 85). No one is known to have seen the notice.
- Signal strength: unobserved

### PRD 9: no truncated or overflowing text in any locale at the supported widths

- What happened: the sweep's overflow rule runs at 375x812 and desktop and passed at Verify. Review's own note is that it measures horizontal clipping only. Floor-plan and tables screens in es-MX/fr-CA were never looked at by a person in this run.
- Signal strength: unobserved

## Open debt

The run's own debt. None of it counts as feedback.

- #6612 through #6631: the 20 tracker-mirror issues of the breakdown (19 work items plus tracking #6631). All CLOSED, closed by 2026-10-15T23:41:54Z.
- #6737: "localization: ToastProvider live region is not in the guest locale scope on public routes". CLOSED 2026-10-15T22:28:23Z. Found by the sweep; its `KNOWN_GAP_SELECTOR` exclusion was to be removed with the fix.
- Review's three majors: fixed by #7108 (sibling run, merged 2026-10-19). The sibling retro records their state.
- Review's six minors and Verify's three observations: deferred to seed text in `release.md` § Follow-ups and **never filed as issues**. Their current state on `origin/main`, re-checked 2026-11-07:
  - `vite.manualChunks` still routes `/packages/rialto/` (including the locale dictionaries) into `rialto-vendor` (`apps/hospitality/vite.manualChunks.ts:29`). Open.
  - `format.ts` `resolveTimeZone` still reports through `console.warn` (`utils/format.ts:16`). Open.
  - `escapeValue: false` still set in `runtime.tsx:116`, and `CancelReservationDialog.tsx` still renders `<Trans>` (line 99). Open.
  - `LocalePicker` item spans still have no `lang`. Open.
  - `runtime.tsx:150` still carries the `lean:` marker without a trigger, and `nav-sections.ts:39` still redefines `defaultT`. Open.
  - Deposit currency change (#6706) is still unrecorded in architecture.md (`release.md` documents it). Open as a record gap only.
  - zod `jitless`: no hit in `apps/` or `packages/`. Open.
  - Stable public demo venue slug: not checked here. Treated as open.
  - `onboarding-localization.test.tsx` single-file failure: not re-run here, treated as open.
  - **Fixed:** the `deploy-static.yml` path filter now includes `packages/types/**` and `packages/cancellation-policy/**` (#7489, `f4c32f91d`, 2026-10-25). Not re-seeded.

## Run retrospective

- Keep: ADR-028's split (an i18next runtime in the app, a typed optional dictionary in rialto) and the checked-in rollback plan. Review confirmed ADR-028 met on every point, and Ship measured that a whole-run revert conflicts in 21 files and stops at #6739 and wrote Option A (force en-US via `locales.ts`) instead of pretending a one-command revert existed.
- Keep: the sweep reading its route list from `metrics/ui-quality-ledger.jsonl`. A route added later is swept the day it lands, with no one remembering to add it.
- Keep: Review reading the production bundle (`curl` and a string count of `rialto-vendor-BrEE8F5T.js`) rather than trusting Verify's PASS. It found that three PASSes (criteria 1, 5, 7) rested on a rule that could not see the defect.
- Change: Verify demonstrates a gate with one fixture, and the criterion read "a PR adding a hardcoded user-visible string fails CI". A criterion that names a class of input needs one failing fixture per shape of that class (bare, ternary, logical, template, attribute). This is the maintenance-run question: the defect escaped Verify, was caught by Review, and shipped as a known live defect until #7108 on 2026-10-19. The pipeline did eventually capture it as a regression test (`no-literal-ui-strings.test.ts`), so this is a late catch, not a recurrence.
- Change: six review minors and three verification observations were left as seed text inside a Ship artifact and filed nowhere, so after three weeks all are still in place on `main` with no owner. The tracker mirror worked for the 20 work items and then stopped at Review. A deferral should become an issue or a backlog line at Review, not wait for Operate to append it.
- Change: the Operate minimum signal ("one Sentry event or Cloudflare hit with a non-en-US locale, a booking made in es-MX/fr-CA/en-GB, or a ui-quality-loop judgment of a translated page") named three carriers, and none exists: Sentry events carry no locale, no Cloudflare token, and the authenticated pages are `unreachable:auth` in the ledger. A signal needs a carrier that exists at brief time. The backlog already holds the seed ("Locale instrumentation", 2026-10-22).
- Stop: nothing here was wasted ceremony. The 25-item breakdown was large but each item shipped as its own PR, and Phase 1's scoping did defuse the scope-stall risk the idea named: no half-extracted app was left on `main`.

## Environment

One row per mistake the run recorded: `verification.md` (Failures: "None against the PRD", plus its two findings), `review.md` findings, `breakdown.md` Notes.

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| The lint rule accepted only a bare literal, so conditional/logical literals passed. This is the root of the ThemeToggle and five-component defects, and PRD 7 was graded PASS on a bare fixture. | `review.md` §Major 3; `verification.md` §Criterion 7 | mechanical | `packages/config/eslint/no-literal-ui-strings.test.ts` (exists, RuleTester), with a case per AST shape; the shapes were added by #7108. Carrier is in place and covers JSX. |
| A literal that never enters a catalog is invisible to the sweep (ThemeToggle `aria-label`; five rialto fallbacks). | `review.md` §Major 1 and 2 | mechanical | The same lint rule, extended to named UI sinks beyond JSX (already seeded in the sibling retro; not re-seeded). `apps/hospitality/e2e/locale-sweep.spec.ts` cannot hold it, because it builds its forbidden set from catalogs. |
| Rialto locale dictionaries load eagerly, defeating the lazy `import()`. | `review.md` §Minor 1 | mechanical | `apps/hospitality/vite.manualChunks.test.ts` (exists): assert a `src/i18n/locales/` id is not routed to `rialto-vendor`. |
| `resolveTimeZone` reports invalid venue zones with `console.warn`, so production never sees them, though the architecture promised Sentry. | `review.md` §Minor 2 | mechanical | `packages/config/eslint/base.js:29` sets `no-console` to error but allows `warn`, `error` and `info`. A narrower rule for `apps/hospitality/src/utils/` is the existing config's place to hold it; no new tool. |
| Three implementation deviations from architecture.md (second i18next instance instead of `cloneInstance`, console report, USD with no venue) were not logged in breakdown.md Notes. | `review.md` §Minor 2 | judgement | `AGENTS.md`: a line that a deviation from architecture.md is dated in breakdown.md Notes when it is made. Only a reader sees the gap between a design and a diff. |
| #6706 changed two API contracts (400 on currency mismatch, 3-letter `currencyCode`) that architecture.md says Phase 1 does not change. | `review.md` §Minor 3 | judgement | `AGENTS.md`, same line. `mbe check-adr` ran clean and does not read architecture.md prose. |
| Locale picker endonyms and machine-translation tags have no `lang` (WCAG 3.1.2). | `review.md` §Minor 4 | judgement | `apps/hospitality/CLAUDE.md` § Localization: a line that any text in another language carries `lang`. No existing axe check enforces language-of-parts. |
| `<Trans>` with `escapeValue: false` re-parses a guest-entered name as markup. | `review.md` §Minor 5 | judgement | `apps/hospitality/CLAUDE.md` § Localization: a line that user-entered values go in as component children, not `{{value}}`. |
| A `lean:` marker with no trigger, and `defaultT` duplicated in `nav-sections.ts`. | `review.md` §Minor 6 | judgement | `apps/hospitality/CLAUDE.md` names `default-t.ts` as the one helper (line in § Localization). `knip` (`ci.yml:283`) does not flag a duplicated constant. |
| `onboarding-localization.test.tsx` fails when run as the only file (`toBeVisible()` on an option of a not-yet-visible listbox). | `verification.md` §Known local failure | mechanical | None exists. Every CI test job runs the whole suite (`Test (Node 22, hospitality)`), which is the only mode where it passes, so nothing runs this file alone. Recorded as a finding; the fix is to the test. |
| Every hospitality page triggers one enforced CSP refusal (zod's `Function('')` probe), which masks real CSP regressions in probes. | `verification.md` §Failures | mechanical | The app's zod import site, setting `jitless`. No CI job observes CSP violations on a loaded page. |
| `deploy-static.yml`'s path filter omitted `packages/cancellation-policy/**` and `packages/types/**`, so #6688 shipped only because an unrelated push followed. | `release.md` §Release log 3 | mechanical | Fixed by #7489; the filter is `.github/workflows/deploy-static.yml`, now covering both paths. No further carrier. |
| Main was red once at `7d05cdca5` (an intermittent LocalePicker focus test on a loaded runner). | `release.md` §Release log 2 | mechanical | `Test (Node 22, hospitality)` in `ci.yml` is the existing job that failed; the existing carrier is `LocalePicker.test.tsx` itself, whose timeout was widened for a sibling test (#6734) but not for the failing one. |

**Finding:** `pnpm check:i18n-catalogs` runs under `pnpm repo-audit` in CI's Build chain (`ci.yml:445`). It runs under no pre-commit or pre-push hook (`.husky/pre-commit` and `.husky/pre-push` do not call it, and `docs`-only PRs skip the Build chain per `ci.yml:144`). A catalog key added without es-MX/fr-CA values is therefore caught only after push.

## Idea seeds

Priority order. Sibling-run seeds (TapeChart context locale, non-JSX hospitality literals, lint sinks) and the existing "Locale instrumentation" line in `docs/backlog.md` are not repeated.

- Make Verify demonstrate a gate-type criterion with one failing fixture per syntactic shape named in the criterion's input class, not one fixture, because Verify graded PRD 7 PASS on a bare literal while `{a ? "Open" : "Closed"}` and `{a && "Saved"}` passed lint and shipped live for four days; measure by listing, for the next three runs with a lint-gate criterion, the shapes each fixture covered (from: feature:localization)
- Measure, for #8036, #8089, #8105 and #8139 (English or wrong es-MX/fr-CA copy found 2026-11-01/02 by other runs), whether the lint rule, the catalog parity check or the locale sweep could have failed on the offending string, and which of the three states it was in (in-catalog but not rendered by the sweep's mocks, never in a catalog, or in a catalog but wrong); the answer decides whether the sweep needs richer mock data or the rule needs more sinks (from: feature:localization)
- File each deferred Review minor of a run as an issue or backlog line at Review, and have Operate list any that are still open on `origin/main`: six minors and three observations of this run sat three weeks with no owner and all nine are still in place (from: feature:localization)
- Pull the hospitality locale dictionaries out of the eager `rialto-vendor` chunk (`apps/hospitality/vite.manualChunks.ts:29`), with a case in `vite.manualChunks.test.ts`, so a visitor who never leaves en-US stops downloading the es-MX and fr-CA Rialto dictionaries (about 2.8 kB brotli); measure the `rialto-vendor` size before and after (from: feature:localization)
- Route `format.ts` `resolveTimeZone`'s invalid-zone report through the hospitality Sentry client once per zone, and give the `lean:` marker in `runtime.tsx:150` a trigger or a Sentry report on boot load failure; measure with a Sentry search for the new events (zero events is the expected steady state, and silence today proves nothing because the boot failure is unobservable) (from: feature:localization)
- Set `lang` on each LocalePicker menu item and machine-translation tag span (WCAG 3.1.2), and give the settings Select a lang-capable label or document the gap; verify with a rendered-DOM assertion in `LocalePicker.test.tsx` (from: feature:localization)
- Pass the guest name into the cancel and no-show dialogs' `<Trans>` as a component child instead of `{{name}}`, so markup-like names render verbatim under `escapeValue: false`; test with the four names Review probed (`<0>hi</0>`, `Jo</strong><em>x`, `<img src=x onerror=alert(1)>`, `Bob <3`) (from: feature:localization)
- Import `defaultT` from `i18n/default-t.ts` in `nav-sections.ts` instead of redefining it, and record the #6706 deposit-currency contract change (400 on mismatch, no `usd` default, 3-letter `currencyCode`) in the reservations service's changelog (from: feature:localization)
- Provide a stable public demo venue slug so the found-venue guest booking flow, en-GB money and time, and the production locale switcher can be probed in every locale; those were the three parts Verify marked Not verified in production (from: feature:localization)
- Set zod `jitless` globally in hospitality so its `Function('')` probe stops raising an enforced `script-src` eval refusal on every page load, then measure the console CSP-violation count on a loaded page (expected 0) (from: feature:localization)
- Make `onboarding-localization.test.tsx` pass as the only file (wait for the listbox before `toBeVisible()`, or assert presence plus accessible name), and add a lane that runs each hospitality test file alone, or document that none exists (from: feature:localization)
- Run `pnpm check:i18n-catalogs` in the pre-push hook as well as in `repo-audit`, since it is fast and a key without es-MX/fr-CA values is currently caught only after push; measure how many failed `Build` jobs since 2026-10-15 named `check-i18n-catalogs` (from: feature:localization)
- Phase 2 of localization: marketing, rialto-web and gen, then server-sent email, SMS and ICS with a persisted guest/venue locale, so idea.md's all-4-apps sentence can be met; start by measuring how many user-visible literals each app holds today with the `no-literal-ui-strings` rule run over `apps/marketing`, `apps/rialto-web` and `apps/gen`, and whether any guest opened a non-en-US booking page (from: feature:localization)

## Run complete

Closed 2026-11-07. Population 0: nothing in this run has been observed in use, and every outcome above is `unobserved`. What is known is state. Phase 1 is deployed to hospitality in four locales, the foundation and both CI gates are on `main`, the three review majors were fixed by the sibling run (#7108), and nine review and verification deferrals are still open on `main` with no issue filed. The seeds above are the input to the next Idea-stage run.
