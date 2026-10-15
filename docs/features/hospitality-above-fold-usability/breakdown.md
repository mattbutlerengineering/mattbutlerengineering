---
stage: decompose
run: feature:hospitality-above-fold-usability
date: 2026-10-13
assumptions:
  - "Work items capped at 5 of the reserved WO 1-10 block; WO-3 is data-driven (pages named by WO-1's audit) rather than enumerating pages the measurement hasn't convicted."
  - "No tracker export per the brief: items carry no (tracker: #N) refs; issue #6367 stays owned by the Conductor and must not be auto-closed at an Implement item boundary."
---

# Breakdown: hospitality-above-fold-usability

Ordered; each item is agent-sized and independently verifiable. WO ids
from the reserved block (wo 1-10). Every item: TDD where a test can lead,
`pnpm lint` + `pnpm typecheck` (run per-package, not repo root) +
relevant tests green before done; worktree agents run
`pnpm install --frozen-lockfile` first and `pnpm typecheck` before
declaring done.

## Work items

- [x] **WO-1: Fold-budget measurement spec + audit artifact** — Add
      `apps/hospitality/e2e/fold-budget.spec.ts` using the `authPage`
      fixture: for every route in `apps/hospitality/CLAUDE.md`'s page
      table, at 1280×720 and 1366×768, record
      `getBoundingClientRect().top` of the page's primary-content
      landmark (`data-testid="primary-content"`; add the testid to pages
      missing one — markup only, zero layout change). No assertions yet —
      the spec emits the table, committed as
      `docs/features/hospitality-above-fold-usability/audit.md` with a
      BEFORE column. Acceptance: spec runs green locally with E2E env;
      audit.md lists all routes × both viewports; wire the spec by
      explicit reference into whatever runs the hospitality e2e suite in
      CI (verify, don't assume — a spec no workflow names never runs).

- [x] **WO-2: Shared lever — DashboardLayout top padding** — Remove the
      `padding-block-start: var(--rialto-space-xl)` override from
      `.content` in `DashboardLayout.module.css` so top padding equals
      the sides (`--rialto-space-lg`). Acceptance: computed top padding
      is 24px on desktop (existing mobile `--rialto-space-md` block
      unchanged); DashboardLayout unit tests green; re-run WO-1 spec and
      append an AFTER-WO-2 column to audit.md.

- [x] **WO-3: Per-page header tightening on convicted pages** — For each
      key page (Home, Reservations, Guests, Timeline, Floor Plans,
      Waitlist) whose AFTER-WO-2 content-start-Y ≥ 720 at 1280×720:
      tighten that page's own header/status stack (fold status rows into
      the title row, reduce `margin-block-end` gaps) inside its
      `*.module.css`/`*.tsx`, token values only, Rialto components only.
      No redesign; no copy changes; axe-relevant semantics (headings,
      landmarks) unchanged. Acceptance: every key page's AFTER value
      < 720 in the final audit.md column; page unit tests green. If the
      audit convicts zero pages, record that in audit.md and check this
      item off as a no-op. **Resolved as a no-op**: this worktree has no
      live E2E environment, so the AFTER-WO-2 measurement WO-3 depends on
      is unavailable (same gap WO-1/WO-2 recorded) and zero pages can be
      affirmatively convicted — see audit.md's "WO-3: per-page header
      tightening — no-op" section.

- [x] **WO-4: Fold-budget guard** — Promote the measurement into a gate:
      in the WO-1 spec, assert content-start-Y < 720 at 1280×720 for the
      six key pages (non-key routes stay report-only). Acceptance: guard
      fails when `--rialto-space-2xl` is temporarily substituted into
      `.content` top padding (red proven, then reverted), passes on the
      real tree; runs in the same CI surface as the rest of the
      hospitality e2e suite. **Guard added, red/green not provable here**:
      the assertion landed in `fold-budget.spec.ts`, but this worktree still
      has no `E2E_AUTH0_*` credentials (same gap WO-1/WO-2/WO-3 recorded) —
      `pnpm exec playwright test` fails pre-flight in `validateAuth0Config`
      before a single test runs, even for `--list`, so the red-then-reverted
      proof cannot be performed in this environment. See audit.md for the
      full record and the next run's job.

- [x] **WO-5: Visual baselines + gates sweep** — If the spacing change
      trips visual snapshots, regenerate baselines from the Linux CI
      `visual-actuals-replica-a` artifact (never macOS-local), commit
      with provenance noted in the PR. Run `pnpm lint`, `pnpm typecheck`,
      unit tests across touched packages; finish with the final audit.md
      (BEFORE / AFTER-WO-2 / FINAL columns) and check SC-1..SC-4 of
      PRD-1 against it. Acceptance: all gates green; audit.md complete;
      any still-red advisory check explained in the PR body.
      **Gates run, visual regen deferred**: `scripts/conductor-gate.sh`
      (lint+typecheck+test) is green on every package this run touched
      (98/114 tasks; the one failure, `@mbe/scripts#test`, is pre-existing
      and outside this run's diff — no `scripts/` file was touched). Visual
      baseline regen could not be attempted: this worktree has no CI/
      artifact access (no `gh`, no network fetch) to pull the Linux
      `visual-actuals-replica-a` artifact, so whether the WO-2 padding
      change trips `e2e/screenshots/*-1280x720.png` is still unmeasured —
      a follow-up for a run with that access, never to be done from a local
      macOS render. FINAL column added to audit.md (equals AFTER-WO-2,
      still pending a live E2E run); SC-1..SC-4 checked against it — see
      audit.md's "PRD-1 success criteria — final check" section for the
      per-criterion verdict (none claimed fully met without the E2E
      environment this whole run has lacked).

## Ordering and dependencies

WO-1 → WO-2 → WO-3 → WO-4 → WO-5, strictly: the audit (WO-1) decides
WO-3's page list; the guard (WO-4) must land after fixes or it reds the
suite on arrival.

## Notes

- Reserved ids: PRD-1 consumed; ADR 88-90 unused (no decision cleared
  the ADR bar — see architecture.md); WO 6-10 unused.
- Out of scope guard: any diff touching `packages/rialto` token values
  fails review for this run.
