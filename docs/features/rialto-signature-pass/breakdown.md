---
stage: decompose
run: feature:rialto-signature-pass
date: 2026-11-25
assumptions:
  - "Unattended autorun. The cut lines were checked against architecture.md, prd.md and ux.md, not reviewed live with the Owner."
  - "docs/factory/decompose-lessons.jsonl does not exist in this repo, so no past lessons were weighed."
  - "Milestone 1 ships as one PR (architecture.md calls it 'the kill-test PR'), its items landing as ordered commits. It changes no shipped component and no existing baseline, so the go/no-go does not need it merged: the screenshots come from that branch's Storybook."
  - "Every later milestone is blocked by the go/no-go gate, as the run's standing instruction says. On a no-go, Milestone 2 (palette promotion) is dropped, per PRD criterion 1 and ux.md Walkthrough 4. A no-go stops palette work only, so the gate issue also asks Matt whether Milestones 3 and 4 go ahead. The breakdown does not decide that for him."
  - "Baseline churn (the PRD open question Decompose owns): visual-baseline-regen.yml opens a PNG PR and never merges, so a baseline-flipping PR merges first and the regen is dispatched from main right after, one app per dispatch, in the order rialto, rialto-web, hospitality. No second baseline-flipping PR opens until every regen PR for the first has merged. Hospitality regenerates twice (after the palette promotion, then after the calm phase slot), not batched, so visual red never sits on main across unrelated PRs. CI Gate excludes the visual jobs, so this ordering is about noise, not about blocking."
  - "audit-coverage.test.ts lands with the rewritten audit and every check except 'no open critical or serious finding'. That check is written test-first in the PR carrying the last critical or serious fix, where it goes from RED to GREEN. Landing it with the audit would put a red test on main for the whole fix phase."
  - "The audit rows are written in four batches by alphabetical range of the components exported from src/components/index.ts, as commits on one audit PR, because the coverage test only passes once every row exists."
  - "WIP cap: after the gate, three lanes run at once at most (palette promotion, audit and fixes, service-aware mode), one open PR per lane. Token CSS (colors*.json, colors.css, component-tokens.css, shadows.css) is edited only in Milestones 1 and 2, which are serial. The hospitality i18n catalogs are edited only by the ServicePhaseScope item and the page-wiring items, which are serial."
  - "Tracker: no issues seed the run, so the work items are not mirrored into GitHub issues. Out-of-scope items are listed under 'Follow-up issues to file' for the orchestrator to file."
---

# Breakdown: Rialto signature pass

Progress lives in the checkboxes below. Implement checks items off as their
acceptance criteria are met.

**Gates on every item** (not repeated per item): the named test is written
first and seen failing (RED) before any implementation; `pnpm lint`,
`pnpm typecheck` and `pnpm test` pass (PRD criterion 13); any change under
`packages/rialto/src/**` carries a `patch` changeset; visual baselines change
only through `gh workflow run visual-baseline-regen.yml -f app=<app>`, never
a locally captured PNG; the `local-ci-precheck` steps run before the first
push of each PR.

**Lanes after the gate:** P = palette promotion (Milestone 2), A = audit and
fixes (Milestone 3), S = service-aware mode (Milestone 4). One open PR per
lane, so never more than three at once. Only one baseline-flipping PR is
open at a time, across all lanes.

## Milestone 1: Kill test — the candidate palette on five primitives, judged by Matt

Demonstrable: the kill-test board in Storybook, before and after, light and
dark, on canvas, tinted and velvet, with Matt's written go or no-go.

- [ ] **Palette tokens and surface scopes** — add the mid-tone surfaces, plum and verdigris families and focus tokens, and generate the `data-surface` blocks
  - Accept: `colors.json` and `colors.dark.json` gain `color.surface.tinted`, `color.surface.velvet`, `color.plum.{default,muted,text-on}`, `color.verdigris.{default,muted,text-on}`, `color.focus.ring` and `color.focus.gap`, each with light and dark values (PRD 2). New `colors.surfaces.json` holds the tinted and velvet scopes with the keys in architecture.md § Token scope data. `generate-colors-css.ts` emits the four blocks per scope (`[data-surface]`, dark, and nested light island). `--rialto-focus-ring` and `--rialto-focus-gap` default to today's accent and surface values, so the generated `:root` and `[data-theme="dark"]` values of every existing token are unchanged. `assertTokenParity` fails when a scope's light and dark keys differ.
  - Test first: `packages/rialto/src/tokens/colors-theme-scope.test.ts` (new cases: the scope blocks exist and re-declare `--rialto-surface`, focus-gap, text, border and focus-ring) and `packages/rialto/scripts/lib/color-tokens.test.ts` (parity rejects a scope missing a dark key)
  - Files: `packages/rialto/src/tokens/colors.json`, `colors.dark.json`, `colors.surfaces.json` (new), `colors.css` (generated), `packages/rialto/scripts/generate-colors-css.ts`, `packages/rialto/scripts/lib/color-tokens.ts`, `packages/rialto/scripts/generate-figma-tokens.ts` if it enumerates families, `.changeset/*.md`
  - Blocked by: —
- [ ] **Contrast coverage for every new pair** — extend the contrast test over the new tokens and every surface scope
  - Accept: `token-contrast.test.ts` checks, in light and dark: plum and verdigris as text on canvas, elevated, recessed and tinted, against their muted tints, and their text-on tokens on them; a data-driven loop over `colors.surfaces.json` checking text-primary, -secondary and -tertiary at 4.5:1 and border at 3:1 against the band; the focus ring at 3:1 against both the focus gap and the band. The dark muted tints are computed and asserted here. The test passes (PRD 3).
  - Test first: `packages/rialto/src/test/token-contrast.test.ts` (new cases written before any candidate value is adjusted to pass them)
  - Files: `packages/rialto/src/test/token-contrast.test.ts`, token JSON values if a candidate fails
  - Blocked by: Palette tokens and surface scopes
- [ ] **Derived tokens re-resolve on scope elements** — Tier-3 tokens and the focus shadow follow `[data-surface]` and `[data-palette]` scopes (ADR-035)
  - Accept: the selector of `component-tokens.css` becomes `:root, [data-surface], [data-palette]` (not yet `[data-theme]`, which lands in Milestone 2). `shadows.css` gains one rule on the same selector declaring `--rialto-shadow-focus` from `--rialto-focus-gap` and `--rialto-focus-ring`, replacing the two copies under `:root` and `[data-theme="dark"]`. Outside a scope every computed value is unchanged, so no existing visual baseline moves.
  - Test first: `packages/rialto/src/tokens/derived-token-scope.test.ts` (new; parses both sheets and asserts the selector list and that the focus shadow is declared once from the two focus tokens)
  - Files: `packages/rialto/src/tokens/component-tokens.css`, `packages/rialto/src/tokens/shadows.css`, `.changeset/*.md`
  - Blocked by: Palette tokens and surface scopes
- [ ] **Scoped signature remap** — the ux.md kill-test mapping as Tier-3 re-points under `[data-palette="signature"]`
  - Accept: a block selected by `[data-palette="signature"]` (commented `@internal`, not documented as public API) re-points the Button secondary and ghost, Input caret, selection and hover border, Select highlighted option, and Tabs track and hover tokens per ux.md § Kill-test mapping and architecture.md § Signature remap. Where Card and Tabs read a semantic token directly, a Tier-3 token is added with today's value and the component points at it, value-identical. Primary, focus and selected stay gold. Outside the scope no computed value changes.
  - Test first: `packages/rialto/src/tokens/signature-remap.test.ts` (new; asserts each remapped Tier-3 token resolves to the plum, plum-muted or tinted token inside the scope and to today's value outside it, and that no gold-rule token is remapped)
  - Files: `packages/rialto/src/tokens/component-tokens.css`, `packages/rialto/src/components/Card/*.module.css`, `packages/rialto/src/components/Tabs/*.module.css`, `.changeset/*.md`
  - Blocked by: Derived tokens re-resolve on scope elements
- [ ] **Kill-test board story and screenshots** — the before/after board Matt judges
  - Accept: `SignaturePalette.stories.tsx` renders rows Button, Input, Select, Card and Tabs, before and after, across light canvas, light tinted, velvet, dark canvas and dark tinted (ux.md § Kill-test board). Each row's caption lists its contrast-critical pairs read from the same JSON the contrast test reads. The story is not in `src/test/visual/visual.spec.ts`'s list and no PNG is committed. Light and dark screenshots are taken with a one-off Playwright run against the branch's Storybook and kept outside the repo for the gate issue (PRD 1).
  - Test first: `packages/rialto/src/stories/SignaturePalette.test.tsx` (new; renders the story, asserts five rows by five columns, after cells inside `data-palette="signature"`, band cells carrying `data-surface`, and caption ratios equal to the values computed from the token JSON)
  - Files: `packages/rialto/src/stories/SignaturePalette.stories.tsx` (new), `packages/rialto/src/stories/SignaturePalette.test.tsx` (new)
  - Blocked by: Scoped signature remap, Contrast coverage for every new pair
- [ ] **HUMAN GATE: Palette kill test go/no-go** — open the `ready-for-human` issue and stop for Matt's answer
  - Accept: a GitHub issue titled "Palette kill test: go or no-go", labelled `ready-for-human`, assigned to Matt, carries the light and dark board screenshots and the kill-test PR link (ux.md Flow A). It asks for "go" or "no-go: <reason>" and, on a no-go, whether the audit (Milestone 3) and service-aware mode (Milestone 4) go ahead. The checkbox is ticked only when Matt's written reply is on the issue; the reply is quoted in Notes. No other component's styling changes before that reply (PRD 1).
  - Test first: not applicable (process gate, no code)
  - Files: none in the repo; Notes below records the issue number and verdict
  - Blocked by: Kill-test board story and screenshots

## Milestone 2: Palette promotion — the signature palette is the default (lane P, only on a go)

Demonstrable: rialto Storybook, rialto-web and hospitality render the
signature palette with no scope attribute, with fresh Linux baselines.

- [ ] **Promote the remap to `:root`** — make the signature remap the default and widen re-resolution to `[data-theme]`
  - Accept: the remap declarations move into the `:root` block of `component-tokens.css` and the `[data-palette="signature"]` selector is deleted. The re-resolution selector becomes architecture.md's full list, `:root, [data-theme], [data-surface], [data-palette]`. Inside a nested light island the Tier-3 tokens and focus ring now take the island's light values (architecture.md § Accepted behaviour changes). The kill-test board's after cells render without the attribute. Any candidate hex Matt asked to retune in his go reply is applied, and the contrast test still passes (PRD 2, 3).
  - Test first: `packages/rialto/src/tokens/signature-remap.test.ts` (updated: remapped tokens resolve to plum, plum-muted or tinted at `:root`, and no `[data-palette]` selector remains) and `derived-token-scope.test.ts` (updated: a nested `data-theme="light"` island inside dark resolves `--rialto-input-border-focus` to the light accent)
  - Files: `packages/rialto/src/tokens/component-tokens.css`, `packages/rialto/src/stories/SignaturePalette.stories.tsx`, its test, token JSON if retuned, `.changeset/*.md`
  - Blocked by: HUMAN GATE: Palette kill test go/no-go
- [ ] **Regenerate rialto baselines** — dispatch the regen for the rialto Storybook suite
  - Accept: after the promotion PR merges, `gh workflow run visual-baseline-regen.yml -f app=rialto` runs on main and its `needs-review` PNG PR is opened; the changed shots are exactly those listed under Accepted behaviour changes (secondary and ghost Button, Input, Select, Tabs and their dependents). Merging the PNG PR is Matt's call.
  - Test first: not applicable (the regen workflow's compare-mode run is the check)
  - Files: `packages/rialto/**/__screenshots__/**` via the workflow's PR only
  - Blocked by: Promote the remap to `:root`
- [ ] **Regenerate rialto-web baselines** — dispatch the regen for rialto-web
  - Accept: `gh workflow run visual-baseline-regen.yml -f app=rialto-web` on main, after the rialto PNG PR merges; PNG PR opened with only palette-attributable diffs.
  - Test first: not applicable
  - Files: `apps/rialto-web/**` screenshots via the workflow's PR only
  - Blocked by: Regenerate rialto baselines
- [ ] **Regenerate hospitality baselines (palette)** — dispatch the regen for hospitality
  - Accept: `gh workflow run visual-baseline-regen.yml -f app=hospitality` on main, after the rialto-web PNG PR merges; PNG PR opened with only palette-attributable diffs. Until it merges, no other baseline-flipping PR is opened.
  - Test first: not applicable
  - Files: `apps/hospitality/**` screenshots via the workflow's PR only
  - Blocked by: Regenerate rialto-web baselines

## Milestone 3: Current audit, zero open critical or serious findings (lane A)

Demonstrable: `ui-audit.md` has a dated row for every exported component,
every 2026-05-16 finding is re-checked, and the coverage test proves no
critical or serious finding is open.

- [ ] **Freeze the 2026-05-16 findings** — extract the old audit's findings into a fixture
  - Accept: `src/test/fixtures/ui-audit-2026-05-16.json` lists every finding of the 2026-05-16 audit, extracted from `git show <sha>:packages/rialto/docs/ui-audit.md` (the sha recorded in the fixture), with component and text per finding; the count matches the old document.
  - Test first: `packages/rialto/src/test/audit-coverage.test.ts` (first case: the fixture parses and has one entry per finding of the old document at that sha)
  - Files: `packages/rialto/src/test/fixtures/ui-audit-2026-05-16.json` (new), `packages/rialto/src/test/audit-coverage.test.ts` (new)
  - Blocked by: HUMAN GATE: Palette kill test go/no-go
- [ ] **Audit-coverage contract** — the test that makes the audit's shape a contract
  - Accept: `audit-coverage.test.ts` parses the Summary table, Findings lines and Re-check table (architecture.md § Audit document) and fails, with the line number, when: an exported component has no row or a row names a non-exported one; an `Audited` date is before 2026-11-25; a severity or status is outside the allowed sets; a `fixed` critical or serious finding names a test file that does not exist; an `open` moderate or minor finding has no `#NNNN`; the Re-check table does not have exactly one row per fixture finding (PRD 4, 5). It never skips. The "no open critical or serious" check is deferred to the last fix item.
  - Test first: same file; each failure mode gets a case run against an inline malformed doc before the parser exists
  - Files: `packages/rialto/src/test/audit-coverage.test.ts`
  - Blocked by: Freeze the 2026-05-16 findings
- [ ] **Audit rows A–C** — audit the exported components whose names start A to C
  - Accept: each has a row dated on or after 2026-11-25 covering accessibility, visual and interaction, with every finding as an `RA-<Component>-<n>` line carrying a severity per the PRD's severity assumption (axe impact, or a WCAG 2.2 A/AA failure counted serious). Old findings for these components are re-checked as `fixed`, `open` or `obsolete`.
  - Test first: `audit-coverage.test.ts` (fails on the missing rows until all four batches land)
  - Files: `packages/rialto/docs/ui-audit.md`
  - Blocked by: Audit-coverage contract
- [ ] **Audit rows D–L** — same, for components D to L
  - Accept: as Audit rows A–C, for this range.
  - Test first: `audit-coverage.test.ts`
  - Files: `packages/rialto/docs/ui-audit.md`
  - Blocked by: Audit rows A–C
- [ ] **Audit rows M–S** — same, for components M to S
  - Accept: as Audit rows A–C, for this range.
  - Test first: `audit-coverage.test.ts`
  - Files: `packages/rialto/docs/ui-audit.md`
  - Blocked by: Audit rows D–L
- [ ] **Audit rows T–Z and the Re-check table** — the last batch, and the re-check of every old finding including obsolete ones (for example GenCopilot)
  - Accept: `audit-coverage.test.ts` passes with every row present and exactly one Re-check row per fixture finding (PRD 4, 5). The audit PR is opened at this point; critical and serious findings may still be `open`.
  - Test first: `audit-coverage.test.ts`
  - Files: `packages/rialto/docs/ui-audit.md`
  - Blocked by: Audit rows M–S
- [ ] **File moderate and minor findings** — one GitHub issue per open moderate or minor finding
  - Accept: every `open` moderate or minor finding line carries the `#NNNN` of its filed issue, and `audit-coverage.test.ts` passes (PRD 6).
  - Test first: `audit-coverage.test.ts` (the missing-issue-reference case fails until the references exist)
  - Files: `packages/rialto/docs/ui-audit.md`
  - Blocked by: Audit rows T–Z and the Re-check table
- [ ] **Fix carried-over serious findings** — the known structural and keyboard defects from 2026-05-16
  - Accept: if the re-check rates them critical or serious: Navbar and Tag nested interactives, Slider arrow keys moving two steps, Timeline colour-only status, missing `aria-live` on async changes, and clicks bound to `role="presentation"` wrappers are fixed; each audit line is `fixed` and names its pinning test; each pinning test fails with the fix reverted (PRD 6). Any rialto baseline these fixes flip is regenerated per the baseline rule before the next baseline-flipping PR.
  - Test first: per component: axe case for structure (Navbar, Tag, presentation wrappers), a testing-library `userEvent` keyboard test that one ArrowRight moves Slider by one step, an aria-live assertion for the async components, a non-colour status indicator assertion for Timeline
  - Files: `packages/rialto/src/components/{Navbar,Tag,Slider,Timeline,...}/**` plus their tests, `packages/rialto/docs/ui-audit.md`, `.changeset/*.md`
  - Blocked by: Audit rows T–Z and the Re-check table
- [ ] **Fix newly found critical and serious findings** — every remaining critical or serious finding from the new audit, in PRs of at most five components
  - Accept: each finding is `fixed` with a pinning test that fails without the fix, chosen by the architecture's rule (axe for structure, behaviour test for keyboard and live regions, motion guard tests for height or padding animation). Where a fix needs `forced-colors` or `prefers-contrast` handling, only that case is handled. If the audit finds none beyond the carried-over set, this item is ticked with that fact in Notes.
  - Test first: one failing test per finding, named in its audit line
  - Files: `packages/rialto/src/components/**` per finding, `packages/rialto/docs/ui-audit.md`, `.changeset/*.md`
  - Blocked by: Fix carried-over serious findings
- [ ] **Zero-open check** — turn on the last audit-coverage check in the PR carrying the last critical or serious fix
  - Accept: `audit-coverage.test.ts` fails on any `open` critical or serious line and passes on main; `src/test/accessibility/a11y-matrix.test.tsx` reports no critical or serious violation (PRD 6).
  - Test first: `audit-coverage.test.ts` (new case, RED while one critical or serious finding is still open, GREEN with the last fix)
  - Files: `packages/rialto/src/test/audit-coverage.test.ts`
  - Blocked by: Fix newly found critical and serious findings

## Milestone 4: Service-aware mode — the hospitality app reads the room (lane S)

Demonstrable: rehearsal Timeline moves calm → building → rush → settling →
calm as simulated covers climb and fall, with no setting and no control
moving.

- [ ] **Service-phase policy** — `loadRatio`, `initialPhase`, `nextPhase` with the config table
  - Accept: pure modules (no React, no `@mbe/types`, no clock) implement architecture.md § Phase machine config exactly. A rising load enters rush and a falling one leaves it (PRD 7). A load oscillating across 0.90 and 0.75 inside the dwell windows never flips the phase back and forth (PRD 9). `seats === 0` gives calm; an `at` before `enteredAt` re-seeds through `initialPhase`; a stale sample does not move the machine.
  - Test first: `apps/hospitality/src/service-phase/phase-machine.test.ts` (rising, falling, oscillation, zero seats, clock step back, stale) and `load.test.ts`
  - Files: `apps/hospitality/src/service-phase/load.ts`, `phase-machine.ts` (new) and their tests
  - Blocked by: HUMAN GATE: Palette kill test go/no-go
- [ ] **Rehearsal load adapter and calibration** — `rehearsalLoadSample` plus the spike rows as assertions
  - Accept: `rehearsalLoadSample(state, tables, minute)` builds a `ServiceLoadSample` from `RehearsalState`. Running the machine at 1-minute steps over `simulateService` reproduces the spike: every friday seed enters rush exactly once and stays at least 90 min; no weeknight seed spends more than 75 min in rush; no phase lasts under 5 min; no service enters rush twice (PRD 9).
  - Test first: `apps/hospitality/src/service-phase/phase-calibration.test.ts` and `rehearsal-load.test.ts`
  - Files: `apps/hospitality/src/service-phase/rehearsal-load.ts` (new) and tests
  - Blocked by: Service-phase policy
- [ ] **PaintScope and the paint-token allowlist** — the rialto primitive that paints a subtree without a box (ADR-034)
  - Accept: `PaintScope` renders a `display: contents` div with `data-ambient` (default `"full"`) and inline overrides merged with reduced-motion zeroing last; it never throws without a provider (ADR-025). `PAINT_TOKENS` holds every colour token from `colors.json`, the `--rialto-shadow-*`, six `--rialto-duration-*` and two `--rialto-ease-*` tokens; `PaintOverrides` rejects `--rialto-space-md` at `tsc`. The static geometry test passes: no paint token is declared in `spacing.css`, `typography.css` or `radius.css`, each is declared in `colors.css` or `shadows.css`, and no `*.module.css` under `packages/rialto/src` or `apps/hospitality/src` uses one in a geometry longhand (PRD 8, 10). Exported from `@mattbutlerengineering/rialto/providers`.
  - Test first: `packages/rialto/src/providers/__tests__/PaintScope.test.tsx` (no-provider render, reduced-motion precedence, no added box or role) and `packages/rialto/src/providers/paint-scope.geometry.test.ts`, plus a `// @ts-expect-error` line for a spacing key
  - Files: `packages/rialto/src/providers/PaintScope.tsx`, `paint-tokens.ts` (new), `packages/rialto/src/providers/index.ts`, generated exports if `generate-exports.ts` covers providers, `.changeset/*.md`
  - Blocked by: HUMAN GATE: Palette kill test go/no-go
- [ ] **Ambient obeyers** — NeonSign honours `data-ambient`
  - Accept: under `[data-ambient="quiet"]` NeonSign's tube animation and bloom stop while its open-state lighting stays; under `"dim"` its glow layer is at half opacity (ux.md review High).
  - Test first: `packages/rialto/src/components/NeonSign/NeonSign.ambient.test.ts` (parses the module CSS for the two `:global([data-ambient])` rules and asserts the quiet rule sets `animation: none` without touching the open-state colour)
  - Files: `packages/rialto/src/components/NeonSign/NeonSign.module.css`, test, `.changeset/*.md`
  - Blocked by: PaintScope and the paint-token allowlist
- [ ] **Live load adapter** — `useLiveServiceLoad()` over tables and today's reservations
  - Accept: reads `useTables` and `useReservations` for the service day from `useStaffTonight` (limit 200), ticks with `useNow(30_000)`, returns `null` until both queries first resolve, and marks the sample `stale` when SSE is disconnected or data came from the offline cache. Cancelled, no-show and completed reservations are excluded from `coversDueSoon`; the window is 30 min. No new network call.
  - Test first: `apps/hospitality/src/service-phase/useLiveServiceLoad.test.tsx` (renderHook with mocked queries: null before resolve, counts, status exclusions, stale on SSE down, viewed date ignored)
  - Files: `apps/hospitality/src/service-phase/live-load.ts`, `useLiveServiceLoad.ts` (new) and test
  - Blocked by: Service-phase policy
- [ ] **Phase driver** — `useServicePhase(sample, { announce })`
  - Accept: steps the machine per sample; holds a pending change while `[aria-modal="true"]` exists or an input, textarea, select or contenteditable is focused, re-checking every 1 s, applying 3 s after busy ends and anyway after 60 s; holds 10 min on stale samples then feeds `load = 0`; announces once per applied change, never on mount, on entering building or on building → calm; listens for `mbe:force-service-phase` only when `import.meta.env.DEV` (PRD 7). Timers clear on unmount.
  - Test first: `apps/hospitality/src/service-phase/useServicePhase.test.tsx` (fake timers: defer while dialog open, 3 s settle, 60 s cap, stale hold, announcement rules, no listener when DEV is false)
  - Files: `apps/hospitality/src/service-phase/useServicePhase.ts` (new) and test
  - Blocked by: Service-phase policy
- [ ] **ServicePhaseScope, PhaseSlot and phase paint** — paint the applied phase and reserve the label's width
  - Accept: `PHASE_PAINT: Record<ServicePhase, PaintOverrides>` and `PHASE_AMBIENT` per ux.md § Phases; `ServicePhase.module.css` keys the header band `::before`, the verdigris `::after` ring on `[data-service-priority]` (solid outline under `prefers-contrast: more`, `Highlight` outline under `forced-colors: active`) and de-emphasised titles on `[data-service-phase]`, opacity-only transitions (ADR-033 limit 8). `PhaseSlot` stacks four labels in one grid cell, current visible, others `visibility: hidden` and `aria-hidden`, empty but full width before the first sample. Labels, three announcements and the "Service: {{phase}}" frame exist in en-US, es-MX and fr-CA (en-GB only where wording differs).
  - Test first: `apps/hospitality/src/service-phase/PhaseSlot.test.tsx` (all four labels in the DOM, only current exposed to assistive tech) and `ServicePhaseScope.test.tsx` (scope element present in every phase, `data-service-phase` matches, no DOM node added or removed across a phase change)
  - Files: `apps/hospitality/src/service-phase/ServicePhaseScope.tsx`, `PhaseSlot.tsx`, `phase-paint.ts`, `ServicePhase.module.css` (new), hospitality i18n catalogs
  - Blocked by: PaintScope and the paint-token allowlist, Phase driver, Ambient obeyers
- [ ] **Wire Timeline and Dashboard** — mount adapter, driver and scope on the live pages
  - Accept: `LiveTimelinePage` and `HomePage` each mount one `useLiveServiceLoad`, one `useServicePhase` and one `ServicePhaseScope` with a `PhaseSlot` in the header; Timeline reuses its `LiveStatus`; HomePage gains `useStatusMessage()` and exactly one `LiveStatus`. `data-service-priority` is set from time alone on the now-line, Covers KPI, reservation blocks starting within 30 min on today's view, and Dashboard's Upcoming and Waitlist stats. No toggle or setting exists (PRD 7).
  - Test first: `apps/hospitality/src/pages/__tests__/TimelinePage.service-phase.test.tsx` and `HomePage.service-phase.test.tsx` (scope and slot render; exactly one live region; priority attributes independent of phase)
  - Files: `apps/hospitality/src/pages/TimelinePage.tsx`, `apps/hospitality/src/pages/HomePage.tsx`, related tests
  - Blocked by: ServicePhaseScope, PhaseSlot and phase paint, Live load adapter
- [ ] **Wire rehearsal** — the demo path behind no login
  - Accept: `RehearsalNight` mounts the rehearsal adapter, the driver, the scope, a `PhaseSlot` beside `RehearsalPlaybackBanner` and one `LiveStatus`. Playing a friday rehearsal moves the slot calm → building → rush → settling → calm with no input (PRD 11).
  - Test first: `apps/hospitality/src/components/rehearsal/RehearsalTimeline.service-phase.test.tsx` (advancing the simulated minute through a friday seed applies each phase in order and announces rush once)
  - Files: `apps/hospitality/src/components/rehearsal/RehearsalTimeline.tsx` and test
  - Blocked by: Wire Timeline and Dashboard, Rehearsal load adapter and calibration
- [ ] **Geometry and reduced-motion spec** — prove nothing moves under a host's hands
  - Accept: `service-phase-geometry.spec.ts` on the `mockedPage` fixture covers `/timeline`, `/dashboard` and `/timeline?rehearsal=true` (paused) with `page.clock` fixed; for calm → building → rush → settling → calm it dispatches the forced-phase event and asserts every visible interactive element's list length, order and `x, y, width, height` equal the calm snapshot at 0, 600 and 1300 ms (PRD 8). A second pass under `reducedMotion: "reduce"` also asserts `document.getAnimations()` is empty after each change, and the existing motion guard tests stay green (PRD 10). Hospitality E2E is advisory, so the spec's run result is recorded in the PR body for Verify.
  - Test first: the spec itself, run once against a deliberately geometry-moving phase override to see it fail
  - Files: `apps/hospitality/e2e/service-phase-geometry.spec.ts` (new)
  - Blocked by: Wire rehearsal
- [ ] **Regenerate hospitality baselines (calm slot)** — the "Service: Calm" text flips Timeline and Dashboard shots
  - Accept: after the page-wiring PRs merge and no other baseline-flipping PR is open, `gh workflow run visual-baseline-regen.yml -f app=hospitality` runs on main; its PNG PR's diffs are only the phase slot on Timeline and Dashboard.
  - Test first: not applicable
  - Files: `apps/hospitality/**` screenshots via the workflow's PR only
  - Blocked by: Wire Timeline and Dashboard, Regenerate hospitality baselines (palette) (on a go; on a no-go only the former)

## Milestone 5: Proof — the demo and the verdict board are ready for Verify and Ship

Demonstrable: a recorded rehearsal run of the demo, and the Rialto scenes for
the uniqueness verdict.

- [ ] **Demo dry run** — run PRD criterion 11 as written on rehearsal
  - Accept: a local run of `/timeline?rehearsal=true` on a friday seed shows the signature palette (on a go) and the phase moving calm → rush → calm with no input; screenshots of quiet and rush moments are attached to the run's last PR body for Verify (PRD 11).
  - Test first: not applicable (Wire rehearsal's test pins the behaviour; this is evidence)
  - Files: none in the repo
  - Blocked by: Wire rehearsal, Regenerate hospitality baselines (calm slot)
- [ ] **Verdict board scenes** — the Rialto column of ux.md § Verdict board
  - Accept: Rialto screenshots for "Host stand, light", "Host stand, dark", "Form: Input+Select+Button" and "Tabs + Card" are captured at one fixed viewport from the rehearsal Timeline in rush and the kill-test primitives, kept outside the repo, ready for Ship to attach to the uniqueness-verdict issue (PRD 12). Matt's verdict itself is collected at Ship and Operate, not here.
  - Test first: not applicable
  - Files: none in the repo
  - Blocked by: Demo dry run

## Follow-up issues to file

The orchestrator files these after reporting to Matt. Not created here.

- **Rialto: visual restyle batches beyond the signature palette** — Component restyles that token remaps cannot reach, deferred from rialto-signature-pass (PRD out of scope).
- **Rialto: add RadioGroup** — New accessible radio group component, listed as missing in the rialto-signature-pass audit scope.
- **Rialto: add Switch** — New accessible switch (role=switch) component, deferred from rialto-signature-pass.
- **Rialto: add Spinner** — New loading spinner with reduced-motion handling, deferred from rialto-signature-pass.
- **Rialto: add Toolbar** — New toolbar with roving tabindex, deferred from rialto-signature-pass.
- **Rialto: add Listbox** — New standalone listbox component, deferred from rialto-signature-pass.
- **Rialto: add TagsInput** — New tags input component, deferred from rialto-signature-pass.
- **Rialto: add FileUpload/Dropzone** — New file upload and drop zone component, deferred from rialto-signature-pass.
- **Rialto: add VisuallyHidden** — New visually-hidden utility component for screen-reader-only text, deferred from rialto-signature-pass.
- **Rialto: blanket forced-colors and prefers-contrast support** — Support beyond the cases rialto-signature-pass's critical and serious fixes needed (PRD out of scope).

## Design gaps found

None. The architecture names every component, contract and file; the one
open PRD question owned here (baseline churn) is answered in the
assumptions.

## Notes

- 2026-11-25: Uniqueness verdict (PRD 12) is collected by Ship's
  `ready-for-human` issue and judged at Operate; this breakdown only prepares
  its Rialto scenes (Milestone 5).
