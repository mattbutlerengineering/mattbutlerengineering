# Autorun brief — localization-conditional-literals

Collected 2026-10-18. This is the brief, not an artifact: it never counts
toward orientation. Maintenance run, slug `localization-conditional-literals`,
directory `docs/fixes/localization-conditional-literals/`, entering at Capture.

## Origin (live Owner answers, not assumptions)

The `feature:localization` re-review (`docs/features/localization/review.md`,
commit `131b96288`, merged via #7080) found three majors. The Owner answered
on 2026-10-18: **"One fix run, all 3"**, and chose this slug's run as the next
autorun. Operate was answered live too (below).

## Defect (from the review; Capture restates and re-checks it)

1. **Live in production:** `packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx:28`
   hardcodes `aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}`.
   It renders on every authenticated hospitality route (`GlobalNav.tsx:94` <-
   `apps/hospitality/src/App.tsx:101-110`), so es-MX / fr-CA / en-GB
   screen-reader users hear English. The deployed `rialto-vendor` chunk
   contains both strings (re-confirmed by the localization Ship stage).
2. **Five more rialto components render English** for any app that sets a
   locale: Form "1 field needs attention" / "`${n}` fields need attention"
   (`Form.tsx:86-88`); TapeChart "Reservation(s)" (`TapeChartStatPills.tsx:34`,
   `TapeChartMobileStack.tsx:83`) and its English `defaultStrings.ts`;
   DataTable "Select row" fallback (`DataTable.tsx:405`); PinInput "Code
   complete" announcement (`PinInput.tsx:189`); ChatPanel "Not allowed"
   fallback (`useChatStream.ts:139`). This also makes
   `packages/rialto/CLAUDE.md:198`'s claim false.
3. **Root cause — neither gate sees a literal inside a conditional:**
   `mbe-local/no-literal-ui-strings`'s `isTextual`
   (`packages/config/eslint/local-rules.js:166-174`) inspects only a bare
   literal; `{a ? "Open" : "Closed"}`, `aria-label={a ? …}` and
   `{a && "Saved"}` pass (an `eslint --stdin` fixture exited 0). The e2e
   locale sweep only flags strings already in a catalog. A TypeScript-AST scan
   found 9 such literals on `main` at review time.

Reproduction is already in hand: the review's stdin fixture is the failing
test; the deployed bundle string is the production evidence.

## Decided shape (Owner answer; take as the plan)

- Re-entry: **implement** — scoped fix, no design decision open beyond what
  ADR-028 already fixes (rialto text through `useRialtoLocale` /
  `RialtoMessages`; hospitality text through catalogs + `t()`).
- Order: (a) tighten the lint rule to report literals in `ConditionalExpression`
  consequent/alternate and `LogicalExpression` right operand, in JSX children
  and in the attributes the rule already guards — RED test first, then it
  fails on the ~9 current literals; (b) move each literal to a
  `RialtoMessages` key (rialto: en-US inline + `locales/en-GB|es-MX|fr-CA`) or
  a hospitality catalog key (en-US + es-MX + fr-CA; en-GB only if wording
  differs), so the rule goes GREEN; (c) correct `packages/rialto/CLAUDE.md:198`;
  (d) rialto **patch** changeset (consistent with the localization run's
  patch decision); `pnpm check:i18n-catalogs` green; rialto `size-limit`
  (fr-CA had ~140 B headroom) — if a locale bundle exceeds its limit, stop
  and surface rather than raising the limit unasked.
- Out of scope: the localization review's six minors; the e2e sweep's
  catalog-only detection (seed it if not addressed by the lint fix);
  publishing rialto (`RIALTO_PACKAGES_TOKEN` unset — not this run's call).
- Translations: es-MX / fr-CA wording follows the existing catalogs' voice;
  machine-translation notice conventions per the localization run.

## Execution environment

Worktree `.claude/worktrees/loc-literals`, branch
`fix/localization-conditional-literals`, cut from `origin/main`. Run
`pnpm install --frozen-lockfile` and `pnpm build --filter '@mbe/hospitality^...'`
before tests. Gates before push: `pnpm lint`, `pnpm typecheck`,
hospitality + rialto + config unit tests, `pnpm check:i18n-catalogs`, rialto
`size-limit`, and the `local-ci-precheck` steps (CLAUDE.md § Pipeline Stage
Hooks). The rialto `setState`-in-`useEffect` ban applies.

## Pre-flight 2026-10-18

Open PRs #7094, #7089, #7078: none touches `local-rules.js`,
`packages/rialto/src` or `i18n/catalogs`. No existing PR does this work.

## Tracker

No tracker interaction: no issues created, none closed.

## Release authorization

**Prepare-and-stop.** Ship pushes this branch and opens one PR (code + run
docs) for the Owner's merge, records `outcome: prepared` with
`pending-merge: <PR url>`, and takes no other release action — no merge,
deploy, publish, tag, or `changeset version`. Merging deploys hospitality via
`deploy-static.yml`; that is the Owner's action. Never release past an unfixed
critical review finding.

## Operate

operate:
minimum-signal: >-
The deployed hospitality `rialto-vendor` bundle no longer contains
"Switch to dark mode" / "Switch to light mode", AND either one CI run in
which the tightened rule caught a real new conditional literal, or 14
days elapsed since merge with none. users-observed counts honestly; 0 is
valid.
