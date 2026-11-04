---
stage: operate
run: maintenance:localization-conditional-literals
date: 2026-11-03
users-observed: 0
signal-source: "none identifiable. Sentry (hospitality project, 14d: 235 error events, 38 distinct users) carries no locale tag, so no es-MX / fr-CA / en-GB or screen-reader user can be separated out; no Cloudflare analytics token; no issue, comment or feedback from a user of the fixed surface (searched 2026-10-19..2026-11-03)"
assumptions:
  - "Owner's live answer (autorun-brief.md § Resume 2026-11-03): minimum-signal leg 1 'Met by intent'. Recorded as the Owner's grading, not as the literal wording being met."
  - "Leg 2 searched ci.yml only (the workflow that runs the Lint job). Other workflows that may run eslint (merge-queue, post-merge, e2e) were not read."
---

# Retro: conditional string literals no longer bypass localization

## Minimum signal (brief § Operate, restated in `release.md`)

`release.md` records `outcome: released`, `released-at: 2026-10-19`, PR #7108 (squash `afdcc9fff`, merged 2026-10-19T02:37:07Z). There is no pending merge to resolve. The run is 15 days past release.

### Leg 1: the deployed bundle. Met by intent (Owner, live); evidence follows

Fetched 2026-11-03 22:24Z. `https://mattbutlerengineering.com/hospitality/` returned HTTP 200 and preloads `rialto-vendor-CkkMuhjh.js`. That chunk returned HTTP 200, 328,571 bytes. It was `rialto-vendor-vaLYernM.js` (280,082 bytes) when Capture measured it.

String counts in the chunk:

| String                                                                   | Hits |
| ------------------------------------------------------------------------ | ---- |
| `Switch to dark mode`                                                    | 1    |
| `Switch to light mode`                                                   | 1    |
| `Cambiar a modo oscuro` (es-MX)                                          | 1    |
| `Cambiar a modo claro` (es-MX)                                           | 1    |
| `Passer au mode sombre` (fr-CA)                                          | 1    |
| `Passer au mode clair` (fr-CA)                                           | 1    |
| the old hardcoded ternary ``Switch to light mode`:`Switch to dark mode`` | 0    |

The ThemeToggle `aria-label` expression, verbatim from the chunk:

```
Xf,{ref:n,variant:`secondary`,onClick:t,"aria-label":r?i.switchToLightMode:i.switchToDarkMode
```

Where the English strings sit, as the en-US dictionary values:

```
for ${e}`,switchToLightMode:`Switch to light mode`,switchToDarkMode:`Switch to dark mode`
```

The locale values, as dictionary entries:

```
 de ${e}`,switchToLightMode:`Cambiar a modo claro`,switchToDarkMode:`Cambiar a modo oscuro`
 de ${e}`,switchToLightMode:`Passer au mode clair`,switchToDarkMode:`Passer au mode sombre`
```

So the hardcoded conditional is gone and the component reads `messages.*`. Both English strings stay in the chunk, once each, as the en-US values. The brief's literal wording ("no longer contains 'Switch to dark mode'") could not be met by a correct deploy.

Not shown: that a browser actually announces the translated name. Verify skipped a real-browser render for lack of Auth0 credentials. The chunk shows what ships, not what a screen reader says.

### Leg 2: did CI catch a real new conditional literal? None in 15 days

Window: 2026-10-19 (merge) to 2026-11-03, 15 days, past the 14-day bar.

How it was searched:

- `gh api repos/.../actions/workflows/ci.yml/runs?created=2026-10-19..2026-11-03&status=failure` gives 263 failed CI runs out of 2,362 in the window.
- `gh api .../runs/<id>/jobs` for each: 301 failed jobs. By job: CI Gate 137, Build 59, Test (rest) 32, **Lint 21**, Test (hospitality) 12, Test (rialto) 11, RLS 10, Prepare 6, Typecheck 4, Docs Formatting 3, Test (reservations) 2, AI Antipattern Ratchet 2, Integrity 1, Dependency Sync 1.
- For all 21 failed Lint jobs (2026-10-19T03:46Z to 2026-11-02T11:58Z) the full log was fetched. `no-literal-ui-strings` appears in 0 of them. The last command before the exit in each of the 21 is `knip`, not eslint.
- `gh search` on the rule id across issues, PRs and commits, plus the slug `localization-conditional-literals`. Nothing after #7108 reports a CI failure on the rule.
  - #7303 / PR #7318 (created 2026-10-22) mentions the rule. A rescued branch was committed `--no-verify` because the rule rejected its pre-localization strings (15 errors). It was caught locally and was never a CI run. The issue does not say whether any of the 15 were conditional shapes, so it is not counted.

Result: 15 days with none. That is the rule's second option for leg 2. It does not show the rule works in CI. The rule's cases are proven by its RuleTester suite (`packages/config` 104/104 at Verify), not by a production catch.

## Outcomes vs. intent

The population is 0 (frontmatter), so every outcome is `unobserved`. Each records state, not use. Targets are from `defect.md` § Defect (Expected) and its work-item Accept lines.

### Every string rialto or hospitality renders on its own resolves through the locale's messages (the live defect: ThemeToggle)

- What happened: the deployed hospitality chunk reads the ThemeToggle name from `messages.switchToLightMode` / `switchToDarkMode`, and the es-MX and fr-CA values ship in the same chunk (quoted above). Whether any es-MX, fr-CA or en-GB screen-reader user has heard it is not known.
- Signal strength: unobserved

### The lint rule reports a textual literal in a ternary branch or a logical right operand (JSX children and guarded attributes)

- What happened: the rule change is merged and in `main` (`packages/config/eslint/local-rules.js`), and 15 days of CI show it never failed a Lint job. That could mean "the rule is quiet because nobody wrote a conditional literal" or "the rule does not fire". The 15 days cannot tell them apart. Only the RuleTester suite shows it fires.
- Signal strength: unobserved

### Five rialto components (Form, TapeChart, DataTable, PinInput, ChatPanel) plus TextArea and Combobox (Owner-widened) render localized text for a consumer that sets a locale

- What happened: merged. For hospitality, only ChatPanel's chunk is exercised. For rialto npm consumers, [INFERENCE] none have the fix: `docs/backlog.md` already carries a seed saying rialto 0.8.0 is versioned on main while the GitHub Packages registry serves 0.2.0. That was not re-checked here.
- Signal strength: unobserved

### `packages/rialto/CLAUDE.md:198`'s claim is true of the code

- What happened: the claim was rewritten and is on `main` (`CLAUDE.md:158` now states the rule "only sees JSX" and that a literal in a variable or return is out of its sight). The non-JSX English the same scan found in hospitality was not in scope, and some of it was still on main on 2026-11-03: `use-command-palette.ts:25` ("Navigation"), `use-form-state.ts:37` ("Validation failed"), and the "Cancel or modify:" line in `calendarLinks.ts:18` and `ics.ts:115`. `venueOpenLabel.ts` no longer has the "Closed, opens" strings.
- Signal strength: unobserved

### Release hygiene: patch changeset, `check:i18n-catalogs`, rialto size-limit at or under 2.2 kB

- What happened: Ship recorded all green at release. By 2026-10-27 the fr-CA subpath had gone over its 2.2 kB budget by 4 B (2204 B) and nothing caught it, because no CI job ran rialto's size-limit (#7853, created 2026-10-27, closed the same day). That issue does not cite this run. It is evidence about this run's gate, not feedback about the fix, so it counts toward nothing here.
- Signal strength: unobserved (the gate result is a fact about CI, not about users)

## Open debt

The run's own debt. None of this counts as feedback.

- #7102: "[Feature] package consolidation [5/9]: Cut rialto's dependency on @mbe/api-client: ChatPanel takes an injected stream adapter". Created 2026-10-19T00:41Z, before the 02:37Z merge of #7108. It names this run's branch (`fix/localization-conditional-literals`) as the owner of `useChatStream.ts:139`. It is closed (2026-10-19T03:26Z), so nothing here is open.
- No issue was ever filed for Review's deferred minor (TapeChart's `useTapeChartI18n` ignoring the context locale) or for Capture's untriaged non-JSX hospitality literals. Both are carried as seeds below.

Issues #8036, #8089 and #8105 (hospitality English copy beside es-MX/fr-CA, created 2026-11-01/02) are not debt of this run and not feedback from a user of its fix. They are other runs' findings about other surfaces (`describeApiError`, availability copy). They show the same class of defect, English outside the rule's JSX positions, still turning up.

## Run retrospective

- Keep: Capture re-measured the review's claims before work began and caught a miss. The review counted 9 conditional literals and the scan found 10. It also surfaced two live-region announcements (TextArea, Combobox) that no JSX rule can see. Without that the CLAUDE.md claim would have been rewritten false a second time.
- Keep: RED first. The stdin fixture exit 0 → exit 1, and the `origin/main` versions of the six files failing at HEAD's rule, made Verify's RED/GREEN reproducible without checking out old code.
- Keep: stopping on the size-limit overrun and asking. The Owner's 1.5 → 2.2 kB answer was recorded with its reason in the changeset and `defect.md`, instead of a silent budget bump.
- Change: write a signal the deploy can actually meet. Leg 1 said the bundle "no longer contains" two strings that must stay as the en-US values. Verify spotted it, Review restated it, and the Owner still had to grade it by intent at Operate. A signal should name what a correct deploy changes (the removed ternary, the new `messages.*` read), never a string the fix legitimately keeps.
- Change: leg 2's "one CI run in which the rule caught a real new conditional literal" can only see CI. The one rejection found after merge (#7303) happened locally under lint-staged. A signal that needs a catch should name every place the check runs, or it will usually resolve to "15 days with none", which says little about whether the rule fires.
- Change: any gate the brief names (here rialto `size-limit`) should be confirmed to run in CI at brief time, not only by hand in Implement. It was not, until #7853.
- Stop: nothing worth stopping. The run was small and each stage did its job. Review's two minors were proportionate.

## Environment

One row per mistake the run recorded. Sources: `defect.md` Notes, `review.md` findings, `verification.md` § Not verified. `verification.md` § Failures is "None".

| Mistake                                                                                                                                                                                                                               | Evidence                                                                               | Class      | Proposed carrier                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The review's scan counted 9 conditional literals, not 10, and missed two more English announcements. Capture's own scan found them.                                                                                                   | `defect.md` § Reproduction ("Count vs the review"), § Notes ("Surfaced, not in scope") | mechanical | `mbe-local/no-literal-ui-strings` in `packages/config/eslint/local-rules.js`, extended to the variable/return sinks the capture scan listed (204 other-context hits at Capture). The scan itself lived only in `scratchpad/loc-capture/`, so a repeat review would hand-roll it again. |
| The rialto per-locale size-limit was hit mid-run (es-MX 1.8 kB, fr-CA 1.91 kB over 1.5 kB), and a week later fr-CA went 4 B over 2.2 kB with nothing flagging it.                                                                     | `defect.md` § Notes ("Size-limit stop"); #7853                                         | mechanical | `.github/workflows/ci.yml` running `pnpm size:check` (present now, `ci.yml:481`, added after #7853). Closed.                                                                                                                                                                           |
| TapeChart's `Intl` formatting and the day-card lowercasing ignore the context locale, against ADR-028's precedence (explicit prop, then context, then `undefined`). The pre-existing deviation was found by Review, not by any check. | `review.md` § Findings (first minor)                                                   | mechanical | `packages/rialto/src/components/TapeChart/useTapeChartI18n.test.ts`: a case asserting the provider locale is used when no `locale` prop is passed. `mbe check-adr` ("No architectural violations") did not see it.                                                                     |
| The brief's minimum signal could not be met by a correct deploy.                                                                                                                                                                      | `verification.md` Defect 1 ("Note for Operate"); `review.md` § Findings (second minor) | judgement  | The brief's Operate section as written at Capture time. Only a reader asking "can a correct fix fail this check?" would catch it. No existing deterministic carrier. This retro records the lesson (above) rather than adding a prose rule.                                            |
| Hospitality English in non-JSX positions (`"Navigation"`, `"Validation failed"`, the "Cancel or modify:" lines) was recorded at Capture but not triaged, and some is still on main.                                                   | `defect.md` § Notes ("Hospitality non-JSX literals")                                   | mechanical | `apps/hospitality/e2e/locale-sweep.spec.ts` already sweeps authenticated routes and builds its forbidden set from the catalogs. English that was never put in a catalog is invisible to it. The same lint extension as row 1 would cover the rest.                                     |

Finding: `defect.md`'s ThemeToggle string was invisible to every gate for the same reason, never having been in a catalog. The authenticated sweep now covers the new rialto keys, so it would catch a revert of this fix, but not a new literal that never reaches a catalog.

## Idea seeds

- Make TapeChart's `useTapeChartI18n` read `useRialtoLocale().locale` between the explicit `locale` prop and `navigator.language` (ADR-028 precedence), so its dates, numbers and the day-card lowercasing follow the provider like its labels now do, with a test in `useTapeChartI18n.test.ts` (from: maintenance:localization-conditional-literals)
- Localize the hospitality English that the lint rule cannot see, after triaging UI text versus calendar-export text: `hooks/use-command-palette.ts:25` ("Navigation"), `hooks/use-form-state.ts:37` ("Validation failed"), and the "Cancel or modify:" line in `utils/calendarLinks.ts:18` and `utils/ics.ts:115` (from: maintenance:localization-conditional-literals)
- Close the `no-literal-ui-strings` blind spot for English that reaches the UI through a variable, object property or return: Capture's scan found 204 other-context conditional literals, most tokens and CSS, and a few real announcements (PinInput, TextArea, Combobox, all fixed by this run only because Capture found them by hand). Decide between extending the rule to named UI sinks and committing the scan as a repo check (from: maintenance:localization-conditional-literals)

## Run complete

Closed 2026-11-03. Seeds above are the input to the next Idea-stage run. The existing `docs/backlog.md` seed "Locale instrumentation" (2026-10-22) is the carrier for ever counting a non-en-US user of this surface; it is not duplicated here.
