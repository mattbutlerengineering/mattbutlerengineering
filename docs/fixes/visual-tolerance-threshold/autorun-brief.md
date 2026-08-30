# Autorun brief — visual-tolerance-threshold

Collected 2026-08-27. Maintenance run, seeded from `docs/backlog.md` line 55
(claimed in place as `maintenance:visual-tolerance-threshold`). Origin:
`feature:visual-diffs-in-pr`, whose Ship-stage demonstration surfaced this as
finding **D2** and explicitly scoped it out.

This brief is not a pipeline artifact — it never counts toward orientation or
active-run discovery.

## Run scale and type

**Maintenance run** (the protocol's capture-step entry), not a feature run.
Artifacts at `docs/fixes/visual-tolerance-threshold/`, seed artifact
`defect.md`. Something is broken, not missing: the visual suite does not
detect what everyone believes it detects.

## The defect, from the sufferer's view

The rialto-web visual regression suite is a safety net that a reviewer — human
or agent — trusts to go red when the UI changes. It does not. A change altering
**71,140 of 139,216 pixels** in `light-button-variants` — 51% of the image —
**passed all 49 snapshots**.

That is not a tuning preference. It means a green `Visual Regression
(rialto-web)` carries far less information than the repo has been reading into
it, and the run that just shipped inline diff images into PRs made the
consequence worse in one specific way: diff images are only as useful as the
failures that produce them. A suite that does not fail produces no images.

## Reproduction and evidence (first-hand, from the prior run's live demo)

Measured 2026-08-25 during `feature:visual-diffs-in-pr`'s Ship stage, on PR
#4569. Labelled as first-hand and single-instance, not a survey.

- Perturbation: `opacity: 0.55` applied to eight harness sections in
  `apps/rialto-web/src/pages/visual-test/VisualTest.module.css`.
- Result: **all 49 snapshots passed.** The run produced no failure and no
  publisher activity.
- Largest per-channel delta anywhere in the image: **36/255 = 0.14**.
- Playwright's default per-pixel `threshold` is **0.2**. A pixel is only
  counted as different once its delta exceeds `threshold`; `maxDiffPixels` is
  consulted afterwards, against a count that was already zero.
- The demonstration only proceeded after switching to a high-delta
  perturbation (commit `e296aef39`, "opacity was under the threshold"), which
  produced 8 changed snapshots.

**The gate order is the whole defect:** `threshold` filters first,
`maxDiffPixels` counts second. Tuning the second while the first is wide open
changes nothing about what the suite catches.

## Why now

`#4496` changed the budget from `maxDiffPixelRatio: 0.01` to
`maxDiffPixels: 300` — tightening the _second_ gate — without examining the
first. It also merged with its own visual check red, leaving `main` red for
~41 hours until `#4561` landed 24 regenerated baselines. So the last time
anyone touched this, the cost was real and the sensitivity question was never
actually asked.

## Current state, as recorded by the prior run (Capture should re-verify)

- `apps/rialto-web/playwright.config.ts`: a commented-out
  `maxDiffPixelRatio: 0.01` at line 23 (prose about #4450), live
  `maxDiffPixels: 300` at line 28. No `threshold` is set anywhere, so the
  Playwright default applies.
- `apps/rialto-web/e2e/visual.spec.ts`: four `toHaveScreenshot` calls, each
  passing only `timeout` — no per-spec tolerance override.
- 49 snapshots, 49 committed baselines in `apps/rialto-web/e2e/screenshots/`.
- Effective per-image budget is `min(maxDiffPixels, w × h × maxDiffPixelRatio)`
  (`playwright-core/lib/coreBundle.js:7556-7562`).

## The real tension this run must resolve

A tolerance exists for a reason, and the reason is documented in this repo:
baselines are **Linux-CI-runner-specific**, and font-metric / glyph-advance
differences make macOS-rendered output differ. `.claude/rules/gotchas.md` also
records that changing a shared `line-height` cascades ±1px shifts into
non-adjacent sections, flipping 18+ baselines at once.

So this is not "set the threshold to zero". Too sensitive and the suite reds
constantly on antialiasing noise and gets ignored — which is the same failure
as being too loose, arriving by a different road. The run's job is to find
where the line actually belongs and to produce **evidence** for it, not a
preference.

## Success — what "fixed" means

A perturbation a reviewer would call a real visual regression makes the suite
go red, and ordinary cross-platform rendering noise does not. Both halves must
be demonstrated, not asserted. At minimum the run must show:

1. the 51%-pixel opacity perturbation (or an equivalently subtle one) now
   **fails**; and
2. whatever noise the current baselines legitimately carry still **passes**.

## Scope

**In:** the tolerance configuration governing `apps/rialto-web/e2e/visual.spec.ts`
— `threshold`, `maxDiffPixels` / `maxDiffPixelRatio`, wherever they are best
set — plus any baseline regeneration that change requires, and a guard that
keeps the chosen values from silently drifting again.

**Out:** the `packages/rialto` Storybook visual suite (`rialto-visual.yml`) —
named, not taken, same as the prior run. Also out: the inline diff-image
feature itself (shipped, unmerged, PR #4569), and D1's stranded-comment gap,
which is its own backlog seed.

## Constraints

- **Baselines are Linux-CI-specific.** Never commit baselines rendered on
  macOS. Regenerate from a CI artifact on a Linux run at the PR's base commit;
  actuals are byte-identical across CI retries.
- Merging a PR with its own visual CI red starts a cascading red streak on
  main — exactly what #4496 did. Do not repeat it.
- `CI Gate` is the only required check on `main`; the visual job is advisory.
  This run may change what the visual job concludes, but must not change which
  checks are required.
- Green-main policy: `main` must always be green.
- Never `git add -A` — the PostToolUse prettier hook leaves ~171 files dirty.
- Repo conventions in `CLAUDE.md` and `.claude/rules/gotchas.md` apply.

## Decisions already made (user-selected, 2026-08-27)

- **Release authorization:** NONE — **prepare and stop**. Every stage through
  ship; `release.md` with exact steps; a PR may be opened; it must not be
  merged, tagged, published, or deployed.
- **Tracker:** no interaction. Work items stay checkboxes. Do not create,
  close, or comment on any GitHub issue, and do not seed from existing ones.

## Left to the Capture stage to decide

**Re-entry depth** (`re-entry: implement` vs `re-entry: architect`) is decided
at capture time per the protocol, and this brief does not pre-decide it. The
orchestrator's reading, offered as input rather than instruction: the change
has a genuine trade-off with two failure directions, may require regenerating
some or all of 49 baselines, and needs an empirical basis for whatever numbers
it picks — which points at `architect`. Capture should form its own view and
record it.
