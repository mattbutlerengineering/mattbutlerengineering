# Autorun brief — hospitality-above-fold-usability

stop-after: decompose

## Feature description (what and why)

Issue #6367: audit the hospitality website. Many pages put most of their
useful content below the fold, with a lot of extra whitespace above the
fold. Improve usability in this area. Estimated complexity S (1-2 hours).

## Run scale

Feature run. Slug: `hospitality-above-fold-usability`.
Run directory: `docs/features/hospitality-above-fold-usability/`.

## Idea-stage inputs

- **Problem, sufferer's view:** a Restaurant Manager or Host opens a
  hospitality page (Reservations, Guests, Timeline…) on a laptop and the
  data they came for — the table, the grid — starts below the visible
  viewport; the first screenful is padding, breadcrumb, header, and
  status chrome.
- **Who has it / coping today:** daily operators of the hospitality
  dashboard; they scroll on every page visit.
- **Why now:** issue #6367 filed it; the ui-quality loop judges pages
  daily and layout waste is a recurring class.
- **Evidence (labelled):** the issue itself is an anecdote from the
  Owner. Code evidence: `DashboardLayout.module.css` `.content` sets
  `padding-block-start: var(--rialto-space-xl)` (32px) on top of
  `padding: var(--rialto-space-lg)` (24px); every page then stacks a
  breadcrumb bar, page header, and status rows before primary content.
  No measurements exist yet — measuring is part of the work.
- **Solution hunch:** measure each page's vertical stack above its
  primary content at common laptop viewports, then tighten the shared
  layout lever and the worst per-page header stacks.
- **Success, one sentence:** on a 1280×720 viewport, each key hospitality
  page shows the start of its primary content without scrolling.
- **Biggest unknowns / ways this dies:** which pages are actually worst
  (needs measurement, not vibes); spacing changes cascade ±1px visual-
  baseline failures repo-wide (known gotcha), so an over-broad fix dies
  in visual CI churn.

## Scope boundaries

- **In:** `apps/hospitality` page/layout CSS and markup; a repeatable
  fold-budget measurement; guard test so the regression class stays shut.
- **Out:** rialto token value changes (blast radius: every app); page
  redesigns, new components, new flows; marketing site; mobile-specific
  rework beyond not regressing the existing 375px behaviour.

## Constraints / already decided

- Rialto tokens only (`var(--rialto-*)`), Rialto components only, per
  `apps/hospitality/CLAUDE.md` and `.claude/rules/ui-quality.md`.
- No accessibility regressions (axe, landmarks, skip link).
- Visual baselines are Linux-CI-artifact-sourced, never macOS-local.

## Tracker

No tracker interaction by this run. Issue #6367 is owned by the
Conductor batch (conductor/b20261013-6367); artifacts reference it in
prose/frontmatter only. Work items carry no `(tracker: #N)` refs so no
Implement-boundary close can touch #6367.

## User-facing surface

Yes — existing dashboard pages. No new screens or flows are proposed;
the PRD decides `ux:` on that basis.

## Release authorization

None. Prepare-and-stop is moot: this run stops after Decompose
(blueprint gate); Implement onward is dispatched by the Conductor.

## Reserved ids (Conductor block for #6367)

PRD 1; ADR 88-90; WO 1-10. If exhausted, stop and surface.
