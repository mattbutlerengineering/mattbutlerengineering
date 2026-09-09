---
stage: review
run: feature:hospitality-animations
date: 2026-08-31
tracking: "#4746"
reviewed-head: "66deee3ac"
assumptions:
  - "Severity policy (orchestrator's, logged here): critical → fix required before Ship (Review does not fix; the orchestrator routes to Implement); major → fix required unless the fix would expand the run's scope or touch out-of-scope files, then deferred and surfaced to the human; minor → deferred with a one-line reason or noted as follow-up."
  - "No partial review.md existed from the rate-limited prior dispatch (`git status` showed only the six earlier run docs); this artifact is written fresh."
  - "The diff reviewed is `500affc76..66deee3ac` (merge-base with `origin/main`). origin/main had advanced ≥4 commits (#4766–#4769) past that base at Verify time; those commits are not reviewed here — the PR-time `CI Gate` is where that combination is exercised."
  - "Specialist reviewer outputs (adr-compliance 0 findings, prop-drift none, generated-artifact-determinism PASS) were treated as leads; every claim relied on below was re-verified in this session (regen --check re-run, targeted suites re-run, prop usage and selectors re-read)."
  - "Runtime behaviour of `deriveVenueOpenState` / `formatLocalTime` on hostile and boundary inputs was probed via a scratchpad esbuild bundle importing the real worktree sources by absolute path (type-only `@mbe/types` import erased by the bundler); no tracked file was touched. Probe script: scratchpad `review-probe/probe.ts`."
  - "Generated hunks (root + hospitality `llms*.txt`, `packages/rialto/package.json` exports, `registry.json`) were excluded from the correctness pass and accepted as generator output on two grounds: this session's `pnpm regen --check` → 'All generated artifacts are up to date.' at `66deee3ac`, and the determinism reviewer's byte-comparator audit."
---

# Review: Neon OPEN sign (hospitality-animations)

## Scope

Nine commits on `worktree-hospitality-animations` — 8 feature commits
(#4738–#4745), the merge of `origin/main`, and the cascade fix
`66deee3ac` — reviewed as `git diff 500affc76 66deee3ac`: 36 files,
+1964/−7. Every hand-written file was read in full:

- `apps/hospitality`: `utils/venueOpenState.ts`, `utils/venueOpenLabel.ts`,
  `utils/format.ts` (`formatLocalTime`), `hooks/useNow.ts`,
  `components/PageHeader.{tsx,module.css}`, `pages/HomePage.tsx`, their five
  test files, `CLAUDE.md` row.
- `packages/rialto`: `NeonSign/{NeonSign.tsx, NeonSign.module.css,
NeonSign.test.tsx, NeonSign.motion.test.tsx, NeonSign.cascade.test.ts,
NeonSign.stories.tsx, index.ts}`, barrel, a11y fixture + matrix entries,
  changeset.
- `apps/rialto-web`: `pages/data/NeonSignPage.tsx`, `page-registry.ts` +
  its test's mock line, `manifest-drift.test.ts`.
- Generated (excluded from correctness, confirmed generator output — see
  assumptions): root/hospitality `llms*.txt`, rialto exports map,
  `registry.json`.

Independent evidence gathered this session at `66deee3ac`:

- `pnpm --dir packages/rialto test -- --run src/components/NeonSign` →
  3 files, 23/23 (incl. the 4 cascade-guard cases).
- Hospitality targeted run (venueOpenState / venueOpenLabel / format /
  useNow / PageHeader / HomePage) → 6 files, 96/96.
- Root `pnpm regen --check` → clean.
- Runtime probe (14 checks, run twice — machine TZ and `TZ=Asia/Tokyo`,
  byte-identical output): hostile `operatingHours` shapes
  (`{monday: "nonsense"}`, `{monday: 5}`, `{open: 9, close: null}`, unknown
  extra keys) → `unset`/correct state, never a throw; overnight spill at
  exactly its close (Sat 02:00 on Fri 18:00–02:00) → not open (half-open
  holds on the spill side); overnight window later today at a 30-min lead →
  `opening-soon`; Mon 16:00–01:00 read at Tue 00:30 → `open` until 01:00 via
  yesterday's schedule; a schedule whose only day has `open === close` →
  `unset`; lead of exactly 60 → `opening-soon` (inclusive, the architecture's
  call); `Etc/UTC` accepted; the input `Date` is not mutated;
  `formatLocalTime` TZ-invariant (closes breakdown #4739's unexecuted
  `TZ=Asia/Tokyo` sub-clause from verification's "Not verified" list).

## Findings

No critical findings. No major findings. Four minors, all deferred or
routed — none blocks Ship.

### Minor: sibling instruments unmeasured for the reduced-motion cascade defect this run fixed

- Scenario: verification pass 1 measured that NeonSign's
  `.reduced .tube { animation: none }` (0,2,0) lost to its state-scoped
  animation rules (0,3,0), so a reduced-motion user got the flicker. The
  same `.reduced .x { animation: none }` shape ships in `Handshake`
  (`Handshake.module.css:155`, `._reduced_gulba_155 ._pulse_gulba_126` in
  the hospitality bundle) and `WatchLoader`; whether their animated
  selectors outrank their reduced rules was explicitly not measured in
  either verify pass. If any does, a reduced-motion user gets the shuttle
  on `LoginGate` or the spin on `LoadingPage` while the root reports
  `data-reduced-motion="true"`. The new `NeonSign.cascade.test.ts` guards
  only NeonSign's sheet. (Mitigating: Handshake renders the pulse `<span>`
  only while `negotiating`, so part of its motion is DOM-gated, not
  CSS-gated.)
- Decision: deferred — measuring/fixing touches files this run's brief
  freezes (`WatchLoader/**` carries the owner's uncommitted edits in the
  main checkout; `Handshake` belongs to the just-shipped #4720 surface).
  Surface to human; seed a maintenance run to measure both siblings and,
  if warranted, generalise the cascade guard beyond one component.

### Minor: showcase intro sentence is Implement's own wording, still awaiting the flag for UX override

- Named contract: breakdown #4744's acceptance — "intro sentence flagged
  for UX override in the PR". ux.md left the description unspecified
  ("An instrument for a venue's trading state … (description)");
  `NeonSignPage.tsx:105` is agent-authored copy. No PR exists yet, so the
  flag has not been raised anywhere a human will see it.
- Decision: routed to Ship — the PR body must call the sentence out for UX
  override. Not a code change.

### Minor: pre-existing `packages/rialto/CLAUDE.md` showcase/a11y guidance is stale (flagged, not fixed)

- Named decayed contract: the doc mandates "three touch points:
  `apps/rialto-web/src/routes.tsx`, … `data/nav-sections.ts`" and "an
  axe-core entry in the relevant `*.accessibility.test.tsx`". Measured in
  this run (and by the brief): the sole showcase touchpoint is
  `page-registry.ts`, and a11y coverage lives in
  `component-fixtures.tsx` + `a11y-matrix.test.tsx`. The run followed the
  real pattern, so the doc now disagrees with two shipped components
  (Handshake, NeonSign).
- Decision: deferred — pre-existing outside the diff; surgical-changes rule
  says flag, don't fix. Route to `/claude-md-improver` or a backlog seed.

### Minor: `Handshake` remains absent from `manifest-drift.test.ts` `DATA_COMPONENTS`

- Named contract: that list's own comment requires every data-category page
  component. The run appended `"NeonSign"` correctly but the pre-existing
  `Handshake` hole (noted at #4720 and again in breakdown § Design gaps)
  stays open, so Handshake's manifest props can silently go stale.
- Decision: deferred — breakdown #4744 explicitly leaves it alone; one-line
  follow-up for any future rialto-web touch.

## Examined and explicitly not findings

- **`...rest` spread after `role`/`data-state`** (`NeonSign.tsx:64-72`): a
  consumer could clobber `role="img"`. Byte-for-byte the `Handshake`
  ordering — the codebase's own instrument pattern, so not a decayed
  contract. Family-wide trait, noted only.
- **`:where()` re-rank audit** (the cascade fix's blast radius): the only
  selectors lowered are the two animating tube rules (0,3,0 → 0,2,0). They
  still outrank the base `.tube` (0,1,0) for color/halo; the wash
  (`.housing::before`), `unset` housing/tube, size and caption rules are
  untouched and never co-match a lowered rule's target; the reduced
  `opacity: 0.8` (0,4,0 class path / 0,3,0 media path) still wins over the
  breathe. No other rule relied on the old ordering. The `both` fill is
  moot under `animation: none` (opacity falls back to the cascade value).
- **Caption double-announcement**: the caption sits inside the
  `role="img"` root (presentational children) _and_ carries
  `aria-hidden="true"` — announced once, and `showCaption={false}` leaves
  `aria-label` intact (`NeonSign.test.tsx:26-32`). Matches ux.md's
  "one fact, announced once".
- **Caption centring & `showCaption` instead of a `caption` prop**: both
  diverge from ux.md's letter (end-aligned caption; optional `caption`
  string) and both are documented architecture assumptions with rationale
  (caption ≡ aria-label true by construction). Documented deviations, not
  findings.
- **`formatLocalTime` hard-codes `en-US` + `timeZone: "UTC"`**: stated
  contract (architecture § formatVenueOpenLabel; matches the file's
  existing `LOCALE` convention), probe-verified TZ-invariant.
- **`useNow` calls `setNow` inside the interval callback**: the rialto
  setState-in-effect ban does not apply (hospitality hook), and the call is
  event-driven, not effect-body sync — the breakdown pinned exactly this.
  Cleanup on unmount and restart-on-interval-change are test-pinned
  (`vi.getTimerCount()` 1 → 0).
- **HomePage derivation every render, no memo**: per architecture; the
  derivation is O(7) and pure; hooks are called unconditionally
  (`useNow`/`useVenue` above the branch), no stale closure — `now` flows
  from state.
- **Zone gate before the hours gate** (`venueOpenState.ts:123-127`): a
  venue with an unusable zone _and_ no hours renders no sign (not `unset`)
  — the PRD's ordering ("unusable timezone → no sign"; `unset` reserved
  for a venue with a usable clock).
- **DST tests are real, not tautological**: hand-written UTC instants with
  hand-computed expectations (`venueOpenState.test.ts:217-254`); the
  `pdt()` helper's fixed −07:00 offset is valid for every fixture date used.
- **Fake-timer hygiene**: both `useNow.test.ts` and the HomePage sign
  describe-block pair `vi.useFakeTimers()` with `afterEach(vi.useRealTimers)`;
  the 11 pre-existing HomePage cases run outside the fake-timer scope.
- **Showcase replay/playground**: `setInterval` cleaned up in the effect
  return, index wrapped by modulo (the `!` assertion is sound),
  `key={replayNonce}` bumps only on the `open` pick — the instrument itself
  never restarts an animation on re-render, exactly the architecture's
  split.
- **Verification's "DataList rows verbatim" gap**: closed here — the six
  Accessibility rows in `NeonSignPage.tsx:156-176` match ux.md's table
  (sentence-case initial letters only).
- **`.sizeMd` redundantly re-declares `--neon-tube`**
  (`NeonSign.module.css:36`): duplicate of the `.neonSign` default the
  architecture said the class wouldn't carry; zero behavioural effect.
  Cosmetic note only.

## Passes with no findings

- **Correctness** — clean. The derivation matches every PRD/architecture
  contract read against the code and re-executed: half-open `[open, close)`
  on both the daytime and overnight-spill sides, overnight precedence
  (today's window wins), closed-day/missing-day skipping with the
  same-weekday week wrap, inclusive 60-minute lead, malformed-day
  skip-never-throw, `unset` on hours-absent and on all-invalid, `null` on
  every unusable-zone shape (with the explicit string gate ahead of
  `Intl`'s silent `undefined` fallback), DST both directions, no input
  mutation. The probe added the hostile-shape and boundary cases the
  committed tests don't pin — all correct.
- **Security** — clean. No `dangerouslySetInnerHTML`, no secrets, no
  `console.log` in production code (grep over every changed source);
  `operatingHours`/`ianaTimezone` from the API are treated as untrusted and
  cannot throw into the render tree (probe); the label reaches the DOM only
  as React-escaped text/attribute; no network/auth surface touched; the
  diff adds nothing under `e2e/**` or `.github/**`, and F1's constrained
  paths (services, packages/types, auth surfaces, visual suites, lockfile)
  show a 0-line diff.
- **Design** — no undocumented deviation found. Files, names, and locations
  match architecture § Change surface exactly (plus the
  `page-registry.test.ts` mock line the breakdown added as a named design
  gap); hospitality's new imports use the `.js`-extension convention; CSS
  is tokens-only (colour-literal grep clean in both changed sheets), gold
  appears only inside the `opening-soon` block, logical properties
  throughout (`padding-block`/`padding-inline`, margins); `forwardRef` +
  exported `NeonSignProps` + required `aria-label` via
  `Omit<HTMLAttributes, "aria-label">`; no `useState`/`useEffect` in the
  instrument; the showcase page follows the `HandshakePage` shape; the
  changeset marks rialto `minor` in the house voice; every breakdown
  checkbox is checked and each deviation Implement made is logged where
  the protocol expects it.

## Verdict

**Ready to ship — no critical or major findings; the four minors are
deferred/routed above.** The Implement fix for verification's B2/B3 (the
reduced-motion cascade) is correctly built and guarded by a test shown RED
on the defective sheet.

Carry into Ship unchanged (known, not re-verified here): the PR /
`CI Gate` / branch-update against the advanced `origin/main` (F4 in
verification); the live hospitality dashboard behind Auth0 (deduced from
its bundle, never rendered); the advisory Hospitality E2E; the deployed
demo venue's `operatingHours`/`ianaTimezone` UNKNOWN (a human step — an
unset production venue will honestly show `unset`); the story files'
exclusion from `tsc` (pre-existing repo-wide config). Ship must also flag
the showcase intro sentence for UX override in the PR body (finding 2).
