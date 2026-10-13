---
stage: idea
run: feature:hospitality-above-fold-usability
date: 2026-10-13
assumptions:
  - "Work-already-in-flight check could not run: this Worker session has no GitHub credential (no gh, no push), so open PRs could not be enumerated. Proceeding; the Conductor owns batch-level duplication checks for #6367."
  - "Run driven by autorun from autorun-brief.md with stages executed inline (no per-stage subagent) to stay inside the Conductor's $6.44 ceiling; artifacts remain the only state between stages."
---

# Idea: hospitality pages waste the first screenful

Origin: issue #6367 (Conductor batch b20261013-6367). Complexity S.

## Problem, from the sufferer's view

A Restaurant Manager or Host opens a hospitality dashboard page —
Reservations, Guests, Timeline, Floor Plans — on a laptop. The thing they
came for (the reservation table, the guest list, the grid) starts below
the visible viewport. The first screenful is spent on layout padding, the
breadcrumb bar, the page title block, and status chrome. They scroll on
every single page visit, dozens of times per shift.

## Who has it, and how they cope today

Daily operators of the hospitality app (Manager and Host personas,
`apps/hospitality/CLAUDE.md`). Coping is manual: scroll immediately after
every navigation. The Host persona's key constraint is speed (<5 clicks
for a walk-in); a mandatory scroll on every page works directly against
that.

## Why now

Issue #6367 names it, and the daily `mbe-ui-quality` loop judges every
page against `docs/ui-quality/rubric.md` — layout waste is a recurring
class there. Cheap to fix (S), felt constantly.

## Evidence the problem is real

- **Anecdote (labelled as such):** issue #6367, filed by the Owner.
- **Code evidence:** `apps/hospitality/src/components/DashboardLayout.module.css`
  `.content` sets `padding: var(--rialto-space-lg)` (24px) then overrides
  the top to `padding-block-start: var(--rialto-space-xl)` (32px) —
  deliberately more empty space above content than beside it. Every page
  renders inside that, below a breadcrumb bar (`padding-block:
var(--rialto-space-sm)` + border), then stacks its own title block and
  status rows (e.g. ReservationsPage's `.statusBar`) before any data.
- **No measurements exist yet.** Quantifying the per-page fold budget is
  part of the work, not a precondition for believing the issue.

## Shape of a solution (hunch, not a design)

Measure first: a repeatable check that, per key page, reports where the
primary content region starts at common laptop viewports (1280×720,
1366×768). Then pull the one shared lever (DashboardLayout's top
padding) and tighten only the per-page header stacks the measurement
convicts. Guard the result so the class stays shut.

## Success statement

On a 1280×720 viewport, each key hospitality page shows the start of its
primary content without scrolling.

## Biggest unknowns / ways this dies

- Which pages are actually worst — measurement may acquit the layout and
  convict individual pages, or vice versa.
- Spacing changes cascade ±1px visual-baseline failures across unrelated
  sections (known gotcha, `.claude/rules/gotchas.md` § CI); an over-broad
  change dies in visual CI churn. Baselines must be regenerated from the
  Linux CI artifact, never macOS.
- "Whitespace" may be load-bearing rhythm on some pages (`speakeasy /
high-class` brand direction prizes air); the fix must tighten waste,
  not flatten the design.
