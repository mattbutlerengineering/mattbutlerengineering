# Visual Regression Coverage — TapeChart + MasterOverride

**Date:** 2026-04-24
**Status:** Draft — awaiting user review
**Surfaced by:** rialto 0.1.12 TapeChart layout fix (commit `48d91e5`). The bug shipped because no visual coverage existed for the component; 388 jsdom tests passed against a broken CSS layout.

## Problem

`apps/rialto-web/e2e/visual.spec.ts` runs Playwright screenshot diffs against a `/visual-test` harness page (`apps/rialto-web/src/pages/visual-test/VisualTest.tsx`). The harness covers 41 sections (33 light + 8 dark) — most of the rialto component library. **TapeChart and MasterOverride are not in either list.**

Today's TapeChart layout bug (rooms rendered 2-per-row, day header wrapping) was visible to anyone looking at the page but invisible to the test runner. With visual coverage at the configuration that exposed it (24 rooms × 14 days), the bug would have failed the diff threshold the moment the broken CSS was committed.

## Design

### Sections to add

Five new sections — three for TapeChart, two for MasterOverride.

#### TapeChart — `tape-chart-default` (light)
Baseline configuration. 8 rooms × 7 days, ~10 reservations covering a mix of confirmed/checked-in/blocked statuses. Density `comfortable`, English locale. Renders the full grid view.

**Why:** small footprint baseline that diffs cleanly across machines.

#### TapeChart — `tape-chart-stress` (light)
Goal-backward configuration. **24 rooms × 14 days**, ~30 reservations. Density `comfortable`, English locale.

**Why:** this is the *exact* configuration that exposed the 0.1.11 → 0.1.12 layout bug. Without this section the regression class isn't covered. Generates a tall screenshot (estimated ~1500-2000 px tall, ~150 KB PNG); acceptable cost for the leaf-case coverage it provides.

#### TapeChart — `dark-tape-chart` (dark)
8 rooms × 7 days, dark theme. Mirrors the existing `dark-buttons` / `dark-inputs` / etc. parity pattern.

**Why:** the design system's dark-mode token swap is a real risk surface (e.g. recent `bar[data-status="checkedOut"]` uses `var(--rialto-surface-recessed)` which has different contrast in dark mode). Catches token-binding regressions.

#### MasterOverride — `master-override-variants` (light)
A 3 × 3 grid: 3 sizes (`sm`, `md`, `lg`) × 3 variants (`default`, `warning`, `danger`). All components in `cover-closed` resting state. 9 components total.

**Why:** the existing 3 × 3 size/variant matrix has been visually stable but never had a screenshot baseline. Without it, a future change to bezel gradient, stripe color, or lever metallics could regress silently. The "states" dimension (cover-closed / cover-open / engaged) is intentionally not covered here — `cover-closed` is the highest-traffic visual, and the open / engaged states are exercised by the `master-override-requireHold-splitflap` section below plus the existing jsdom interaction tests.

#### MasterOverride — `master-override-requireHold-splitflap` (light)
One component with `requireHold` + `labelTransition="splitflap"` + `idleLabel="OFFLINE"` + `activeLabel="ONLINE"`. Cover open. Switch in `off` state (no in-progress hold — that would require timing the screenshot to a fractional moment of the gold ring fill, brittle).

**Why:** the 0.1.11 features (progress ring affordance, SplitFlap label) ship with no visual baseline. A regression to the ring's conic-gradient mask, the `--mo-hold-progress` custom property wiring, or the splitflap cell sizing inside the bezel would not be caught by the existing 388 jsdom tests.

### Stress test — sizing constraint

The `tape-chart-stress` 24×14 grid is the largest section in the harness. The `.scroller` has `max-block-size: 70vh` and is itself scrollable, so the screenshot only captures what's visible at viewport height (720 px in the Playwright config). That's ~10 rooms visible in the screenshot, which is enough to catch the 2-rooms-per-row anti-pattern (which becomes visually obvious within the first 3 rooms).

Decision: **screenshot the visible viewport, not the full scroll content.** Same as the existing harness pattern. Don't add `fullPage: true` or `scrollIntoView` calls.

### Implementation outline

`apps/rialto-web/src/pages/visual-test/VisualTest.tsx` gets five new `<Section>` blocks. Each provides its own deterministic data — no random seeds, no wallclock dates. Use a fixed pseudo-`startDate` like `"2026-01-15"` and a fixed reservation list defined inline (not via the existing fixtures' RNG).

`apps/rialto-web/e2e/visual.spec.ts` gets:
- `lightSections` array gains: `"tape-chart-default"`, `"tape-chart-stress"`, `"master-override-variants"`, `"master-override-requireHold-splitflap"`
- `darkSections` array gains: `"dark-tape-chart"`

`apps/rialto-web/e2e/screenshots/` gains 5 PNG baselines:
- `light-tape-chart-default.png`
- `light-tape-chart-stress.png`
- `dark-dark-tape-chart.png` (note the existing `dark-dark-*` naming pattern)
- `light-master-override-variants.png`
- `light-master-override-requireHold-splitflap.png`

Generated via `pnpm --dir apps/rialto-web exec playwright test --update-snapshots` after the spec change is in place. Commit baselines to git (existing repo convention).

### Determinism requirements

The harness page MUST render deterministically:

- **No `new Date()` calls** for the section's data — current `defaultDateRange()` in `tapechart-fixtures.ts` uses `new Date()` and produces different output every day. The visual-test sections need a hardcoded `startDate` like `"2026-01-15"` so screenshots are stable across runs.
- **No `mulberry32` RNG-driven reservations** — the existing `makeReservations` helper uses a deterministic seed (42) but its output depends on the start date. Inline a fixed reservation list per section.
- **Reduced motion already handled** — the `beforeEach` in `visual.spec.ts` calls `page.emulateMedia({ reducedMotion: "reduce" })`. Both TapeChart's bar transitions and MasterOverride's spring lever flip honor this.
- **Today indicator** — `TapeChart` accepts no `todayISO` override; it defaults to "now". This breaks determinism. Either: (a) add an optional `todayISO` prop to `TapeChart` to control the today line position, or (b) pick a `startDate` so far in the past that today is outside the visible window (no today line rendered). **Going with (b)** — use `startDate="2026-01-15", endDate="2026-01-22"` for the default section and `startDate="2026-01-15", endDate="2026-01-29"` for stress; today (2026-04-24+) is well outside both windows.

If option (b) turns out to bite us when the year rolls over to 2027 and the dates become "less in the past," we revisit. Until then, simplest path.

### Test stability

Existing diff threshold is `maxDiffPixelRatio: 0.01` (1% of pixels can differ). Font hinting and sub-pixel anti-aliasing across machines typically stay within this; the existing 41 baselines have proven this in practice.

For the stress section specifically, ~1500×1280 = ~1.9M pixels × 0.01 = ~19,000 pixels of slack. More than enough for cross-machine variance.

### Goal-backward verification

Does this design prevent today's bug? Yes:
- `tape-chart-stress` at 24×14 with the broken CSS would have rendered the 2-rooms-per-row layout. The screenshot would diff far above the 1% threshold against the correct stacked layout.
- `tape-chart-default` at 8×7 might or might not have caught it (the bug is content-density-dependent — fewer rooms might still stack into 2 cols but visibly weird). Stress is the real coverage here.

Does it prevent the next class of MasterOverride bug? Yes:
- `master-override-variants` would catch any change to bezel/lever/stripe rendering that crosses the 1% pixel threshold.
- `master-override-requireHold-splitflap` would catch progress-ring or splitflap-cell rendering changes.

### Maintenance cost

When a deliberate visual change ships (e.g. rialto 0.2.0 redesigns the lever), the developer must run `--update-snapshots` and commit the new baselines. This is the standard visual regression contract — same as the existing 41 sections.

The risk: developers update baselines without inspecting the diff, defeating the point. Mitigation: code review must compare baseline diffs as deliberately as code diffs. No new tooling required for this — the existing convention already relies on this discipline.

## Out of scope

- **CI integration** — GitHub Actions is unpaid on this account per `CLAUDE.md`; visual tests run locally only. When billing is restored, a separate PR can wire the existing `playwright.config.ts` reporter `"github"` flag into a workflow.
- **Mid-hold animation screenshot** — capturing the gold ring at 50% fill requires sub-second timing precision; Playwright can do it via `page.evaluate(() => holdProgress.set(0.5))` but that requires component-internal hooks we don't expose. Defer until a regression actually demands it.
- **Dark mode for MasterOverride** — the component reads tokens (`--rialto-accent`, `--rialto-warning`, etc.) which already swap on dark mode. Visual-only changes vs. light. Add a `dark-master-override` section if/when dark-mode bugs surface; not preemptively.
- **LED telltale, audio/haptic, autoReclose, OverridePanel** (issue #595 items 3-6) — they don't exist yet. They get visual coverage when they ship.
- **Lint rule "every new component requires a visual-test entry"** — solved by code review and the rialto component-authoring CLAUDE.md, not tooling.
- **A `todayISO` prop on TapeChart** — see Determinism. Working around with backdated startDate for now; revisit when 2027 rolls around.

## Risks

| Risk | Mitigation |
|---|---|
| Stress baseline diffs across machines due to font rendering at scale | 1% threshold provides ~19K pixels of slack on a 1.9M pixel image. If diffs spike, tune `maxDiffPixelRatio` for that one test. |
| Backdated `startDate` becomes confusing after year rollover | Revisit when 2027 lands. If still using dates from January 2026, add a `todayISO` prop to `TapeChart` and use a frozen-in-2026 date with explicit today override. |
| Five new baselines bloat the repo | Five PNG files at ~50-150KB each = ~500KB. Repo is already ~5MB of screenshots. Acceptable. |
| Update-snapshot workflow gets abused (developers approve diffs without looking) | Pre-existing risk, applies to all 41 existing baselines. Code review discipline. |

## Delivery

Single PR (or series of small commits direct-to-main, matching this session's pattern):

1. Add `<Section>` blocks to `VisualTest.tsx` with deterministic data (no RNG, no `new Date()`).
2. Update `lightSections` / `darkSections` arrays in `visual.spec.ts`.
3. Generate baselines with `--update-snapshots`.
4. Commit baselines + spec changes together.
5. Run the suite once more in non-update mode to confirm green.

No version bump — this PR doesn't change rialto's published surface, only the showcase app's test infrastructure.

## Closes

- Documented coverage gap surfaced in rialto 0.1.12 release notes (TapeChart layout bug).
- Establishes visual baselines for the two highest-risk components shipped this week.
