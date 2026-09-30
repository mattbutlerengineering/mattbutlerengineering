---
stage: architect
run: feature:ui-quality-loop
date: 2026-09-28
ux: "skipped — Factory tooling with no user-facing surface — the ledger, rubric and rater scores live as JSONL/markdown in the repo and in PR/issue bodies, like every other sensor here (metrics/*.jsonl, .claude/improvement-loop/log.md); a /rialto/quality dashboard was offered and declined for this run"
assumptions:
  - "OQ1 auth-gated hospitality rows: the 19 routes under `<App />` land in the ledger as `unreachable:auth` until #3546 provisions sandbox credentials. A second capture leg in GitHub Actions (which has the E2E Auth0 secrets and egress) was rejected because it is new recurring spend beyond the one daily routine Matt authorized — it is priced under § Open questions, not decided here."
  - "OQ2 ledger vs SURFACE_REGISTRY: the committed ledger is the single source of truth for route-template coverage; `packages/agent-core` SURFACE_REGISTRY stays as-is as `/site-audit`'s curated prod-Lighthouse sample (it also carries `api_endpoint` surfaces and live-site score history — a different access pattern). One new guard test asserts every registry `page` surface for the three apps maps to a ledger row (registry ⊆ ledger), so the hand-typed list can never name a route that no longer exists. Its 90 surfaces are not reconciled or generated in this run."
  - "OQ3 PR flood: at most ONE fix PR per fire (never raised), scoped to non-visual fixes only (alt text, link purpose, aria, dead links, copy, unhandled errors — never CSS/layout/colour/type, never `packages/rialto/src/**`, never `.github/`), opened against a `ready` issue the routine filed and then labelled `has-pr`, so it enters the existing implement-queue state machine and its reviewer + `CI Gate` train. Issues: every P1 plus at most 3 P2 per fire; a fire with more than 5 P1 findings sharing one tell files ONE aggregate issue for that tell; everything else becomes a `docs/backlog.md` seed. Visual/taste findings never become a routine fix PR (±1px baseline cascades, gotchas § CI)."
  - "OQ4 rubric version bumps: only a human bumps `rubric_version`, by PR to `docs/ui-quality/rubric.json` + `rubric.md`; the routine may propose one via a `meta-improvement` issue and never edits the rubric. A tells-hash guard fails CI when tells change without a bump. On a bump, open findings keep their issue: `findings.mjs migrate` re-keys every open finding whose tell id survives to the new version (same issue number, no refile); findings whose tell was retired are commented and closed `not_planned` by the routine on its first fire at the new version."
  - "OQ5 cron + model: `23 7 * * *` UTC (Daily 12:23am PT) — the 07:00–09:30 UTC gap after `mbe-night` (04:47) has finished draining and before `mbe-auditor` (09:37), an off-minute like every sibling; model `claude-opus-5`, environment `env_012GDG167Tpz55u8MEpDkL2y`, both mirrored from `mbe-weekly-improve` per the brief. The taste judge is the load-bearing unknown, which is the reason this is the first daily opus routine; plan budget goes from 6 to 7 daily runs."
  - "Rater mechanism: pairwise A/B judgement by the routine's own session model reading two PNGs (ours vs a named reference of the same category) with a fixed JSON verdict schema; A/B position is decided by a deterministic hash of the pair key so re-runs reproduce; per app per fire the sample is 3 taste-eligible routes × 2 references = 6 pairs; app score = 5 × mean(ours preferred = 1, tie = 0.5, reference preferred = 0). Calibration re-runs automatically whenever `model_id` differs from the last passing calibration record; an inversion is 'rater prefers ours where Matt preferred the reference'."
  - "Screenshots in the sandbox: a per-app Playwright capture spec (`apps/<app>/e2e/ui-quality.capture.ts` under `playwright.ui-quality.config.ts`) runs against `vite preview` of a local production build; Chromium is whichever pre-installed browser `scripts/ui-quality/browser.mjs` resolves (the sandbox's `chromium_headless_shell` revision does not match the repo's Playwright and `cdn.playwright.dev` is not egress-allowlisted — `.claude/improvement-loop/log.md` 2026-09-08 entry). No usable browser → every due row `unreachable:build`, run record `blocker: no-browser`, no findings filed, ledger still committed. The first scheduled fire is the only place this can be measured."
  - "Ledger format: `metrics/ui-quality-ledger.jsonl`, one sorted row per route, registered in `scripts/metrics-store.mjs` (`durable: true`) with a `!merge` gitattribute (it is rewritten in place, not appended, so `merge=union` would duplicate rows). Identity columns (`route`, `app`, `kind`, `auth`, `source_files`) are generated from source; audit columns are preserved across regeneration; the file is a `regen-manifest.mjs` family so `pnpm regen --check`, CI's Integrity job and `drift-fix.yml` are its drift guard."
  - "`last_changed_at` is `git log -1 --format=%cI` over the route's own source files (its page module + the router file); shared component/layout changes do not bump it — the 28-day re-audit TTL covers them. In a shallow clone the value degrades to the HEAD commit date (an upper bound, so the route reads as due sooner, never later); the run record notes `git_depth`."
  - "P1 is mechanical only: blank render, `pageerror`, an in-app link whose target matches no route template, or an axe `critical` violation. 'A primary control does nothing' cannot be proven without a scripted interaction, so the model files it as P2 with `suspected` in the body; a human promotes it."
  - "Reference set: at least 5 PNGs of demonstrably professional pages committed under `docs/ui-quality/reference/` with `references.json` provenance (source URL, capture date, viewport, sha256), captured once outside the sandbox — the sandbox has no egress, so a reference can only ever be a committed file. Their categories mirror ours: marketing-site, booking/checkout, product dashboard, component docs."
  - "Rubric: machine-readable `docs/ui-quality/rubric.json` (version, tells_hash, tells, references, route categories, calibration pass mark) plus prose `docs/ui-quality/rubric.md`; a test pins tell ids across both and the hash. JSON rather than YAML frontmatter because nothing in `scripts/` depends on a YAML library."
  - "Labels `ui-quality`, `ui-quality:p1`, `ui-quality:p2` are declared in `scripts/ui-quality/labels.mjs` and created once at Ship with `gh label create` (the sandbox's MCP surface has no label API); the routine fails closed if a created issue comes back without `ui-quality`."
  - "Generation-side wiring: `.claude/rules/ui-quality.md` (≤60 lines, `paths:`-scoped to `apps/**/*.{tsx,css}` and `packages/rialto/**` if the installed Claude Code honours path scoping — otherwise it loads unconditionally and stays short), one pointer line in `packages/rialto/CLAUDE.md` § AI Assistant Reference, one bullet in `.claude/agents/implement-queue-worker.md` step 3. No new skill."
  - "The shared browser-capture helper lives in `@mbe/test-fixtures` (`src/ui-quality-capture.ts`) — dependency-cruiser's `apps-not-imported` rule forbids a root-level runner from importing `apps/hospitality/e2e/api-mocks.ts`, and the public booking routes are only meaningful with those mocks, so capture must run inside each app's e2e boundary and share logic through a workspace package."
  - "VR floor: `apps/hospitality/e2e/visual.spec.ts` and `apps/marketing/e2e/visual.spec.ts` enumerate the ledger's `page` rows for their app at test time (so a new route fails with a missing snapshot rather than being silently uncovered), at 1280×720 and 375×812, run by a new `.github/workflows/apps-visual.yml` with explicit spec paths; `visual-noise-floor.yml` gains a `workflow_dispatch` `app` input; `scripts/visual-diff-comment.mjs`'s marker gains a `suite` discriminator so two suites on one PR keep separate sticky comments."
  - "Legacy findings: the routine links an open `[Audit]` issue (#5270–#5280) to a reproduced finding by recording the issue number under the finding key (no refile) and comments once when a route it names audits clean; backlog seeds are cited in issue bodies and never edited by the routine."
  - "Deterministic titles: issues `ui-quality: <app> <route> — <tell-id> (rubric v<N>)`, aggregate `ui-quality: <app> — <tell-id> on multiple routes (rubric v<N>)`, ledger PR `chore(ui-quality): ledger <YYYY-MM-DD>` (the routine's liveness signature, pr-title), fix PR `fix(<app>): ui-quality <YYYY-MM-DD> — <short>`."
  - "Constants (one module, `scripts/ui-quality/config.mjs`): AUDIT_TTL_DAYS 28, MAX_ROUTES_PER_FIRE 40, MAX_P2_ISSUES_PER_FIRE 3, P1_BURST_AGGREGATE_AT 5, TASTE_SAMPLE_ROUTES 3, TASTE_REFERENCES_PER_ROUTE 2, VIEWPORTS [1280×720, 375×812]. Verify's single bounded pass is the first measurement of whether 40 routes fit one fire."
  - "Routine liveness grace: `routine-liveness.mjs` learns an optional `activatedAt` manifest field and reports `pending` (files nothing) while a routine with a real signature is younger than 2× its period — otherwise the 08:10 UTC checker would file a false `dark` on the morning between merge and first fire. Ship records the trigger creation date there."
  - "Judged-output normalisation (Architect re-entry 2026-09-29, breakdown § Design gaps; the brief is silent): `detect.mjs judged` — the Decompose candidate, taken — is the one module that validates the model's per-route `.ui-quality/judged/<app>.json` against `rubric.json` and the capture manifests and emits judged `Finding[]`; the model never writes a `Finding`. One unknown-tell rule at every seam: where model output enters (`detect.mjs judged`, `rate.mjs record`) a tell id the rubric lacks, or whose `detection` is not `judged`, is dropped, logged and counted (`dropped_tells`) and the route or pair still counts; where only validated input arrives (`findings.mjs plan`) it exits 2. `unjudged:<reason>` (`tool-error | malformed | missing`) is a fourth `reachability` value written by `ledger.mjs record` from `.ui-quality/judge-status.json` — the Decompose candidate of a flag on the capture manifest row was declined because the manifest is Capture's output and nothing but the ledger value has readers (`due`, `coverage`); only `audited` advances `last_audited_at`, so an unjudged row stays due and never counts toward coverage, and a missing judge-status file marks every captured row `unjudged:missing`. Judged severity is the tell's `default_severity`, never the model's, so P1 stays mechanical."
---

# Architecture: A UI-quality loop that keeps every page at a professional bar, with no human in the loop

## Approach

Three boring things and one judged thing. The boring things are pure Node modules under `scripts/ui-quality/` in the house pattern of `metrics-store.mjs` / `issue-filing.mjs` / `visual-tolerance-rule.mjs`: a route inventory generated from the three routers, a coverage ledger that is a `regen-manifest` family, a findings ledger deduplicated through `fileIssue()`, and a rater record format — every decision testable with zero network. The judged thing is the routine itself: a daily Claude Code session (`docs/routines/mbe-ui-quality.md`) that builds the apps, drives a per-app Playwright capture spec against `vite preview`, reads the screenshots with its own multimodal model, applies a versioned rubric, and executes the filing plan the scripts hand it through the GitHub MCP tools — the only GitHub path that works in a claude.ai sandbox (gotchas § Claude Code Remote). Policy (what is due, what a finding is, whether it is new, what carrier it takes) never imports the transport: the scripts emit plans and consume results as JSON files, and the model is the humble adapter between them and Playwright, MCP and git.

The alternative shape — a GitHub Actions workflow doing capture, axe, and filing with `gh`, and the routine only judging — was compared and lost twice over: it is new recurring spend the brief did not authorize, and its artifacts cannot reach the sandbox (blob-storage egress is denied; only git and the GitHub API are). It survives as the priced open question for the auth-gated rows. The VR floor (SC-4) is separate from the loop by design: it is per-PR, in CI, pixel-only, and follows `apps/rialto-web` exactly; the loop is daily, in the sandbox, judgement-heavy. They share one thing — the ledger's route set — so a route that exists is a route both cover.

## Components

Split by capability. Every module under `scripts/ui-quality/` is pure with injected I/O (`fs`, `git`, `now`) and has a `scripts/__tests__/ui-quality-*.test.mjs`; the CLI entry is the only impure line.

### Route inventory — `scripts/ui-quality/routes.mjs`

- Responsibility: turn the three router declarations into `RouteTemplate[]`, byte-identical on the same commit. Three adapters, one shape: hospitality (`createBrowserRouter` object tree in `apps/hospitality/src/main.tsx` — nested `path`/`index`, `auth: auth0` for every child of the route whose element is `<App />`, `redirect` for `callback`, `not-found` for `*`), marketing (`<Route path>` JSX in `App.tsx`; `<Navigate>` → `redirect`), rialto-web (`routeTree` in `routes.tsx` plus the spread of `PAGE_REGISTRY` entries' `path` literals from `data/page-registry.ts`). Uses the TypeScript compiler API already in the workspace — a `path=` grep matched test files and produced idea.md's wrong ~80 (prd.md assumption 1).
- Collaborators: Coverage ledger (its only caller).

### Coverage ledger — `scripts/ui-quality/ledger.mjs`

- Responsibility: own `metrics/ui-quality-ledger.jsonl` and every question asked of it: `generate` (identity columns from Route inventory, audit columns preserved, new rows' `last_changed_at` from `git log`), `check` (regenerated identity set ≠ committed → exit 1), `refresh` (recompute `last_changed_at` for all rows), `due` (rows to visit this fire: never audited, changed since last audit, or audited > `AUDIT_TTL_DAYS` ago; auth-gated rows are written `unreachable:auth` without being attempted; capped at `MAX_ROUTES_PER_FIRE`, staleness-first; parameterised routes resolved through `scripts/ui-quality/route-fixtures.json`), `record` (apply the capture manifests and `.ui-quality/judge-status.json`: a captured-and-judged row becomes `audited` and advances `last_audited_at` + `rubric_version`; a captured row the judge did not judge becomes `unjudged:<reason>` with its dates untouched, so it is due again tomorrow; an absent judge-status file marks every captured row `unjudged:missing`). Registered in `regen-manifest.mjs` FAMILIES with `changedBy()` over the four router/registry files, so the existing PostToolUse hooks, `pnpm regen --check`, CI Integrity and `drift-fix.yml` guard it with zero new machinery (its output must join `drift-fix.yml`'s `add-paths`; `scripts/__tests__/drift-fix-workflow.test.mjs` fails until it does).
- Collaborators: Route inventory, `metrics-store.mjs` (path, durability, gitignore block), `regen-manifest.mjs`, Mechanical detectors (`judge-status.json` in), the VR specs (read `page` rows), Coverage report, Routine.

### Coverage report — `scripts/ui-quality/coverage.mjs`

- Responsibility: the SC-1 number. Trailing-30-day audited percentage over `reachability: audited` rows; `unreachable:*` rows leave the denominator and are listed by reason; `unjudged:*` rows stay in it and are listed under their own heading — a route the loop reached but did not judge is a coverage gap, not an unreachable one; exit 1 below 100 % once 30 days have elapsed since the first row of `metrics/ui-quality-runs.jsonl`; before that, exit 0 with the figure printed as provisional. Reports via `scripts/lib/fitness-check.mjs`'s `runCheck`. Deliberately not a `scripts/check-*.mjs` (that prefix means "wired into `repo-audit`, fails the build" — a coverage lapse caused by a skipped fire must not red every PR; same reasoning as `metrics-freshness.mjs`).
- Collaborators: Coverage ledger, runs record, Routine (prints it into the log entry), Operate.

### Rubric — `docs/ui-quality/rubric.json` + `rubric.md` + `scripts/ui-quality/rubric.mjs`

- Responsibility: the fixed, versioned bar. `rubric.json` carries `rubric_version` (integer), `tells_hash`, `tells[]` (`id` like `agent-built/gradient-background`, `face` ∈ bugs | agent-built | navigation | accessibility, `detection` ∈ mechanical | judged, `default_severity` P1 | P2, `axe_rules` for a11y tells that map to axe ids), `references[]` (id, category, file, source url, captured at), `route_categories` (app/pattern → category; `harness` for `visual-test` routes, which are never taste-sampled), `calibration.pass_mark` = `{ agreement: 0.8, inversions: 0 }`. `rubric.md` is the prose the judge reads, one `### <tell-id>` per tell with what it looks like and what a professional team does instead — v1 is the community-enumerated list (permanent dark theme nobody asked for, gradient backgrounds, icon-card grids, Inter headlines, 1 px gray card borders, three-feature-card rows, generic hero copy) plus the CHI EA '26 semantic-a11y faults (non-descriptive alt, vague link purpose, heading–content mismatch) on top of the axe floor. `rubric.mjs` loads and validates; `scripts/__tests__/ui-quality-rubric.test.mjs` pins id parity across the two files and `tells_hash` = sha256 of the sorted tell ids + detection + severity.
- Collaborators: Mechanical detectors, Findings, Taste rater, Generation-side rule (points at it), Routine.

### Capture — `apps/<app>/e2e/ui-quality.capture.ts`, `apps/<app>/playwright.ui-quality.config.ts`, `@mbe/test-fixtures/ui-quality-capture`, `scripts/ui-quality/browser.mjs`

- Responsibility: turn a due list into pixels and facts. `browser.mjs resolve` finds a launchable Chromium (`UI_QUALITY_CHROMIUM` env → Playwright's own registry path if present on disk → any `~/.cache/ms-playwright/chromium*/` or `chromium_headless_shell*/` binary regardless of revision → `which chromium chromium-browser google-chrome`), launches it once to prove it, prints the path or exits 3. The per-app config extends the app's base config with `testMatch: /ui-quality\.capture\.ts$/` (default `testMatch` never collects it, so `test:e2e` auto-discovery and both `workflow-coverage.test.ts` files ignore it), `use.launchOptions.executablePath` from that env, no `setup` dependency, `webServer` = `vite preview` of the built dist (hospitality with `.env.example`'s placeholder `VITE_AUTH_*` — `validateAuthConfig()` renders `AuthConfigError` on every route, public ones included, when they are empty). The spec reads `UI_QUALITY_PLAN`, installs app-specific setup (hospitality: `mockApi(page)` + `page.clock.setFixedTime`, the `timeline.spec.ts` pattern), then calls the shared `capturePage(page, route, opts)` which emulates reduced motion, screenshots each viewport to `.ui-quality/captures/<app>/`, runs `AxeBuilder` (all impacts, `color-contrast` kept on — this is a full-page audit, not a token test), and collects `pageerror`s, console errors, failed same-origin requests, same-origin hrefs, and a blank-render measure (main landmark text length + painted area). One `manifest.jsonl` row per route.
- Collaborators: Coverage ledger (`due` in, `record` out), Mechanical detectors, Taste rater, Routine.

### Mechanical detectors — `scripts/ui-quality/detect.mjs`

- Responsibility: the only `Finding[]` producer, two subcommands. `mechanical` — findings a script can prove. From capture manifests + the ledger route set + rubric: `bugs/blank-render`, `bugs/unhandled-error`, `bugs/dead-in-app-link` (a same-origin href that matches no route template of its app and is not a redirect/catch-all target), `bugs/failed-request`, `accessibility/axe-<impact>` (critical → P1, everything else P2). `judged` — the model's per-route `.ui-quality/judged/<app>.json` validated against the same rubric and manifests: a tell id the rubric lacks, or whose `detection` is not `judged`, is dropped, logged and counted; severity is the tell's `default_severity`, never the model's (P1 stays mechanical); evidence gains the route's screenshot sha256s; and every judgeable route is written to `.ui-quality/judge-status.json` as `judged` or `unjudged:<reason>`. Both emit `Finding[]` in one shape with evidence (selector, message, href, screenshot sha256). Never judges — `judged` checks JSON against the rubric and never reads a pixel.
- Collaborators: Capture, Rubric, Judge (its raw output in), Findings, Coverage ledger (`judge-status.json` out).

### Taste rater — `scripts/ui-quality/rate.mjs`, `docs/ui-quality/reference/`, `docs/ui-quality/calibration.json`

- Responsibility: the SC-3 record, not the judgement. `pairs` builds the per-app pair list (taste-eligible captured routes × references of the same category, A/B side from `sha256(pair key)` parity) and writes a JSON plan with both image paths; the model reads each pair with its own image input and answers the verdict schema `{ pair_id, verdict: "A" | "B" | "tie", tells: [tell-id], note }`; `record` validates the verdicts (a tell id in a verdict that the rubric lacks is dropped, logged and counted as the row's `dropped_tells`; the verdict stands — the unknown-tell rule under § Interfaces "Judge"), computes the app score, and appends one row per app to `metrics/ui-quality-ratings.jsonl` with `rubric_version`, `model_id` (from `docs/routines/mbe-ui-quality.md` frontmatter unless the routine passes `--model-id`), the exact screenshots by path and sha256, and every pair verdict. `calibrate` compares verdicts on `calibration.json`'s Matt-labelled pairs to the pass mark and exits 0/1 with the N-of-M and every disagreement listed — Verify's SC-3 evidence, and re-run by the routine whenever `model_id` changes; a failing calibration marks the fire's ratings `calibration: failed` and suppresses agent-built findings (fail closed; bugs/a11y still file). Absolute single-answer scores are never produced.
- Collaborators: Capture, Rubric, Routine (executes the judge), Verify.

### Findings — `scripts/ui-quality/findings.mjs`

- Responsibility: identity, dedupe, carrier. Key = `<app>|<route>|r<rubric_version>|<tell-id>`; ledger `metrics/ui-quality-findings.json` is `Record<key, { issue, carrier, state, first_seen, last_seen, legacy? }>`. `plan --findings <json>… --issue-states` runs every finding (both detector outputs, one shape) through the shared `fileIssue()` with `getIssueState` backed by the state map the model fetched and `createIssue`/`reopenIssue` recorded as pending actions, then assigns carriers by rule: every P1 → issue; more than `P1_BURST_AGGREGATE_AT` P1s on one tell → one aggregate issue; P2 → issue while the fire's `MAX_P2_ISSUES_PER_FIRE` budget lasts, then `seed`; one finding per fire may additionally be marked `fix-pr-candidate` when its tell is in the non-visual allowlist and its evidence names a single file. Emits titles (deterministic, no timestamps), bodies (evidence, rubric link, legacy issue citation, backlog seed citation), labels (`ui-quality`, `ui-quality:p1|p2`, `ready`). `record` writes the executed numbers back; `migrate --from --to` re-keys open findings across a rubric bump; `seeds` renders the backlog lines.
- Collaborators: Mechanical detectors (`mechanical` and `judged` — the only two `Finding[]` sources, one shape), Taste rater (calibration status only), `scripts/lib/issue-filing.mjs`, Routine.

### P1 SLA — `scripts/ui-quality/p1-age.mjs`

- Responsibility: the SC-2 check. Given open issues (`--issues <json>` from MCP in the sandbox, or `gh issue list --label ui-quality:p1 --state open --json number,title,createdAt` anywhere with `gh`), lists those older than 7 days and exits 1 when any exist. The routine runs it every fire and escalates breaches by adding `needs-review` and one comment (deduped through the findings ledger's `escalated_at`), which lands them in `mbe-weekly-retro`'s human-blocked pass without touching that routine.
- Collaborators: Findings, Routine, Verify.

### Routine — `docs/routines/mbe-ui-quality.md`, catalog row, manifest entry, `metrics/ui-quality-runs.jsonl`

- Responsibility: the one unattended actor; everything above is what it calls. Prompt shape (frontmatter `trigger_id`, `environment_id`, `cron: "23 7 * * *"`, `model: claude-opus-5`, `cadence: Daily 12:23am PT`; fenced `text` block): (0) install, build `@mbe/cli...` and the three apps, `pnpm build --filter @mattbutlerengineering/rialto`; (1) `ledger.mjs refresh` then `due`; (2) `browser.mjs resolve` — on exit 3 record `blocker: no-browser` and skip to (7); (3) run the three capture configs; (4) `detect.mjs mechanical`; (5) read the rubric, then each captured screenshot, writing `.ui-quality/judged/<app>.json` per app in the Judge schema (`unjudged: "tool-error"` for any image it cannot read — never a silent skip, never a `Finding`), then `detect.mjs judged`; `rate.mjs pairs` → judge → `record`, calibrating first if `model_id` changed; (6) fetch issue states for every planned key via MCP, `findings.mjs plan` over both detector outputs, execute creates/reopens/comments via MCP, `record`; open at most one fix PR for the marked candidate (TDD, gates, `has-pr` on its issue, never merge); `p1-age.mjs` and escalate; (7) `ledger.mjs record` (which also appends the runs row, `unjudged` and `dropped_tells` counted from `judge-status.json`), append the dated `.claude/improvement-loop/log.md` entry (including "no findings"/"no browser"), commit only `metrics/ui-quality-*`, `docs/backlog.md`, `.claude/improvement-loop/log.md` on the rolling branch `ui-quality/ledger` (fetch + `git merge origin/main` when yesterday's PR is still open; fall back to `ui-quality/ledger-<date>` on conflict) and open/refresh the PR `chore(ui-quality): ledger <date>` labelled `has-pr`. Never fetches the live site, never runs `gh`. `routine-manifest.mjs` entry: `periodDays: 1`, `signature: { type: "pr-title", pattern: chore\(ui-quality\): ledger \d{4}-\d{2}-\d{2}, searchTerm: "ui-quality" }`, `activatedAt` set at Ship; `docs/scheduled-tasks.md` gains the catalog row and a plan-budget line (7 daily).
- Collaborators: every component above; GitHub via MCP; `.claude/improvement-loop/log.md`.

### VR floor — `apps/{hospitality,marketing}/e2e/visual.spec.ts`, `playwright.visual.config.ts`, `.github/workflows/apps-visual.yml`

- Responsibility: SC-4, the rialto-web pattern applied twice. Each spec reads the ledger's `page` rows for its app (fs read of `metrics/ui-quality-ledger.jsonl` + `route-fixtures.json` — data, not an import) and `toHaveScreenshot`s each at both viewports; hospitality uses `mockedPage` + a fixed clock and the `setup` auth project (CI holds the E2E secrets per `e2e.yml`), marketing uses `vite preview`. Each `playwright.visual.config.ts` declares `threshold`/`maxDiffPixels` with the two `// noise-floor:` provenance lines and inherits `snapshotPathTemplate` into `e2e/screenshots/`; the base configs add `**/visual.spec.ts` to `testIgnore` so the bare `test:e2e` never double-runs it (hospitality's guard test only forbids narrowing that bare invocation, which this does not). `apps-visual.yml` has one job per app naming the spec by full path, path-filtered on the app and `packages/rialto/src/**`, artifacts `<app>-visual-diffs` + `<app>-visual-report`, and a `publish-visual-diffs` job per app invoking `scripts/publish-visual-diffs.mjs` with `VISUAL_SUITE=<app>` — the comment marker becomes `<!-- visual-diffs-in-pr suite=<name> run=` so it cannot collide with rialto-web's on a PR that touches rialto. `visual-noise-floor.yml` gets an `app` dispatch input selecting config/spec/screenshot dir (hospitality legs receive the E2E secrets); its `measure/**` push path stays rialto-web only, so the trigger-hygiene test is unaffected. Guards: `visual-tolerance-guard.test.mjs` and `visual-defect-reproduction.test.mjs` parametrised over the three configs; marketing gets an `e2e/workflow-coverage.test.ts` (bare `test:e2e` in `e2e.yml` + `visual.spec.ts` by full path in `apps-visual.yml`), hospitality's is extended with the same second assertion. Baselines are Linux-only, from the replica-a artifact, provenance recorded in the config.
- Collaborators: Coverage ledger (route set), `scripts/visual-tolerance-rule.mjs`, `scripts/publish-visual-diffs.mjs`, `e2e-selector-drift-reviewer` at PR time.

### Generation-side rule — `.claude/rules/ui-quality.md`

- Responsibility: stop the loop refiling the same tell. Forty-odd lines: the tell ids as a checklist, the rialto token rules that answer each (`packages/rialto/CLAUDE.md` § Token Usage Rules), and "read `docs/ui-quality/rubric.md` before writing UI". Auto-loaded by every Claude Code session in this repo and every worktree (implement-queue workers, routines). `packages/rialto/CLAUDE.md` § AI Assistant Reference and `.claude/agents/implement-queue-worker.md` step 3 each gain one pointer line. `detect-instruction-rot.mjs` guards the paths.
- Collaborators: Rubric; every UI-producing agent.

### Labels — `scripts/ui-quality/labels.mjs`

- Responsibility: one declaration of `ui-quality`, `ui-quality:p1`, `ui-quality:p2` (name, colour, description) consumed by Findings and printed as `gh label create` commands for the one-time bootstrap. The routine treats a created issue whose returned labels lack `ui-quality` as a bootstrap failure: it logs, stops filing, and still commits the ledger.
- Collaborators: Findings, Routine, Ship.

### SURFACE_REGISTRY subset guard — `packages/agent-core/src/__tests__/audit-surface-registry-ledger.test.ts`

- Responsibility: registry ⊆ ledger for `page` surfaces whose URL path resolves into one of the three apps. The registry keeps its job; it just cannot drift ahead of source any more.
- Collaborators: Coverage ledger (reads the committed file), `/site-audit` (unchanged).

## Data model

Access patterns first: the ledger is rewritten whole by two writers (regen for identity, the routine for audit state) and read whole by three readers (due-selection, coverage, the VR specs); findings are looked up by key and updated per key; ratings and runs are append-only trends. Consistency: everything settles at the next PR merge — no reader needs a write to be visible within a fire except the routine's own plan→record round-trip, which is one process reading files it just wrote.

```jsonc
// metrics/ui-quality-ledger.jsonl — one row per route template, sorted by (app, route). `!merge`.
{
  "route": "book/:venueSlug",               // identity — generated
  "app": "hospitality",                     // identity — generated
  "kind": "page",                           // page | redirect | not-found — generated
  "auth": "public",                         // public | auth0 — generated
  "source_files": ["apps/hospitality/src/pages/PublicBookingPage.tsx", "apps/hospitality/src/main.tsx"],
  "last_changed_at": "2026-09-24T20:21:26Z", // refreshed by the routine; new rows at generate
  "last_audited_at": null,                  // audit state — preserved by generate
  "rubric_version": null,                   // audit state
  "reachability": null                      // outcome at the last fire: audited | unreachable:auth | unreachable:build
                                            //   | unjudged:<tool-error|malformed|missing> — only audited advances last_audited_at
}

// metrics/ui-quality-findings.json — Record<key, record>; key = app|route|r<version>|tell-id
{ "hospitality|book/:venueSlug|r1|accessibility/non-descriptive-alt":
  { "issue": 5901, "carrier": "issue", "state": "open", "severity": "P2",
    "first_seen": "2026-10-02", "last_seen": "2026-10-02", "legacy": 5271, "escalated_at": null } }
// carrier ∈ issue | aggregate:<issue> | seed | fix-pr:<pr>

// metrics/ui-quality-ratings.jsonl — append-only, merge=union
{ "ts": "…", "app": "marketing", "rubric_version": 1, "model_id": "claude-opus-5",
  "score": 3.75, "dropped_tells": 0, "pairs": [ { "id": "…", "ours": { "route": "/", "viewport": "1280x720", "sha256": "…", "path": "…" },
  "reference": { "id": "stripe-home", "sha256": "…" }, "position": "AB", "verdict": "B", "tells": ["agent-built/generic-hero-copy"] } ],
  "calibration": { "status": "pass", "agreement": 0.9, "inversions": 0, "pass_mark": { "agreement": 0.8, "inversions": 0 } } }

// metrics/ui-quality-runs.jsonl — append-only, merge=union; first row anchors the 30-day clock
{ "ts": "…", "due": 40, "audited": 37, "unreachable": { "auth": 19, "build": 2 }, "unjudged": 1, "dropped_tells": 0, "findings": 11,
  "filed": 4, "seeded": 6, "fix_pr": 5903, "ledger_pr": 5902, "blocker": null, "browser": "…/chromium_headless_shell-1194/…",
  "git_depth": "full", "wall_clock_s": 1840, "rubric_version": 1, "model_id": "claude-opus-5" }

// docs/ui-quality/calibration.json — Matt's one-time labels; the run's only human touch
{ "labelled_at": "…", "labelled_by": "Matt", "pairs": [ { "ours": "captures/marketing/home@1280x720.png",
  "reference": "linear-home", "human_prefers": "reference" } ] }   // ≥ 10 pairs, ≥ 5 ours, ≥ 5 references
```

Invariants and owners: one row per route (Coverage ledger, enforced by `check`); a finding key never maps to two issues (Findings, enforced by `fileIssue()`); `tells_hash` matches the tells (Rubric test); an app score is never emitted without its pairs (Taste rater `record` refuses); `reachability` is never null after a fire for a due row, and only `audited` advances `last_audited_at` — a captured row the judge did not judge is `unjudged:<reason>`, stays due, and never counts toward coverage (Coverage ledger `record`; Coverage report); a judged `Finding` never carries a tell the rubric lacks, or a severity other than that tell's default (Mechanical detectors `judged`).

## Interfaces & contracts

Every CLI takes `--root` for tests, reads/writes only under `metrics/`, `docs/ui-quality/` and the gitignored `.ui-quality/` work dir, and exits 0 / 1 (finding or check failed) / 2 (bad input, refuses to guess) unless stated.

### `ledger.mjs generate | check | refresh | due | record`

- Input: the four router/registry files (generate/check), `git log` (generate for new rows, refresh), `metrics/ui-quality-ledger.jsonl`, `config.mjs` constants, `route-fixtures.json` (due), `.ui-quality/captures/*/manifest.jsonl` + `.ui-quality/judge-status.json` (record).
- Output: the rewritten ledger (generate/refresh/record); `check` prints added/removed/changed identity rows; `due` writes `.ui-quality/plan.json` `{ app → [{ route, path, viewports }] }` and marks auth-gated rows `unreachable:auth` in the same write; `record` sets every due row's `reachability` — `audited` (in a manifest with screenshots and `judged` in judge-status; the only value that advances `last_audited_at` + `rubric_version`), `unjudged:<reason>` (in a manifest with screenshots, not `judged`; dates untouched), `unreachable:build` (in no manifest, or a manifest row with `error` and no screenshots) — and appends the runs row, counting `unjudged` and `dropped_tells` from judge-status.
- Failure modes: an extractor that finds zero routes for an app exits 2 (a router refactor must break loudly, not empty the ledger); a parameterised route without a fixture is planned as `unreachable:build` with `detail: no-fixture`; `git log` unavailable → `last_changed_at` unchanged and `git_depth: unknown` recorded; `check` is the CI-facing exit and never rewrites; `record` with no judge-status file marks every captured row `unjudged:missing` and prints why — a fire that captured but never judged cannot read as audited.

### Capture spec (`UI_QUALITY_PLAN`, `UI_QUALITY_CHROMIUM` → `.ui-quality/captures/<app>/manifest.jsonl`)

- Input: the plan, a resolved browser path, the built dist served by `vite preview`.
- Output: per route `{ route, path, screenshots: [{ viewport, file, sha256 }], axe: { violations: [...] }, page_errors, console_errors, failed_requests, links, blank: { text_chars, painted_ratio }, ms }`; a route that fails to load still gets a row with `error`.
- Failure modes: `webServer` timeout (60 s) fails the whole app's run → its due rows record `unreachable:build` `detail: build`; browser launch failure fails before any route → `blocker: no-browser` for the fire; one route's navigation timeout (30 s) fails only that row. Retries: none — a capture is idempotent and the next fire is tomorrow.

### `detect.mjs mechanical | judged`

- Input: `.ui-quality/captures/*/manifest.jsonl`, the ledger route set and the rubric (both); `.ui-quality/judged/<app>.json` per app — the model's raw per-route output in the Judge schema below (`judged`).
- Output: `mechanical` → `.ui-quality/findings.mechanical.json` (`Finding[]`); `judged` → `.ui-quality/findings.judged.json` (`Finding[]`, same shape: severity is the tell's `default_severity`, evidence is the model's text plus the route's screenshot sha256s) and `.ui-quality/judge-status.json` `{ routes: { app → { route → "judged" | "unjudged:<reason>" } }, dropped: [{ app, route, tell, reason }] }`. Every manifest row with at least one screenshot appears under `routes`; a row with `error` and no screenshots is not judgeable and is left to `ledger.mjs record` as `unreachable:build`.
- Failure modes: exit 2 only when a manifest or the rubric — the validated inputs — is missing or unreadable. The model's file is never an exit: a judgeable route absent from it → `unjudged:missing`; an entry that fails the schema → `unjudged:malformed`; an entry carrying `unjudged` → that reason; a file that is unparseable, or whose `rubric_version` is not the rubric's → every judgeable route of that app `unjudged:malformed`; a tell id the rubric lacks or whose `detection` is not `judged`, and an entry for a route the manifest lacks → dropped, one log line, one `dropped[]` entry, the route still `judged` (`tells: []` after dropping is judged-clean — the drop count, not the route, is the signal). Mechanical findings on an unjudged route still file. A missing judge-status file downstream is `ledger.mjs record`'s to fail closed on, never this command's to invent.

### `rate.mjs pairs | record | calibrate`

- Input: manifests + rubric (pairs); the plan + a verdicts JSON in the schema above (record/calibrate); `calibration.json` (calibrate).
- Output: `pairs` → `.ui-quality/rating-plan.json`; `record` → one ratings row per app; `calibrate` → `{ agreement, inversions, disagreements[] }`, exit 0 on pass.
- Failure modes: a verdict missing for any planned pair, or a pair id not in the plan, exits 2 and appends nothing (a partial score is a wrong score); a tell id in a verdict's `tells` that the rubric lacks is dropped, logged once and counted in the row's `dropped_tells`, and the verdict stands (the unknown-tell rule under Judge — a partial tell list is still a verdict); `record` without a passing calibration record for this `model_id` appends the row with `calibration.status: failed|stale` and the routine suppresses agent-built findings.

### `findings.mjs plan | record | migrate | seeds`

- Input: `Finding[]` from `detect.mjs mechanical` and `detect.mjs judged` (`--findings`, repeatable — never from the model directly); `--issue-states` JSON `{ issueNumber → open|closed|missing }` covering every key already in the ledger; the rubric.
- Output: `plan` → `{ actions: [{ key, action: skip|create|reopen|comment, title, body, labels, carrier }], seeds: [...], fix_pr_candidate }`; `record` → the updated `metrics/ui-quality-findings.json`.
- Failure modes: a ledgered key whose state is absent from `--issue-states` is treated as `skip` and reported (never re-created on a partial fetch — the dedupe search-failure rule from `routine-liveness.mjs`); an unknown tell id exits 2 — its inputs are validated upstream, so one here is a pipeline bug, not a model quirk (the unknown-tell rule under Judge); `migrate` refuses when `--to` ≠ the rubric's current version.

### Judge (the routine's own model) — the one non-CLI contract

- Input: `docs/ui-quality/rubric.md`, one or two PNGs per call, and the schema to answer in — per app, `.ui-quality/judged/<app>.json` `{ app, rubric_version, model_id, routes: [{ route, tells: [{ tell, evidence, severity }] } | { route, unjudged: "tool-error" }] }`; per pair, the verdict schema.
- Output: those files, raw. Nothing the model writes is trusted until `detect.mjs judged` (routes) or `rate.mjs record` (pairs) has read it — validation is theirs, not the model's, and the model never writes a `Finding`.
- Failure modes: an image the model cannot read (tool error) is written as `unjudged: "tool-error"` for that route — never omitted, never `tells: []`, which means _judged clean_; a route it omits anyway becomes `unjudged:missing`. **Unknown-tell rule, one rule at every seam:** a tell id the rubric does not know, or whose `detection` is not `judged`, is never fatal where model output enters — `detect.mjs judged` and `rate.mjs record` drop it, log one line and count it (`dropped_tells` on the runs and ratings rows), and the route or pair still counts; it is fatal (`exit 2`, nothing written) at `findings.mjs plan`, whose only inputs are those two commands' validated output, so an unknown tell there is a pipeline bug (rubric edited mid-fire, a hand-made file), not a model quirk. The asymmetry is the point: a model's every token is suspect, so its seam validates and degrades; a script's seam refuses to guess. The model seam degrades past a bad _part_, never past a bad _unit_ — an unanswered route becomes `unjudged`, and `rate.mjs record` keeps its `exit 2` on a missing or unplanned pair (a partial or mis-keyed score is a wrong score; a partial tell list is still a verdict). This is the seam WebDevJudge measured at ~70 % pairwise — calibration is the gate on it, and the gate fails closed.

### GitHub via MCP (executed by the routine, planned by scripts)

- Input: the plan's actions; `mcp__github__get_issue` for states, `create_issue`, `update_issue` (reopen, labels), `add_issue_comment`, `create_pull_request`, `search_issues` for the P1 SLA list.
- Output: issue/PR numbers fed back to `record`.
- Failure modes: no `gh` in the sandbox (gotchas § Claude Code Remote) — the prompt forbids it; a create that returns without the `ui-quality` label stops filing for the fire; MCP results over the context cap land on disk and are read with `jq`; REST fallbacks in `@mbe/gh-client` 401/403 here, so nothing in `scripts/ui-quality/` calls GitHub itself.

### `coverage.mjs`, `p1-age.mjs`

- Input: the ledger + runs (coverage); an issues JSON or `gh` (p1-age); `--now` for tests.
- Output: human lines + `--json`; exit 1 = SLA/coverage breached, 0 otherwise; `coverage` exits 0 with `provisional: true` until 30 days after the first run row.
- Failure modes: empty runs file → coverage is provisional, never 100 %; an issue without `createdAt` counts as breached (fail closed).

### VR floor in CI (`apps-visual.yml`)

- Input: a PR touching the app or rialto source; secrets for hospitality's `setup` project; committed baselines.
- Output: job verdict (advisory — not in `ci-gate`'s `needs`, like rialto-web's), diff artifacts, one sticky PR comment per suite.
- Failure modes: missing baseline for a new route → the job fails naming the snapshot (the intended signal for a new route); Dependabot PRs skip the hospitality job (no secret scope, the `e2e-screenshots.yml` precedent); a fork PR declines publishing. The job is never merged red on this run's own PRs (brief § Not authorized).

## Stack & dependencies

- Node ESM under `scripts/ui-quality/` with vitest — the house pattern for factory logic; no new runtime dependency.
- TypeScript compiler API for the route extractors — in the workspace catalog (`^6.0.3`) but not resolvable from the repo root, so the extractor loads it with `createRequire` anchored at `apps/hospitality/package.json`, the way `scripts/visual-noise-floor.mjs` resolves `playwright-core`; a root devDependency was the alternative and would touch `pnpm-lock.yaml` (gotchas § CI: cold, fully parallel run). A large library behind three calls, chosen over regex because the PRD's inventory is a contract.
- `@playwright/test` + `@axe-core/playwright` — already devDependencies of all three apps; `@mbe/test-fixtures` gains them as dependencies for the shared capture helper (private package, imported only from e2e paths).
- `scripts/metrics-store.mjs`, `scripts/lib/issue-filing.mjs`, `scripts/regen-manifest.mjs`, `scripts/lib/fitness-check.mjs`, `scripts/visual-tolerance-rule.mjs`, `scripts/publish-visual-diffs.mjs` — reused as they are (the last two with one parameter each).
- GitHub MCP tools — the only GitHub transport in the sandbox; volatility sits behind the plan/record file seam, so a future `gh`-capable session runs the same scripts with a different executor.
- Committed PNG reference set — the one asset the sandbox cannot produce; volatility (sites redesign) is handled by re-capturing under a new `rubric_version`.

## Decisions & alternatives

- **`unreachable:auth` for the 19 hospitality routes** over a daily GitHub Actions capture leg — new recurring spend the brief did not authorize, and its artifacts cannot reach the sandbox except through a git ref; priced in § Open questions.
- **Ledger as a `regen-manifest` family** over a bespoke drift script — the existing hooks, Integrity job and `drift-fix.yml` already answer "is this generated file stale", and a second answer would drift from the first.
- **Identity columns generated, audit columns preserved** over regenerating the whole row — regenerating `last_changed_at` on every PR would put every UI PR on the llms-treadmill (gotchas § Build).
- **`metrics/` + metrics-store registration** over `docs/ui-quality/ledger.jsonl` — durability, path resolution and the `.gitignore` block are one property there; the cost is one `!merge` attribute line.
- **Plan-file seam between scripts and MCP** over `@mbe/gh-client` inside the scripts — the client's REST fallback answers 401/403 in a CCR session; the only working transport is the model's tools, so the scripts decide and the model executes.
- **`fileIssue()` with an injected state map** over a rewrite of skip/create/reopen — SC-6 names the seam and the semantics are already tested; the map is the `getIssueState` dep filled in ahead of time.
- **Per-app capture specs + shared helper in `@mbe/test-fixtures`** over one root runner — dependency-cruiser's `apps-not-imported` rule forbids the runner from importing hospitality's `api-mocks.ts`, and without those mocks the two public routes render error states that would file false P1s.
- **Pre-installed Chromium via `executablePath`, fail closed** over `playwright install` in the routine — the CDN is not egress-allowlisted (log.md 2026-09-08 entry); a fire without a browser records itself rather than pretending.
- **Pairwise verdicts with hashed A/B position** over absolute 1–5 scoring — WebDevJudge's measured gap (63.9 % single-answer vs 70.3 % pairwise) and position bias are the two known judge failure modes; both are addressed by construction.
- **Calibration re-run on `model_id` change** over daily re-calibration or never — the failure it guards against is model drift, which only happens when the model changes; daily would spend ~30 k tokens on a constant.
- **Human-only rubric bumps + tells-hash guard** over the routine editing its own bar — a self-moving bar is idea.md's fourth kill-risk in code form; `optimize-implement-queue` made the same call for skill prompts.
- **Fix PR through the issue→`has-pr` state machine** over a standalone PR — the merge train, reviewer gate and telemetry already treat `has-pr` PRs as units of work; a standalone PR would sit unmerged like the stray routine PRs Phase 0 keeps finding.
- **Non-visual fix scope** over "any small fix" — a CSS fix red-lines the new VR floor on its own PR and cascades ±1 px through sibling baselines (gotchas § CI); those findings are issues for a worker who will regenerate baselines from the CI artifact.
- **Rolling `ui-quality/ledger` branch** over a fresh branch per fire — two open ledger PRs conflict on the same rows; one PR that absorbs each day's commit does not.
- **`!merge` on the ledger** over JSON-object format — JSONL keeps one route per line so a diff reads as "these routes were audited"; the attribute is one line.
- **New `apps-visual.yml`** over adding jobs to `e2e.yml`/`e2e-screenshots.yml` — a visual-baseline diff and a functional regression stay distinguishable failures (the `rialto-web-e2e.yml` header's own argument), and both existing workflows are guarded against narrowed invocations.
- **`suite` in the comment marker** over one marker — a PR touching `packages/rialto/src/**` runs three visual suites; one marker means three publishers fighting over one comment.
- **`activatedAt` grace in `routine-liveness.mjs`** over shipping the manifest entry `unverifiable` — SC-5 forbids `unverifiable`, and without a grace window the 08:10 UTC checker files a false `dark` on the morning between merge and first fire.
- **P1 = mechanical evidence only** over the PRD's fuller list — "a primary control does nothing" needs a scripted interaction to prove; a judged P1 would put a 7-day SLA on a guess.
- **`detect.mjs judged` as the judged-output normaliser** over a separate `judge.mjs` or the routine emitting `Finding[]` itself — one `Finding[]` producer keeps the evidence shape, the rubric-tell check and the severity rule in one place, so `findings.mjs plan` has exactly one upstream and can refuse (`exit 2`) whatever it does not recognise; a second module would re-own the rubric check (a rule in two components), and a model writing `Finding[]` directly would let a hallucinated tell id reach the ledger unchecked.
- **`unjudged:<reason>` as a fourth `reachability` value** over a `judged` flag on the capture manifest row (Capture's output; a second writer, and `due`/`coverage` would still need it translated into a ledger value), a `judged` boolean column beside `reachability` (two readers learn a second column, and a captured-but-unjudged row with a recent `last_audited_at` would still read as covered), or renaming the column `outcome` (nothing is built, but it re-keys every row reference in the breakdown for a name) — one column with four values is what `due`, `coverage` and the invariant already read; the data-model comment now says the column records the row's outcome at its last fire.
- **SURFACE_REGISTRY kept, subset-guarded** over replaced or generated — `/site-audit`'s weekly prod Lighthouse over a curated sample is a different access pattern from daily per-route coverage; a guard makes the ledger the source of truth without changing what site-audit spends.
- **`.claude/rules/` file** over a new skill — rules load without being invoked, which is the point for a constraint an agent must meet before it knows it needs it.

## ADRs

None — no decision met the ADR bar. The candidate "the committed ledger is the single source of truth for UI-surface coverage, replacing `SURFACE_REGISTRY`" was judged: it is a real trade-off and mildly surprising, but not hard to reverse — the registry is kept, the guard test is one file, and a later run can generate the registry from the ledger by deleting the guard and adding a generator. The one-line record above is enough.

## Traceability

| PRD criterion             | Components                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 Coverage             | Route inventory, Coverage ledger (`generate`/`check`/`refresh`/`due`/`record` incl. the `unjudged:<reason>` outcome, regen family), Coverage report (unjudged rows stay in the denominator), runs record |
| SC-2 Correctness          | Findings (deterministic titles, labels, P1/P2), Labels, P1 SLA, Mechanical detectors (`mechanical`: the only P1 evidence; `judged`: rubric-bound tell ids, severity from the rubric)                     |
| SC-3 Taste                | Taste rater (`pairs`/`record`/`calibrate`), Rubric (references, pass mark), reference set, `calibration.json`, Capture (screenshots)                                                                     |
| SC-4 VR floor             | VR floor (specs, configs, `apps-visual.yml`, noise-floor `app` input, `suite` marker, workflow-coverage tests, Linux baselines)                                                                          |
| SC-5 No human in the loop | Routine (prompt, catalog row, manifest entry + `activatedAt` grace), Capture in the sandbox, `browser.mjs`, MCP contract, runs/log                                                                       |
| SC-6 Convergence          | Rubric (version, tells hash), Findings (`fileIssue()` seam, key, `migrate`, legacy links), Generation-side rule                                                                                          |
| SC-7 Gates                | Every module ships with `scripts/__tests__/ui-quality-*.test.mjs`; VR specs are `e2e-selector-drift-reviewer` territory; no rialto published source changes are designed in (no changeset)               |

## Open questions

- **A second capture leg in GitHub Actions for the auth-gated hospitality rows (stop-and-surface: new recurring spend).** Design if authorized: a daily `apps-visual`-style job with the E2E secrets runs the hospitality capture spec for all 19 auth-gated routes, commits `manifest.jsonl` + PNGs to an orphan ref `ui-quality/captures/<date>` (the only artifact channel the sandbox can read — git over HTTPS works, blob-storage artifact downloads do not), and the routine `git fetch`es that ref and folds it into its manifests so those rows become `audited` rather than `unreachable:auth`. Price: ~8–12 paid runner-minutes per day (install + rialto build + hospitality build + Chromium + 19 routes × 2 viewports), no new credential, one more scheduled workflow for `scheduled-workflow-health.mjs` to watch. Until Matt authorizes it or #3546 lands, the Operator's whole surface is honestly reported as unreachable, and only the VR floor (SC-4, per PR) covers it. The alternative that costs nothing is #3546 itself.
- Note, not blocking: the reference set commits screenshots of third-party pages into a public repository. Matt's one-time labelling pass is where he sees them; if he prefers, `references.json` can carry the URLs and the PNGs can live in a private artifact — the design only needs them readable from the sandbox checkout.

Next stage: **Decompose**.

### Resolutions recorded after the stage (orchestrator, 2026-09-29)

- **Auth-gated hospitality rows:** Matt declined the GitHub Actions capture leg
  (autorun-brief § Decisions added after Architect, item 12). `unreachable:auth`
  stands; no orphan-ref plumbing enters the breakdown.
- **Reference set provenance:** Matt restricted the committed reference set to
  permissively-licensed open-source UIs (brief item 13). The rubric's reference
  entries carry `app`, `license`, `source`, `captured_at`; the "third-party
  screenshots in a public repo" note above is thereby closed.
- **Judged-output normalisation and `unjudged` (Architect re-entry,
  2026-09-29):** breakdown § Design gaps found that no component owned turning
  the model's per-route JSON into `Finding[]`, that the Judge and
  `findings.mjs` contracts disagreed on unknown tells, and that an unjudged
  route read as `audited`. Resolved without a human (the brief is silent; the
  Decompose candidates were the interview): `detect.mjs judged` is the
  normaliser and the second of exactly two `Finding[]` producers; one
  unknown-tell rule — drop + log + count where model output enters
  (`detect.mjs judged`, `rate.mjs record`), `exit 2` where only validated
  input arrives (`findings.mjs plan`); `unjudged:<tool-error|malformed|missing>`
  is a fourth `reachability` value that `ledger.mjs record` writes from
  `.ui-quality/judge-status.json`, keeps the row due, and never counts toward
  coverage. Amended: § Components (Coverage ledger, Coverage report,
  Mechanical detectors, Taste rater, Findings, Routine steps (4)–(7)), § Data
  model (ledger row, ratings row, runs row, invariants), § Interfaces
  (`ledger.mjs`, new `detect.mjs mechanical | judged`, `rate.mjs`,
  `findings.mjs`, Judge), § Decisions & alternatives (two bullets), §
  Traceability (SC-1, SC-2), frontmatter `assumptions:` (one entry).
