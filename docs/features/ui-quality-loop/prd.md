---
stage: prd
run: feature:ui-quality-loop
date: 2026-09-28
ux: not-applicable
ux-reason: "Factory tooling with no user-facing surface — the ledger, rubric and rater scores live as JSONL/markdown in the repo and in PR/issue bodies, like every other sensor here (metrics/*.jsonl, .claude/improvement-loop/log.md); a /rialto/quality dashboard was offered and declined for this run"
assumptions:
  - "Route inventory (SC-1) is derived from the three router declarations — apps/hospitality/src/main.tsx (createBrowserRouter: 19 `path:` entries + 2 index routes), apps/marketing/src/App.tsx (9 `<Route>`), apps/rialto-web/src/routes.tsx (102 PAGE_REGISTRY entries mapped to /components/{id} or /examples/{id}, plus index, 13 demo paths, visual-test, privacy, catch-all ≈ 119) — about 149 route templates, not the ~80 idea.md estimated from a `path=` grep that also matched test files. Redirects and catch-alls are inventoried with their kind and audited for behaviour only, never taste; a parameterised route (`:venueSlug`, `:id`) is one row audited against a fixture instance. What would change it: Architect finding a view the declarations do not carry (hash/query-driven), which is added as its own row, never dropped."
  - "P1 (SC-2) has no existing convention in this repo — no `P1`/`severity` label, template field or skill rule was found in .github/ISSUE_TEMPLATE, .claude/skills/site-audit or sentry-triage — so this PRD defines it mechanically: a bugs-face finding where a route renders blank, throws an unhandled error, 404s from an in-app link, or a primary control does nothing; or an accessibility-face axe violation of impact `critical`. Everything else is P2. What would change it: Matt naming a different rule; the 7-day check itself is unchanged."
  - "SC-3 verifies the rater and its calibration, not the ≥ 4/5 bar — idea.md's 'every app ≥ 4/5 on built by a professional team' is the loop's steady-state target, read at Operate from the persisted scores; reaching it is the loop's job over its cadence, not this run's Ship condition. The brief's own Success-criteria list already draws that line."
  - "The reference half of the calibration set (SC-3) is chosen by Architect/Verify and named, with its screenshots, in the versioned rubric document; Matt's one-time labelling pass is also his approval of that choice — no separate question is asked of him."
  - "SC-4's hospitality visual spec may cover authenticated routes, because it runs in GitHub Actions where e2e.yml / e2e-screenshots.yml already hold the E2E Auth0 secrets and apps/hospitality/playwright.config.ts loads `e2e/.auth/user.json` from auth.setup.ts; only the sandbox routine (SC-5) is auth-blind. What would change it: Architect measuring that credential as unreliable in CI (gotchas § CI: `Hospitality E2E` is advisory and 'frequently red'), in which case the hospitality spec starts with the two public routes and the ledger marks the rest."
  - "The fix-PR budget is the brief's default — at most ONE fix PR per fire, the rest filed as issues or seeds — written here as a requirement; Architect may lower it, never raise it without Matt."
surfaced:
  - "Sandbox reach, measured: 19 of hospitality's 21 routes sit under the `<App />` element, and App.tsx:129 redirects whenever `!isAuthenticated`; only `book/:venueSlug` and `reservations/manage` are public. From the claude.ai sandbox (no Auth0, no egress — #2920, #3546) the routine can reach ≈ 9 marketing + ≈ 119 rialto-web + 2 hospitality routes. The Operator persona's entire surface is in the unreachable set — the concrete form of kill-risk 2."
  - "Prior art the ledger must reckon with: packages/agent-core/src/audit-surface-registry.ts already hand-types a SURFACE_REGISTRY of 90 `page` + 5 `api_endpoint` surfaces with `auth: none|auth0`, `lastChecked` and `checkHistory` for /site-audit, persisted at the gitignored .audit-state/inventory.json (absent in this checkout; metrics/verifications.jsonl's 2026-09-28 row reads 'Lighthouse inventory not available — run a site audit first') and pointed at the live site. It is the shape SC-1 wants with the provenance SC-1 forbids (hand-typed, uncommitted, prod-only). Reuse or replace is Architect's call."
  - "Sensors that exist and see nothing: metrics/a11y-history.jsonl is 0 bytes; apps/hospitality/e2e/a11y.test.ts and apps/marketing/e2e/a11y.test.ts each axe-scan exactly one page (the homepage), `critical|serious` only; lighthouse.yml's matrix is marketing + rialto, no hospitality; e2e-screenshots.yml uploads hospitality screenshots as an artifact nothing compares."
  - "The `ui-quality` label exists nowhere yet — no .github/labels.yml, and a repo grep hits only this run's idea.md and autorun-brief.md. It must be created before the first fire or every filing fails."
  - "Cost and wall-clock of one full pass (~149 routes, screenshots, multimodal judge) are unmeasured; Verify's single bounded pass is the first measurement (brief § Verification spend)."
---

# PRD: A UI-quality loop that keeps every page at a professional bar, with no human in the loop

## Problem statement

A prospect — a founder or CTO deciding whether an AI-run dev shop can ship
production-grade software — lands on mattbutlerengineering.com or the
hospitality demo and gives it thirty seconds. A restaurant operator trialling
`apps/hospitality` gives it a shift. Both read the same thing today: generic
layouts, uneven spacing and type, a navigation that makes them work, an
accessibility gap, the odd bug. The UI _is_ the sales proof, and nothing in the
factory asks whether the output looks like a professional team built it.

The factory's volume has outrun its taste gate. Three consecutive UI-facing runs
closed with zero observed human users; `feature:hospitality-service-ux` filed 11
`[Audit]` defects against its own output 37 minutes before its own merge
(#5270–#5280), two of them user-facing and live in prod; 51 unclaimed
UI-flavoured seeds sit in `docs/backlog.md` (157 seeds total, keyword grep this
worktree) with nothing draining them. Every sensor exists — Lighthouse, axe,
`/site-audit`, `mbe-auditor`, Storybook and rialto-web visual regression — and
none scores aesthetics or navigation, none tracks per-route coverage over time,
and the two apps a prospect actually opens have **no visual-regression floor at
all**.

**Measured 2026-09-28, this worktree at `35517bbae`:**

- `toHaveScreenshot` occurs in **0** files under `apps/hospitality` and
  `apps/marketing`; both have **0** committed baseline PNGs. `apps/rialto-web`
  has 49 baselines (`e2e/screenshots/`, `visual.spec.ts`, run by
  `rialto-web-e2e.yml` with the spec named by full path); `packages/rialto` has
  53 Storybook baselines (`rialto-visual.yml`).
- Routes declared in source: hospitality 19 `path:` + 2 index
  (`main.tsx`), marketing 9 `<Route>` (`App.tsx`, of which 2 redirects and 1
  404), rialto-web ≈ 119 (`routes.tsx`: 102 registry pages + demos + misc) —
  ≈ 149 route templates to keep at the bar.
- Ten `mbe-*` routines exist (`docs/routines/*.md`, one row each in
  `docs/scheduled-tasks.md` § Routine catalog, one entry each in
  `scripts/routine-manifest.mjs`); none looks at UI quality.

The community corroborates the premise at HN-front-page scale this week
(_Tells of a Slop UI_, 379 points) and enumerates the tells, which makes them
auditable; it also measures the kill-risk: single-answer LLM judging of web UIs
trails humans 63.9 % vs 84.6 % (WebDevJudge, ICLR 2026), pairwise 70.3 %. The
buyer-behaviour half of the problem — that a prospect chooses against a shop
because its UI reads AI-built — is **not** evidenced anywhere; this PRD's bar
does not lean on a conversion claim.

## Solution

When this ships, the factory owns a daily, unattended loop that keeps every
route in the three apps at a fixed, versioned, four-faced bar — bugs, "does not
look agent-built", navigation, accessibility — and proves its coverage:

- **A page-coverage ledger**, committed and machine-readable, with one row per
  route template derived from the routers (never hand-typed), recording when
  each was last audited, when its source last changed, which rubric version
  judged it, and whether it was reachable.
- **A daily routine** (`mbe-<name>`, RemoteTrigger on claude.ai, prompt
  version-controlled under `docs/routines/`) that builds the apps locally,
  visits the routes the ledger says are due, applies the bar, and routes each
  finding into a carrier the factory already has: at most one fix PR per fire,
  `ready` issues for `/implement-queue`, `docs/backlog.md` seeds for the rest —
  each filed once.
- **A versioned quality rubric** whose "agent-built" face starts from the
  community-enumerated tells (permanent dark theme nobody asked for, gradient
  backgrounds, icon-card grids, Inter headlines, 1 px gray card borders,
  three-feature-card rows, generic hero copy) and whose accessibility face adds
  the semantic faults axe cannot see (non-descriptive alt text, vague link
  purpose, heading–content mismatch) on top of the axe/Lighthouse floor.
- **An automated taste rater** — a multimodal judge scoring screenshots by
  contrastive comparison against a named reference set — persisted with its
  rubric version, model id and inputs, calibrated once against labels Matt
  provides one time.
- **A visual-regression floor for hospitality and marketing**, per PR, in CI,
  with Linux baselines and the diff image in the pull request.
- **The rubric fed upstream** into every UI-producing agent's instructions
  alongside rialto's tokens (`packages/rialto/CLAUDE.md`), so the loop stops
  refiling the same tell.

Mechanisms — ledger format, rater model, judge prompt, cron slot, module
layout — belong to Architect; the criteria below fix what must be true.

## Actors

- **Prospect** — a founder/CTO evaluating an AI-run dev shop; skims the
  marketing site and the hospitality demo for ~30 s from a browser, no login.
- **Operator** — a restaurant operator trialling `apps/hospitality` behind
  Auth0; uses the dashboard shell (timeline, reservations, floor plans, …) for
  a shift, sometimes by keyboard or screen reader.
- **Matt** — owner; the only human the loop may touch, exactly once, to label
  the rater's calibration set; otherwise reads the ledger and the PRs.
- **The UI-quality routine** — the daily RemoteTrigger agent; runs in the
  claude.ai sandbox with no `gh`, no egress to prod, no Auth0.
- **A UI-producing agent** — `implement-queue-worker` or any `mbe-*` routine
  that writes UI code; today loads no design guidance beyond the issue text
  (`.claude/agents/implement-queue-worker.md` references no design doc;
  `.claude/rules/` holds only `gotchas.md`).
- **A Reviewer** — the `reviewer` subagent or a human reading a UI pull
  request.

## User stories

1. As a **Prospect**, I want every public page I might land on to have been
   checked against the same professional bar within the last 30 days, so that
   nothing in my thirty-second skim reads as agent-assembled.
2. As an **Operator**, I want the screens I use to carry no P1 defect older
   than a week and to stay accessible beyond what axe can see, so that my trial
   does not end on a broken or unreadable page.
3. As **Matt**, I want to label a calibration set once and never be asked
   again, so that the loop runs with zero human input and I can still trust
   what its taste rater says.
4. As **Matt**, I want the ledger to name the routes the loop could not reach
   rather than silently skip them, so that a coverage claim is honest.
5. As the **UI-quality routine**, I want a source-derived route inventory and a
   versioned rubric, so that each fire knows exactly what to visit and files
   each finding exactly once.
6. As a **UI-producing agent**, I want the aesthetic rubric and rialto tokens in
   front of me before I write UI, so that I stop producing the tells the loop
   would otherwise file forever.
7. As a **Reviewer**, I want a UI PR to hospitality or marketing to fail
   visibly when it shifts layout, spacing, colour or type, with the diff image
   in the PR, so that regressions are caught per PR rather than by tomorrow's
   audit.

## Success criteria

Numbering follows the brief § Success criteria 1–7; Verify tests against
these.

- [ ] **SC-1 Coverage.** A committed, machine-readable ledger holds exactly
      one row per route template, generated from
      `apps/hospitality/src/main.tsx`, `apps/marketing/src/App.tsx` and
      `apps/rialto-web/src/routes.tsx` (with `PAGE_REGISTRY`) by a script:
      running it twice on the same commit yields byte-identical output, and a
      check fails when the committed ledger's route set differs from the
      generated one (hand-edits and stale rows both fail). Each row records
      `route`, `app`, `kind` (page | redirect | not-found), `auth`
      (public | auth0), `last_audited_at`, `last_changed_at` (from the git
      history of the route's source files), `reachability`
      (audited | unreachable:auth | unreachable:build), and the rubric version
      that last judged it. A coverage report computes the trailing-30-day
      audited percentage over reachable rows, reports unreachable rows
      separately by reason, and exits non-zero below 100 % once 30 days have
      elapsed since the routine's first fire. Verify proves the generation,
      the drift check and the computation on real rows from one local pass —
      not the 30-day figure.
- [ ] **SC-2 Correctness.** Every defect the loop files carries a deterministic
      title prefix (fixed by Architect, no timestamps or counters in it), the
      `ui-quality` label, and a P1/P2 marker per the definition in
      `assumptions`. A check lists open P1 `ui-quality` issues older than 7 days
      and exits non-zero when any exist; Verify runs it and shows it reads the
      loop's own filings. The `ui-quality` label exists before the first fire.
- [ ] **SC-3 Taste.** The rater writes, next to the ledger, one record per app
      per fire with `rubric_version`, `model_id`, the score, and the exact
      screenshots judged (paths or content hashes), derived from pairwise
      comparisons against the named reference set — an absolute single-answer
      score alone does not satisfy this criterion. A calibration set of
      ≥ 10 screenshots (≥ 5 from this repo's routes, ≥ 5 reference pages of
      demonstrably professional apps, all named in the rubric) is labelled
      **once** by Matt as pairwise orderings; Verify reports how many of the
      labelled pairs the rater orders the same way (N of M) and lists every
      disagreement. The passing N is the number Matt writes into the rubric
      when he labels — this PRD does not set it (see Open questions). That
      labelling is recorded as the run's only human touch.
- [ ] **SC-4 VR floor.** `apps/hospitality` and `apps/marketing` each have a
      Playwright visual spec (`toHaveScreenshot`) covering, at one or more
      recorded viewports, every route the ledger marks reachable for that app
      in CI (public routes; hospitality's authenticated routes via the existing
      E2E credential per `assumptions`), with committed baselines produced from
      a Linux CI artifact whose provenance is recorded (`visual-noise-floor.yml`
      replica pattern — never macOS), a tolerance justified by
      `scripts/visual-tolerance-rule.mjs` (verdict `ok`, not a guessed ratio),
      the spec named by **full path** in the workflow that runs it on PRs
      (explicit list, never a glob), the diff artifact published into the PR
      the way `rialto-web-e2e.yml`'s `publish-visual-diffs` job does, and a
      workflow-coverage test — new for marketing, extended for hospitality
      (`apps/hospitality/e2e/workflow-coverage.test.ts` exists and guards
      auto-discovery) — that fails when a spec is not wired.
- [ ] **SC-5 No human in the loop.** The routine's prompt lives at
      `docs/routines/mbe-<name>.md` with the house frontmatter (`trigger_id`,
      `environment_id`, `cron`, `model`, `cadence`) and a fenced prompt block; a
      row is added to `docs/scheduled-tasks.md` § Routine catalog; an entry is
      added to `scripts/routine-manifest.mjs` with a detectable `signature`
      (never `unverifiable`) so `routine-liveness.test.mjs` passes and its
      silence would be noticed. It runs end to end in the claude.ai sandbox —
      GitHub via MCP tools, no `gh`, no fetch of the live site, no Auth0 —
      auditing a **local build**; every auth-gated route lands in the ledger
      as `unreachable:auth`, never as skipped. Per fire it opens at most one
      fix PR (never merges), files the rest as `ready` issues or backlog
      seeds, and appends a dated entry to `.claude/improvement-loop/log.md`
      even when it finds nothing. Its first scheduled fire is the smoke test:
      Ship records `next_run_at`; Operate reads that run's log and the ledger
      commit it should have produced.
- [ ] **SC-6 Convergence.** The rubric is a versioned document; a finding's
      identity is (route, rubric_version, tell), recorded in a filed-findings
      ledger and deduplicated through the shared `fileIssue()` seam
      (`scripts/lib/issue-filing.mjs`) or an equivalent skip/create/reopen
      decision. Verify runs the pass twice on unchanged pages at the same
      rubric version in dry-run and shows the second pass would create
      **zero** issues, PRs or seeds. The first real fires re-verify the 11
      open `[Audit]` issues (#5270–#5280) and the UI-flavoured seeds against
      the rubric as findings — never by hand inside this run.
- [ ] **SC-7 Gates.** `pnpm lint`, `pnpm typecheck` and `pnpm test` green in
      every touched package; `pnpm exec prettier --check
docs/features/ui-quality-loop/` clean; generated artifacts (`llms*.txt`,
      dep-graph) regenerated; `e2e-selector-drift-reviewer` run on the new
      specs; a changeset if `packages/rialto` published source changes.

## Out of scope

- Redesigning the apps or introducing a new design system — rialto exists;
  brand direction stays Matt's standing one (speakeasy / high-class / royalty /
  gen-z, through rialto tokens, never over a11y).
- Provisioning Auth0 E2E credentials for the claude.ai sandbox (human step,
  #3546).
- A dashboard or page for the ledger (`/rialto/quality` declined; Operate
  seeds it; the ledger format must let a page read it later).
- X/social sensors; any change to the ten existing `mbe-*` prompts or
  schedules beyond adding the new row to `docs/scheduled-tasks.md`.
- Working the 51 UI seeds or #5270–#5280 by hand inside this run.
- Any deploy beyond what merging to `main` already triggers; fetching the live
  site from the routine.

## Open questions

- **Rater agreement threshold (SC-3) — RESOLVED by Matt, 2026-09-28 (autorun
  brief § Decisions added after PRD, item 10).** Pass mark: the rater's pairwise
  verdict agrees with Matt's one-time labels on **≥ 80 % of the ≥ 10 calibration
  pairs AND never prefers one of our pages over a reference page** — an
  inversion is a hard fail regardless of the percentage. Chosen over 70 %
  (WebDevJudge's measured LLM pairwise ceiling) and 90 % (near-human). SC-3
  renders a verdict against this number; the rubric records it as
  `calibration.pass_mark`.
- **Auth-gated hospitality rows — Architect.** 19 of 21 hospitality routes are
  unreachable from the sandbox. Does a second leg in GitHub Actions (which holds
  the E2E secrets and has egress) audit them into the same ledger, or does the
  loop accept them as `unreachable:auth` until #3546 is done? The Operator's
  whole surface rides on the answer.
- **Ledger vs `SURFACE_REGISTRY` — Architect.** Reuse agent-core's inventory
  types and reconcile its 90 hand-typed page surfaces with the derived route
  set, or replace it; either way one source of truth, committed.
- **PR flood — Architect.** One fix PR per fire is the cap; how it coexists
  with `mbe-midday`/`mbe-evening` batches (≤ 3), the shared antipattern
  ratchet, and ±1 px baseline cascades (gotchas § CI) decides whether the loop
  is polish or churn.
- **Rubric version bumps — Architect.** Who may bump `rubric_version` (the
  routine proposing, a human merging?) and what a bump does to open findings.
- **Cron slot — Architect**, from the gaps in `docs/scheduled-tasks.md`
  (occupied daily UTC slots today: 00:11, 04:47, 09:37, 11:29, 13:17, 14:21,
  16:03, 18:00, 20:07); one more daily run against the Max 20x baseline of 6.
- **Cost and duration — Verify.** One bounded pass over ≈ 149 routes with
  screenshots and a multimodal judge; wall-clock and tokens recorded. If the
  daily fire cannot finish inside a routine's window, the ledger's cadence (not
  its completeness) is what Architect trades.
- **The buyer half — nobody in this run.** Zero `mailto:` inbound stays
  recorded as silence; Operate watches it, and no criterion here claims
  conversion.

Next stage: **Architect** (`ux: not-applicable`) — from this worktree, produce
`docs/features/ui-quality-loop/architecture.md` echoing `ux: skipped — <reason
above>` in its frontmatter.
