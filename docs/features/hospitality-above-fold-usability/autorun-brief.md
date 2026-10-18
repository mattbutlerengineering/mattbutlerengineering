# Autorun brief — hospitality-above-fold-usability

<!-- stop-after: decompose — lifted 2026-10-18, see § Resume 2026-10-18 -->

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

## Resume 2026-10-18 — shipped by the Conductor; Review + Ship record

The Owner re-invoked autorun on this run on 2026-10-18 and answered two
gap questions live (not assumptions):

1. **Resume shape:** "Review + Ship record." The `stop-after: decompose`
   line above is lifted. Autorun re-runs Review, then Ship records a
   release that already happened.
2. **Operate:** see `operate:` below.

Facts measured at resume, not assumptions:

- The Conductor batch shipped the work to `main` and #6367 closed
  2026-10-15T14:40:58Z. Merged PRs: **#6541** (`5e9fd4333`, 05:34:37Z,
  conductor batch b20261013 — WO-1/2/4), **#6681** (`f72fb772f`,
  06:01:21Z, Settings primary-content tag), **#6705** (`b652a6723`,
  14:40:56Z, PageHeader spacing + recorded fold budget).
- `review.md` (2026-10-13) covers only the first batch's diff
  (`a167d9fe0..HEAD` of that branch). It does not cover #6681 or #6705.
  `verification.md` is dated 2026-10-15.
- `review.md` carries `run: hospitality-above-fold-usability`; the legal
  form is `run: feature:hospitality-above-fold-usability` (open PR #7035
  fixes the same line; a rewritten review.md must use the legal form).
- Remaining stages run in the worktree
  `.claude/worktrees/above-fold-close`, branch `docs/above-fold-close`,
  cut from `origin/main` at `4bc410fb0`. Run `pnpm install
--frozen-lockfile` there before any test command.
- Open-PR pre-flight at resume: #7033 (CLEAN, auto-qa-tune, awaits the
  Owner) and #7035 (doctor fixes, CI pending). Neither touches
  `apps/hospitality`.

What this means per stage:

- **Review** reviews the change as merged: all three PRs on `main`
  (`git show` each merge commit), plus anything on `main` since that
  touched the same files. Rewrite `review.md` covering the whole shipped
  change; never edit history in the old one beyond replacing it.
- **Ship** records the release. It executes no new release action — no
  merge, deploy, tag or push other than the run branch's own docs PR.
  Record pre-flight, deploy evidence for each merge commit (job-level
  `Deploy Static Sites` conclusions, never the workflow rollup), and
  rollback steps; `outcome: released`. A critical review finding is
  reported as a live production defect, not a blocker.
- The docs PR carrying these artifacts is opened and left for the
  Owner's merge (`**/architecture.md`-free, but the brief never answers
  a merge).

## Operate

operate:
minimum-signal: >-
At least one ui-quality-loop daily judgment of the touched hospitality
pages dated after 2026-10-15, AND one Owner look at a real
hospitality page at 1280x720. Count users-observed from what the
stage finds; 0 is honest if neither exists.

## Review decisions 2026-10-18 (Owner, live — not assumptions)

`review.md` (`33ba20c49`) returned `pass-with-findings`, no critical, two
majors. The Owner answered both:

3. **Major 1 — title flush against the breadcrumb bar (live in prod):**
   "Fix: 8px gap." A follow-up PR, outside this run's Ship, sets
   `PageHeader` `margin-block-start: var(--rialto-space-sm)`, keeps the
   312px Timeline ratchet unchanged, and regenerates visual baselines
   from the Linux CI artifact only. Ship records the defect as live in
   production with that fix pending; it does not block the record.
4. **Major 2 — fold guard measures status-chrome wrappers, not data:**
   "Defer to seed." Ship lists it as a follow-up; Operate (or Ship's
   follow-ups) proposes the `docs/backlog.md` seed: move the fold markers
   onto the table/data wrappers and re-measure every ratchet from CI.
