---
kind: autorun-brief
run: feature:ui-quality-loop
date: 2026-09-28
---

# Autorun brief: a UI-quality loop that keeps every page at a world-class bar, with no human in the loop

Not an artifact — this file never counts toward orientation or active-run
discovery. It is the single source of interview answers for every stage
after Idea. Where it is silent, a stage takes its skill's recommended default
and logs it under `assumptions:`; where no default exists, it stops and
surfaces. `idea.md` (written live with Matt on 2026-09-28, then corroborated
with a `last30days` pass) is the source for problem / who / why now /
evidence / hunch / success / unknowns — do not re-ask those; read it.

## Origin

Direct — Matt, `/idea` interview 2026-09-28. Not from a backlog seed. In-flight
check ran 2026-09-28 (5 open PRs, none related) — recorded in `idea.md`
frontmatter.

## Run scale and slug

Feature run. Slug `ui-quality-loop`; artifacts under
`docs/features/ui-quality-loop/`. Idea stage complete (`idea.md`). **Next
stage: PRD.**

## Human decisions already made (Matt, this session, 2026-09-28)

1. **Scale:** feature run, all three surfaces (`apps/hospitality`,
   `apps/marketing`, `apps/rialto-web`), not one-app-first.
2. **Problem / who:** prospect can tell an AI built it; the UI is the sales
   proof. Two personas weighted **equally** — founder/CTO evaluating an AI-run
   dev shop, and a restaurant operator trialling hospitality.
3. **Why now:** factory output outran its taste gate (details in `idea.md`).
4. **Solution shape (his words):** run it as a **daily routine** and **keep
   track of pages changed so we can cover everything** — a page-coverage
   ledger. Asked mid-interview "anything we can catch with visual regression
   too?" → yes, VR is the regression floor (hospitality + marketing have zero
   VR today).
5. **Success:** ledger shows 100% of routes audited within the trailing 30
   days; zero audit-filed P1 UI defects older than 7 days; an **automated**
   taste rater scores every app ≥ 4/5 on "built by a professional team".
   **No human in the loop** ("if possible") — at most a one-time calibration
   of the rater, which is itself an unknown.
6. **Kill-risks — all four rated real:** LLM judge rubber-stamps its own
   taste; routine cannot reach prod or authenticated pages (sandbox has no
   egress, hospitality is behind Auth0); daily polish PRs flood and regress
   each other; "world-class" never converges without a versioned rubric.
7. **Release authorization: GRANTED — "Merge + create routine ENABLED"** (see
   § Release authorization).
8. **UX surface: none — `ux: not-applicable`.** Reason for the PRD's
   `ux-reason:`: the loop is factory tooling; the ledger and rater scores live
   as JSONL/markdown in the repo and in PR/issue bodies, like every other
   sensor here (`metrics/*.jsonl`, `.claude/improvement-loop/log.md`). A
   `/rialto/quality` dashboard was offered and declined for this run — record
   it as a follow-up seed at Operate, and design the ledger format so a page
   can read it later.
9. **Tracker: no mirror for the run's own build.** The 11 open `[Audit]`
   issues (#5270–#5280) and the 37 unclaimed UI-flavoured backlog seeds are
   **not** work items; the loop consumes them **at runtime** as findings on
   its first passes. No `(tracker: #N)` references in the breakdown; no
   issues created by Decompose; no export of the breakdown as issues.

## Scope

**In:**

- **Page-coverage ledger** — every route across the three apps, when each
  was last audited, what changed since, provably complete coverage over a
  cadence. Committed data, not browser state.
- **Daily routine** — a RemoteTrigger on claude.ai, prompt authored as a repo
  doc under `docs/routines/` and mirrored in `docs/scheduled-tasks.md`, like
  the existing `mbe-*` routines. It works the ledger, applies the quality bar,
  routes findings.
- **Versioned quality bar** with four faces — bugs, "does not look
  agent-built", navigation, accessibility. The "agent-built" face uses the
  community-enumerated tells as its first rubric version (idea.md § Community
  corroboration: unasked-for permanent dark theme, gradient backgrounds,
  icon-card grids, Inter headlines, 1px gray card borders, three-feature-card
  rows, generic hero copy) so the bar is checkable, not a mood.
- **Automated taste rater** — a multimodal judge scoring screenshots against
  the rubric. Design constraint from the evidence: WebDevJudge (ICLR 2026)
  measured single-answer LLM judging at 63.9% vs human 84.6% agreement and
  pairwise at 70.3% — prefer pairwise/contrastive judging (A vs B, or page vs
  reference set) over absolute scoring, and treat the rater's calibration as
  an explicit acceptance criterion, not a given.
- **Semantic a11y face** — beyond axe: the CHI EA '26 fault types (non-
  descriptive alt text, vague link purpose, heading–content mismatch) where
  LLM judges reach 80–92% recall; axe/Lighthouse remain the syntactic floor.
- **Visual-regression baselines and specs for `apps/hospitality` and
  `apps/marketing`** (currently 0 and 0), following the existing
  `apps/rialto-web/e2e/visual.spec.ts` + `playwright.config.ts` pattern and
  the measured threshold/budget rule (`scripts/visual-tolerance-rule.mjs`).
  Baselines come from a Linux CI artifact (`visual-noise-floor.yml`
  replica-a pattern), never macOS — gotchas § CI.
- **Routing of findings into existing carriers** — trivial fixes as PRs the
  routine opens (never merges), defects as `ready` issues for
  `/implement-queue`, the rest as `docs/backlog.md` seeds; dedupe against
  open issues by deterministic title, the way `scripts/scheduled-workflow-
health.mjs` does.
- **Generation-side constraint** — the community's fix is upstream: a
  versioned aesthetic rubric + rialto tokens fed to every UI-producing agent
  (a rule file / skill the implement-queue worker and routines load), so the
  loop stops refiling the same purple-gradient finding. Scope it small: the
  rubric document and its wiring into the existing agent instructions, not a
  new design system.

**Out:**

- Redesigning the apps themselves; a new design system (rialto already
  exists; brand vibe is Matt's standing direction: speakeasy / high-class /
  royalty / gen-z, expressed through rialto tokens, never over a11y).
- Provisioning Auth0 E2E credentials for the sandbox (human step, #3546).
- A dashboard / UI for the ledger (declined this run; seed at Operate).
- X/social sensors; any change to the `mbe-*` routines' own prompts other
  than adding the new routine to `docs/scheduled-tasks.md`.
- Working the 37 seeds / #5270–#5280 by hand inside this run.

## Success criteria (for PRD / Verify)

From `idea.md` § Success, made checkable:

1. **Coverage:** a committed ledger enumerates every route in the three apps
   (route inventory derived from source, not hand-typed) and records per-route
   `last_audited_at` + `last_changed_at`; a coverage report computes the
   trailing-30-day percentage and fails (non-zero exit) below 100% once the
   routine has had 30 days — Verify proves the computation on real data from
   one local pass, not the 30-day number itself.
2. **Correctness:** audit-filed P1 UI defects carry a deterministic title
   prefix and a `ui-quality` label; a check reports any older than 7 days.
3. **Taste:** the rater produces a per-app score with its rubric version,
   model id, and the screenshots it judged, persisted next to the ledger; a
   **calibration set** (≥ 10 screenshots, half from this repo, half reference
   pages of demonstrably professional apps) shows the rater ranks references
   above ours where a human would — one human labels the calibration set
   ONCE (Matt), which is the only human touch and is recorded as such.
4. **VR floor:** `apps/hospitality` and `apps/marketing` each have a Playwright
   visual spec + committed Linux baselines running in CI on PRs, with an
   explicit spec list (never a glob — gotchas § Build) and a workflow-coverage
   test like `apps/rialto-web/e2e/workflow-coverage.test.ts`.
5. **No human in the loop:** the routine runs end to end in the claude.ai
   sandbox with no `gh`, no egress to prod, and no Auth0 — i.e. it audits a
   **local build** of public routes via the GitHub MCP tools; the ledger
   records which routes were unreachable (auth-gated) instead of silently
   skipping them. Its first scheduled fire is the smoke test.
6. **Convergence:** the rubric is versioned; a finding is filed once per
   (route, rubric-version, tell) — re-running on unchanged pages files nothing
   new.
7. Existing gates green; docs prettier-clean; generated artifacts regenerated.

## Known unknowns (stop-and-surface only if a stage cannot proceed without an answer)

- Rater self-agreement / rubber-stamping — mitigated by pairwise judging and
  the one-time calibration set; whether that is enough is Verify's to
  measure, not assume.
- Sandbox reach: which routes are auditable from a local build without Auth0;
  the ledger must make the auth-gated set visible.
- Cost and duration of one full pass over ~80 routes with screenshots + a
  multimodal judge — measured at Verify.
- PR flood: the routine's PR budget per day and its interaction with
  `/implement-queue` — Architect decides a cap; brief default: the routine
  opens at most ONE fix PR per fire and files the rest as issues/seeds.

## Constraints

- Repo mandates apply (CLAUDE.md, AGENTS.md, `.claude/rules/gotchas.md`): TDD;
  surgical diffs; conventional commits; `pnpm` from inside a package or
  `pnpm --dir <abs>`; never `git add -A` (prettier hook dirt); stage explicit
  paths; docs prettier-clean before any docs PR; llms regen needs the CLI
  built; `pnpm typecheck` before done.
- Routine authoring conventions: prompt lives in `docs/routines/<name>.md`,
  schedule + intent in `docs/scheduled-tasks.md`, manifest in
  `scripts/routine-manifest.mjs` if that is how the other routines are
  registered — Architect confirms. Sandbox has no `gh` (use MCP GitHub
  tools), no egress to the live site (#2920), no Auth0 creds.
- Rialto rules: components must not `setState` in `useEffect`; `&apos;` in
  JSX strings; published-source changes need a changeset.
- Work happens in this worktree only: `/Users/mbutler/github/
mattbutlerengineering/.claude/worktrees/ui-quality-loop`, branch
  `feat/ui-quality-loop` off `origin/main` `35517bbae`, `pnpm install
--frozen-lockfile` done. The main checkout is 555 commits behind and dirty
  — never read or write it.
- A parallel autorun (`maintenance:agent-eval-claude-cli-caller`) is live in
  a sibling worktree; do not touch its files or branch.

## Verification spend (orchestrator assumption — logged here, not asked)

Matt authorized a **daily enabled routine**, which dominates any single local
run. Verify may therefore run **one bounded local pass**: build the apps
locally, screenshot the route inventory once, run the rater once over the
calibration set plus the repo's routes, and run the VR specs once. No repeated
passes, no `--deep` sweeps. Record wall-clock and token/cost evidence for the
unknown above.

## Release authorization

**Granted** (Matt, 2026-09-28, this session): **"Merge + create routine
ENABLED"**. Concretely, in this order, each gated:

1. **Merge the PR(s) to `main`** via the normal path: PR-level CI green
   (`CI Gate` as a real `pull_request` check — see gotchas § CI for
   `gate-missing` / `gate-unattributed`), the `reviewer` subagent gate passed,
   any specialist reviewers the diff matches (`e2e-selector-drift-reviewer`
   for the new Playwright specs; `rialto-prop-drift-detector` if rialto is
   touched; `generated-artifact-determinism-reviewer` for llms/dep-graph), no
   unfixed critical review finding. `gh pr merge <N> --auto --squash
--delete-branch`, or `--squash --subject` per gotchas when the title
   drifted. Matt's standing policy: review-gate pass + CI green → merge, no
   further human-in-the-loop; `tier:*` labels do not block.
2. **Commit VR baselines only from a Linux CI artifact** — dispatch the
   noise-floor / visual workflow, download the replica artifact, commit the
   PNGs. A macOS-rendered baseline is a release blocker, not a shortcut.
3. **Create the daily RemoteTrigger routine on claude.ai, `enabled: true`**,
   via the `RemoteTrigger` tool: prompt = the merged `docs/routines/<name>.md`
   fenced block byte-for-byte; environment, sources (this repo), allowed
   tools, and model mirrored from `mbe-weekly-improve`
   (`trig_01G12wULcCweXSb2jmVkChPW` — read it back first and copy its
   `job_config` shape); cron slot chosen by Architect from the gaps in
   `docs/scheduled-tasks.md` (assumption to log). Read the trigger back and
   diff its prompt against the doc; zero diff or stop. Record the new
   `trig_…` id in `docs/scheduled-tasks.md` in a follow-up commit.
4. **Post-release:** the first scheduled fire is the smoke test — Ship records
   `next_run_at`; Operate reads `list_runs` / `get_run_log` for that fire and
   the ledger row it should have committed.

**Not authorized:** touching any other routine's prompt or schedule; force-
running the new routine out of schedule more than ONCE (one `run` to smoke-
test after creation is allowed if Ship judges it necessary — log it);
merging with the visual job red on its own PR (gotchas: cascading red
streak); any deploy of the apps beyond what merging to `main` already
triggers via CI. Unfixed critical review findings block (1)–(3)
unconditionally — stop and surface.

## Decisions added after PRD (Matt, 2026-09-28)

10. **Rater calibration pass mark (SC-3):** the rater is trusted to run
    unattended when, on the ≥10-pair calibration set Matt labels once, its
    pairwise verdict agrees with his on **≥ 80% of pairs AND it never prefers
    one of our pages over a reference page** (an inversion is the rubber-stamp
    failure mode itself and is a hard fail regardless of the percentage).
    Chosen over 70% (WebDevJudge's measured LLM pairwise ceiling — too
    lenient) and 90% (near-human — likely un-shippable this run) and over
    shipping the rater ungated. Verify renders SC-3 against this number.
11. **P1 definition:** the PRD's mechanical definition (blank render,
    unhandled error, 404 from an in-app link, dead primary control, or an axe
    `critical` violation) stands — not overridden.

## Decisions added after Architect (Matt, 2026-09-29)

12. **No GitHub Actions capture leg for the 19 auth-gated hospitality
    routes — `unreachable:auth` stands** until #3546 lands or the leg is
    authorized later. The Operator persona's authed surface is covered by the
    per-PR VR floor only; the ledger must make that visible per route. Rejected
    for now: a daily (~8–12 runner-min/day) or weekly Actions leg pushing
    captures to an orphan ref — no second scheduled surface before the first
    has fired once.

13. **Reference set for the taste rater = permissively-licensed open-source
    UIs only.** Screenshots committed under `docs/ui-quality/reference/` may
    only be of apps whose UI source is MIT/Apache (or similarly permissive) —
    e.g. self-hosted demos of Cal.com, Supabase Studio, shadcn/ui examples,
    OSS Linear-style dashboards — each reference PNG recorded in the rubric
    with app name, license, source URL/commit, and capture date. No
    screenshots of proprietary products (Stripe, Linear, Vercel, …) in this
    public repo. Matt approves the chosen set at his one-time calibration
    labelling. Rejected: any-site-in-repo (copyright/ToS exposure), a private
    store (new credential → stop-and-surface), self-referential pairs only
    (the rubber-stamp risk).
