---
stage: review
run: maintenance:localization-conditional-literals
date: 2026-10-18
assumptions:
  - "Autorun: the brief stands in for the Owner's answers. It names no severity arbitration, so the severities below are this stage's own and every non-critical finding is deferred with a logged reason rather than routed back to Implement."
  - "Review is not a backlog producer under the protocol (only Capture and Operate append to docs/backlog.md), so the follow-up seeds below are recorded here as candidates for Operate to append at run close, not written to docs/backlog.md now."
  - "The brief calls the governing ADR 'ADR-027 localization through context'; in this repo that decision is ADR-028 (ADR-027 is same-zone merge-train batching). Reviewed against ADR-028."
  - "Maintenance run, scale small (defect.md): Verify's evidence (lint fixture RED/GREEN, locale tests, gates, bundle wiring) is the floor and is not re-run here, except `pnpm regen --check` for the generated-artifact lens, which Verify left to Ship."
---

# Review: conditional string literals no longer bypass localization

## Scope

`git diff origin/main...HEAD` on `fix/localization-conditional-literals`, head
`451ae0801` (code head `591a7ecaf`), 37 files, 17 commits from `810736827`.
Examined in full: `packages/config/eslint/local-rules.js` and its RuleTester
cases; `packages/rialto/src/i18n/{messages.ts,locales/es-MX.ts,locales/fr-CA.ts}`
(en-GB is `{ ...enUS }`, unchanged); ThemeToggle, Form, DataTable, PinInput,
TextArea, Combobox, ChatPanel `useChatStream.ts`, TapeChart (`TapeChart.tsx`,
`TapeChartStatPills.tsx`, `TapeChartMobileStack.tsx`, `defaultStrings.ts`);
hospitality `DashboardLayout.tsx` + three catalogs; `packages/rialto/CLAUDE.md`;
`packages/rialto/package.json` (size-limit only); the changeset; the regenerated
`llms*.txt`. Read against defect.md's three defects and ten Accept lines, ADR-028,
ADR-025 and `packages/rialto/CLAUDE.md`.

Branch state vs `origin/main`: 3 commits behind, none touching
`packages/rialto`, `packages/config`, hospitality catalogs or `llms*.txt`;
`git merge-tree --write-tree origin/main HEAD` is clean. ChatPanel did not move
on main (brief's coordination check).

## Findings

No critical or major findings.

### Minor: TapeChart labels now follow the provider, but its Intl formatting and the day-card lowercasing still ignore the context locale (ADR-028 precedence)

- Where: `packages/rialto/src/components/TapeChart/useTapeChartI18n.ts:32-33`
  (`locale ?? navigator.language`, pre-existing, not in the diff);
  `TapeChartMobileStack.tsx:87` (`toLocaleLowerCase(formatters.locale)`, new).
- Scenario: a consumer wraps TapeChart in `RialtoLocaleProvider locale="es-MX"
messages={esMX}` and passes no `locale` prop, in an en-US browser. Before this
  run the chart was English throughout. Now the labels, pills and statuses are
  Spanish while weekday/month names and numbers format as en-US, so the chart
  mixes two languages. ADR-028 fixes the `Intl` precedence as explicit `locale`
  prop → context locale → `undefined`; `useTapeChartI18n` skips the context step.
  The new lowercasing uses the same non-context locale; no shipped dictionary
  string is case-sensitive to that difference, so it has no live failure today.
- Exposure: npm consumers only. Hospitality renders no TapeChart (defect.md).
- Standard: none (repo has no `docs/standards.json`).
- Decision: deferred. The deviation predates the run, the fix is a one-line
  context read plus a test, and it is outside the brief's three defects. Seed
  candidate 1 below.

### Minor: the brief's Operate minimum signal cannot pass as written

- Contract: `autorun-brief.md` § Operate requires the deployed `rialto-vendor`
  bundle to "no longer contain 'Switch to dark mode' / 'Switch to light mode'".
  Verify showed both strings stay in the bundle as the en-US `RialtoMessages`
  values (`switchToLightMode:`Switch to light mode``), which is the correct
  outcome. Graded literally, Operate would record a failure on a correct deploy.
- Restated signal for Operate: the deployed `rialto-vendor` chunk no longer
  contains the hardcoded ternary `"aria-label":<x>?`Switch to light mode`:`Switch to dark mode``,
  and does contain `"aria-label":<x>?<m>.switchToLightMode:<m>.switchToDarkMode`
  plus the es-MX/fr-CA values (`Cambiar a modo oscuro`, `Passer au mode sombre`).
  The rest of the signal (one CI run where the tightened rule caught a real new
  conditional literal, or 14 days with none) is unchanged.
- Standard: none.
- Decision: fixed in this artifact (restatement). Ship should carry it into
  `release.md` so Operate grades the restated form.

## Notes for Ship (not findings)

- **fr-CA size headroom.** Rialto `size-limit` at the code head: fr-CA 2 kB of
  2.2 kB (about 0.2 kB left), es-MX 1.89 kB, en-GB 114 B. The Owner's
  stop-and-surface rule for a further overrun stands; the next few translated
  keys will hit it. Not a defect: the gate is doing its job. Ship should note the
  remaining headroom in the PR body.
- **Type-level addition for custom dictionaries.** `RialtoMessages` gains ten
  required keys plus the nested `tapeChart` group, so an npm consumer that built
  its own `RialtoMessages` object fails typecheck until it adds them. That is
  ADR-028's stated consequence and `packages/rialto/CLAUDE.md`'s patch-changeset
  policy, and the changeset lists the new keys. Not a finding; worth one PR-body
  line.
- **Generated artifacts.** `pnpm regen --check` at `451ae0801`: "All generated
  artifacts are up to date." The `llms*.txt` deltas are the new
  `defaultStringsFor` / `TapeChartMessages` surface, consistent with the source.

## Follow-up seed candidates (for Operate to append to `docs/backlog.md`)

1. Make `useTapeChartI18n` read `useRialtoLocale().locale` between the explicit
   `locale` prop and `navigator.language` (ADR-028 precedence), so TapeChart's
   dates/numbers and the day-card lowercasing follow the provider like its
   labels now do (`useTapeChartI18n.ts:32-33`).
2. Localize hospitality's non-JSX English, which the tightened rule cannot see
   (variable/return/call positions), after triaging which are UI text versus
   calendar-export text: `hooks/use-command-palette.ts:24` ("Navigation"),
   `hooks/use-form-state.ts:37` ("Validation failed"), `utils/calendarLinks.ts:18`
   and `utils/ics.ts:115` ("Cancel or modify: …"), `utils/venueOpenLabel.ts:34-35`
   ("Closed, opens …").
3. Give the e2e locale sweep a detector for text that never reached a catalog.
   It only flags strings already in a catalog, so it cannot see the class this
   run fixed, and the lint rule only covers JSX positions. For example, under a
   non-en-US locale, flag rendered text and accessible names that exactly match
   an en-US catalog or `enUS` dictionary value whose translation differs.

## Passes with no findings

- **Correctness.** The rule change is the minimal recursion (`ConditionalExpression`
  consequent/alternate, `LogicalExpression` right) inside the existing guarded
  positions, so it cannot widen the attribute set it fires on; `pnpm lint` 52/52
  green shows no false positives elsewhere. Every en-US message value is
  byte-identical to the literal it replaced (checked against the removed lines,
  including the TapeChart defaults and the aria template pieces;
  `defaultStrings.test.ts` is unchanged and green). `DataTable` uses a new
  `selectThisRow` key rather than the existing column-header `selectRow`, so
  en-US row names do not change. Plural functions are only called with the
  counts their callers guarantee (`resultsAvailable` after a `count === 0`
  early return; French `count < 2` is correct for 0 and 1). `useChatStream`'s
  new `t` dependency changes identity only when the provider's `messages`
  changes (`RialtoLocaleProvider` memoizes its value). `mergeStrings` keeps its
  old one-argument signature with an `enUS` default, and the `TapeChart` memo
  keys on `messages`.
- **Design.** Matches ADR-028 (typed dictionary, en-US inline, per-locale
  modules typed `RialtoMessages`, context delivery with the no-provider en-US
  fallback of ADR-025) and the hospitality catalog + `t()` pattern. The nested
  `tapeChart` group and the type-only import from `TapeChart/types` into
  `messages.ts` are documented choices (defect.md assumptions, CLAUDE.md); the
  type import is erased, so no locale subpath gains a runtime dependency. No
  decision here passes the "write an ADR" test beyond what ADR-028 already
  records.
- **Security.** No input boundary, secret, injection surface or error-leak path
  is touched. The `notAllowed` fallback only applies when the server sends no
  reason.
- **Complexity.** No cut-list hit: no new abstraction, flag or indirection beyond
  one function per call site. The one `lean:` marker
  (`TapeChartMobileStack.tsx:83-86`) names its ceiling (one capitalized key,
  lowercased) and its trigger (a locale that keeps nouns capitalized, e.g. de).
- **ADR compliance.** `adr_status.py` reports 28 ADRs, all `unrecognized`; read
  by status text, ADR-001 (rialto as the design system), ADR-025 (context
  pattern) and ADR-028 (localization) are live and in reach. No violation by the
  diff; the ADR-028 precedence gap above is pre-existing code the diff touches
  next to. The other 25 ADRs (API errors, auth, edge routing, merge train, RLS,
  jobs, etc.) are out of the diff's reach.
- **Domain passes.** Dependencies selected by `packages/rialto/package.json`:
  the change is three `size-limit` budgets, no dependency, override or lockfile
  edit, so clean. Payments and Migrations not selected.
- **Diff-matched specialist lenses (run inline).** Rialto prop drift: the changed
  components' `*Props` interfaces are unchanged (ThemeToggle, Form, DataTable,
  PinInput, TextArea, Combobox, TapeChart), and the new locale tests use those
  props; `pnpm typecheck` 52/52 (rialto's typecheck covers its tests) was green
  at Verify. Generated-artifact determinism: `pnpm regen --check` clean (above);
  no generator or sort code changed.
- **Accept lines.** All ten work items and the three defects are met as Verify
  recorded; `packages/rialto/CLAUDE.md` now states the rule's JSX-only limit
  instead of overclaiming.

## Verdict

**Ready to ship.** No critical or major findings. Two minors: one deferred with
a seed, one fixed here by restating the Operate signal, which Ship must carry
into `release.md`.
