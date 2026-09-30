---
stage: review
run: feature:ui-quality-loop
date: 2026-09-30
assumptions:
  - "Scope is `git diff origin/main...HEAD` at `e0af6907f`, base `35517bbae` (47 commits, 124 files). The uncommitted `docs/ui-quality/calibration.json` edit and the untracked `docs/ui-quality/calibration/` fold PNGs are Matt's pending labelling surface, and are out of scope."
  - "Matt's 2026-09-30 remark is recorded verbatim as a human taste observation. It is not a calibration label set, and no per-pair label was inferred from it. SC-3 stays PENDING."
  - "The RemoteTrigger sandbox is assumed to start each fire from a fresh clone of the default branch (`main`), as every other `docs/routines/*` routine does. Nothing in the prompt checks out `ui-quality/ledger` before step (7), so C1's scenario follows directly from that assumption."
  - "`docs/standards.json` does not exist in this repo, so no finding cites a standards slug."
  - "Specialists ran read-only against the worktree. The dependency reviewer did its install/build/test in a scratch `git archive` export. `rialto-prop-drift-detector` was not dispatched: `git diff --name-only origin/main...HEAD -- packages/rialto/src` is empty, and only `packages/rialto/CLAUDE.md` changed."
  - "Severity follows the skill: critical blocks Ship, major is fixed or explicitly deferred by Matt, minor may be deferred freely. I fixed nothing myself."
  - "Re-review 2026-09-30 scope is `1e6141481..748e1a36a` (the main merge `5468839da` plus the M1, M2, M3, M5, C1 and M4 fix commits). `origin/main` had not moved past the merge at re-review time, and `git merge-tree` against it was clean."
  - "Re-review: GitHub's GraphQL node limit for `gh pr list --json commits --limit 50` was measured locally (gh 2.72.0, answer: 505,050 requested nodes, over the 500,000 limit). The Actions runner's gh version was not measured. gh's current `trunk` source still queries `commits(first: 100)` with `authors(first:100)`, so the node count is assumed to be the same on the runner."
  - "Re-review: whether the RemoteTrigger sandbox clone is full, `--single-branch` or shallow is unknown. The two-fire simulation uses full clones only. N4 is conditional on that unknown."
---

# Review: A UI-quality loop that keeps every page at a professional bar

## Scope

- **Diff:** `origin/main...e0af6907f`, 124 files, +14 879 / −155.
- **Read in full:**
  - the routine prompt, `docs/routines/mbe-ui-quality.md`
  - `scripts/ui-quality/{findings,findings-plan,findings-ledger,config,labels}.mjs`
  - the calibration and stamp paths of `scripts/ui-quality/{rate,calibration}.mjs`
  - `scripts/lib/issue-filing.mjs`
  - `.github/workflows/apps-visual.yml`
  - the diffs of the shared files: `routine-liveness.mjs`, `routine-manifest.mjs`, `metrics-store.mjs`, `regen-manifest.mjs`, `check-env-sync.js`, `detect-instruction-rot.mjs`, `publish-visual-diffs.mjs`, `visual-diff-comment.mjs`, `visual-noise-floor.yml`, `rialto-web-e2e.yml`, `drift-fix.yml`, `.gitignore`, the base Playwright configs, and the three pointer lines to `.claude/rules/ui-quality.md`
- **Checked against:** `architecture.md` (including re-entries 1–4) and the implement-queue label semantics in `.claude/skills/implement-queue/SKILL.md`.
- **Specialists:** `e2e-selector-drift-reviewer`, `generated-artifact-determinism-reviewer` and `dependency-update-reviewer`. Their verdicts are under § Specialist verdicts.

## Human taste observation (Matt, 2026-09-30)

After viewing the 12-pair calibration sheet (our fold vs a named OSS
reference, per pair), Matt said:

> "In most cases, our ui doesn't look as good."

He gave no per-pair labels. This is a **human taste observation, not a
calibration label set**:

- It is not converted into `human_prefers` values.
- It does not move SC-3, which stays **PENDING** until `calibration.json` carries real per-pair labels.

**What it implies:** the PRD's taste target ("every app ≥ 4/5") is very likely
**unmet today**. That is the gap the loop exists to measure and surface, not a
defect in the loop. It also predicts that a correctly calibrated rater will
mostly prefer the reference. So a first-week score well below 4/5 should be
read as the instrument working, not as a regression.

## Findings

### Critical

#### C1: every fire reads loop state from `main`, but writes it only to an unmerged rolling PR. Until a human merges that PR daily, dedupe, the calibration gate and liveness all fail open

- **Where:**
  - `docs/routines/mbe-ui-quality.md:41` (step 1 reads the ledger)
  - `docs/routines/mbe-ui-quality.md:56-60` (step 5c reads the calibration store)
  - `docs/routines/mbe-ui-quality.md:65-66` (step 6b/c reads `metrics/ui-quality-findings.json`)
  - `docs/routines/mbe-ui-quality.md:75` (step 7c writes all three onto `ui-quality/ledger` and opens a PR it must "not merge")
  - `scripts/routine-liveness.mjs:381` (`observedAt: pr.mergedAt ?? pr.createdAt`)
- **Scenario:** Fire 1 files issues #A–#C and records them in `metrics/ui-quality-findings.json` on branch `ui-quality/ledger` (PR open, unmerged). Fire 2 clones `main`, where the findings ledger is still `{}`. It fetches states for no issues, and `findings.mjs plan` → `fileIssue()` returns `create` for the same keys. Fire 2 files **duplicate `ready` issues** with identical titles. This breaks the architecture invariant "a finding key never maps to two issues (enforced by `fileIssue()`)", and repeats every day the PR stays unmerged. `ready` puts every duplicate on implement-queue's work list (SKILL.md:48 selects `--label ready`).
- **Same root cause, three more failures:**
  1. **Calibration gate.** `metrics/ui-quality-calibrations.jsonl` on `main` has no record of fire 1's `calibrate`, so fire 2's `calibration-status` reads `stale` and **calibrates again**. A `failed` key gets re-judged every day until one run clears 80 %. This is the "rubber stamp" retry-until-pass the architecture (§ Decisions, "Calibration re-run…") and routine step (5c) forbid.
  2. **Coverage ledger.** `due` re-plans the same 40 routes every fire, because yesterday's `last_audited_at` never reached `main`. SC-1 coverage cannot advance past the first 40 routes.
  3. **Liveness.** The rolling PR keeps its first day's `createdAt` and title ("leave it open and refreshed"). The liveness checker dates it by `createdAt`, so a routine that fires every night reads `late` on day 2 and `dark` on day 3, and files a false dark-routine issue.
- **Step 7c is also fragile.** Checking out `origin/ui-quality/ledger` with the fire's own modified `metrics/ui-quality-findings.json` in the working tree is refused ("local changes would be overwritten"). The prompt only covers a _merge_ conflict, so the model is left to improvise (stash, reset) on day 2.
- **Why critical:** the brief promises no human in the loop. Here, the loop's one dedupe guarantee and its one anti-rubber-stamp guarantee each depend on an undocumented daily human merge. The first failure is duplicate `ready` issues on the second night after release.
- **Fix direction (Implement, then re-verify):** make the fire _read_ the state it _writes_. Either:
  - **(a) Read from the rolling branch.** Step (0) does `git fetch origin`, and if `origin/ui-quality/ledger` exists, checks it out and merges `origin/main` into it _before_ step (1), so steps (1)–(7) all read the rolling branch. Step 7c then commits in place. Or:
  - **(b) Auto-merge the ledger PR.** Label it `auto-merge`, following the `drift-fix.yml` precedent, and add each fire's own date to the title so liveness sees a fresh artifact.

  Option (a) keeps "never merge" intact and also removes the checkout-with-dirty-tree hazard. Either way, pin the choice in `ui-quality-routine-prompt.test.mjs`.

- **Decision:** **fix before Ship**. This blocks the authorized release.

### Major

#### M1: marketing and hospitality publishers in one `apps-visual` run push to the same diff-image ref, so the second is rejected

- **Where:**
  - `scripts/publish-visual-diffs.mjs:464-475`
  - `scripts/visual-diff-refs.mjs:63-64` (`visual-diffs/pr-<N>/run-<id>-attempt-<n>`, no suite)
  - `.github/workflows/apps-visual.yml:130,242`
- **Scenario:** a PR touches `packages/rialto/src/**` (a shared filter), and both suites fail. Both publish jobs run in the same workflow run, so they share `GITHUB_RUN_ID` and attempt. Both build a different orphan commit and `git push origin <sha>:refs/heads/visual-diffs/pr-N/run-X-attempt-1`. The second push is rejected as non-fast-forward, `execFileSync` throws, that job goes red, and its sticky comment is never posted.
- **Why it slipped through:** `VISUAL_SUITE` was threaded through the comment marker and the artifact name but not through the ref name. The test at `publish-visual-diffs.test.mjs:78` only pins that `runAttempt` is in the call.
- **Fix:** add the suite to `buildRefName`/`parseRefName`, and keep `visual-diff-ref-sweep.yml`'s parser in step.
- **Decision:** fix before the first baseline PR (Ship), or defer with Matt's say-so. The workflow is advisory, so it cannot red CI Gate, but this is the feature's PR-facing surface.

#### M2: marketing `/` baselines would record an empty "Projects" and "Elsewhere" as correct

- **Where:** `breakdown.md` § Notes, 2026-09-30 re-entry, "Observations for Review" (the capture harness behind `apps/marketing/e2e/visual.spec.ts`).
- **Scenario:** Ship commits the marketing baselines from `visual-actuals-replica-a` while those two sections render empty in the full-page capture. Every later PR that makes them render is flagged as a regression, and one that empties them further passes. This is the same class as Verify's items 1–3 ("a baseline of an error state records the error as correct"), which M5b fixed for the mocks but not for this.
- **Classification:** loop (harness) defect, most likely scroll- or intersection-triggered content that a `fullPage` screenshot never scrolls into. Unconfirmed: it could also be a product defect. Either way, the baseline must not freeze it.
- **Decision:** settle before Ship commits marketing baselines. Either make the sections render in the harness, or confirm it is a product defect, file it, and mask it. Otherwise defer with Matt's say-so.

#### M3: marketing baselines screenshot committed metrics JSON that automation rewrites about twice a day

- **Where:** `apps/marketing/e2e/visual.spec.ts:47,57,100`
- **Found by:** `e2e-selector-drift-reviewer`, which rated it critical.
- **Verified here:** `AcmmPage.tsx:95` fetches `/acmm-report.json`. The ai-health and metrics pages read `/sensor-report.json`, `/ai-health-trends.json` and `/metrics.json`. All four are tracked under `apps/marketing/public/`, and `sensor-report.json` has 49 commits on `origin/main` since 09-01. The unmocked-request guard `isAppApi` (`:47`) matches only `/api` and `/public`, so it cannot see these fetches.
- **Scenario:** a `chore(metrics)` PR rewrites `sensor-report.json`. It touches `apps/marketing/**`, so it triggers `apps-visual.yml`. The ai-health, metrics and acmm rows then differ by far more than `maxDiffPixels=300`. Marketing VR goes red on every metrics PR and every main push, with nothing wrong in the product.
- **Why major, not critical:** `apps-visual` is advisory and never moves CI Gate, and no marketing baseline is committed yet. It does, however, make the SC-4 floor useless from its first day.
- **Fix:** route those four files to frozen fixtures in the visual fixture, and widen the recorder to any same-origin `*.json` fetch.
- **Decision:** fix before Ship commits marketing baselines.

#### M4: hospitality and marketing `maxDiffPixels` were measured before the harness they gate

- **Where:** `apps/hospitality/playwright.visual.config.ts:45-48` (3583 px) and `apps/marketing/playwright.visual.config.ts:32-35` (300 px)
- **Found by:** `e2e-selector-drift-reviewer`.
- **Scenario:** both noise-floor runs (36684419917, 36684428015) ran at `b7de78505`. That was before `e0af6907f` switched hospitality from the dev server to build + preview, held the event stream open (removing the "Live" flicker), answered the health probes, pinned UTC and re-based the session. So the 3583 px budget likely absorbs noise that no longer exists, and a real regression under about 3.5k px (a status-chip colour, a missing icon) passes. The replica-a artifact from those runs also does not match what HEAD renders, so it cannot be the baseline source.
- **Fix:** re-dispatch `visual-noise-floor.yml` for both apps at the post-fix HEAD, re-pin both provenance lines, and take baselines from that run.
- **Decision:** a Ship precondition.

#### M5: hospitality visual rows can baseline a redirect or a date-filtered empty grid

- **Where:** `apps/hospitality/e2e/visual.spec.ts:243-246` (no landing assertion) and `:52,105-149` (clock vs. mock dates)
- **Found by:** `e2e-selector-drift-reviewer`, which raised these as two findings.
- **Scenario 1, redirect:** `admin` redirects a non-admin E2E user to `/`. Implement's own notes confirm this. So `admin@*.png` records the timeline, and the row flips red for no product reason once the E2E user gets the admin role (#3546).
- **Scenario 2, date mismatch:** `mockApi` re-dates reservations to the runner's real day, while the browser clock is fixed at 2026-06-15. TimelinePage filters on date, so the `/` and `timeline` rows baseline an empty grid. This contradicts HEAD's "populated, healthy state" claim, and a reservation-block rendering regression would never be caught.
- **Fix:** assert `toHaveURL` for the requested route before the screenshot. Either give `admin` an admin profile or drop the row. Override `**/api/v1/reservations?*` in `VISUAL_ROUTES` with reservations dated on `FIXED_NOW`'s day.
- **Decision:** fix before Ship commits hospitality baselines.

### Minor

- **m1: the fix-PR path is unreachable, and the legacy-issue path is dead code.**
  - **Fix-PR path:** `findings-plan.mjs:179-188` needs `evidence.file`, which no detector emits (Verify measured 0 of 16). This is safe, but the loop never fixes anything itself.
  - **Legacy path:** `findings-plan.mjs:242` reads `finding.legacy`, which no detector emits either (`git grep legacy scripts/ui-quality` hits only the plan and ledger modules). If a detector ever did emit it, step 6b fetches states only for numbers already in the findings ledger, so every legacy link would be `skip` + "has no state".
  - **Classification:** loop design gap, fail-safe direction.
  - **Decision:** deferred. Seed it at Operate ("teach one non-visual detector to name its source file").
- **m2: the fix-PR issue keeps `ready` alongside `has-pr`.** Routine step 6e (`mbe-ui-quality.md:68`) says "existing labels plus `has-pr`", but implement-queue selects on `ready` alone (SKILL.md:48). The label machine's edge removes `ready`.
  - **Scenario:** the routine opens a fix PR, and implement-queue then dispatches a worker on the same issue, producing a duplicate PR.
  - **Decision:** deferred, because it is latent behind m1. Fix the wording to "replace `ready` with `has-pr`" when m1 is addressed.
- **m3: the daily ledger PR triggers both VR suites.** `apps-visual.yml:31,45,73` includes `metrics/ui-quality-ledger.jsonl` in the path filters. The specs read only the ledger's identity columns, but every fire rewrites its audit columns. Each nightly ledger push therefore runs marketing plus a ~25-minute hospitality run that signs in to the real Auth0 tenant. That is paid Actions time, and a sticky-comment surface on a metrics PR.
  - **Decision:** deferred. Narrow it (for example, trigger on `regen`'s identity family, or drop the path) at Operate once cost is measured.
- **m4: `mbe-ui-quality` has no `activatedAt` in the manifest** (`routine-manifest.mjs:200-214`). Until Ship writes it, the liveness check classifies the routine `dark` from the first run after merge.
  - **Decision:** Ship precondition. Set `triggerId` and `activatedAt` in the same PR that merges, or before merging, never after.
- **m5: a closed issue is reopened on every fire that sees the finding again.** This is the shared `fileIssue()` rule (`issue-filing.mjs:59-61`), and `migrate` lists retired keys whose issues may already be closed. A human closing an issue as "won't fix" does not stick.
  - **Decision:** deferred. This is a shared-module design choice; revisit if Operate sees reopen churn.
- **m6: the P1 cap is per (app, tell), not per fire.** `P1_BURST_AGGREGATE_AT = 5` (`config.mjs:19`) allows up to 5 individual P1 issues per (app, tell) before aggregating. Across 3 apps × 4 mechanical P1 tells, the worst case is 60 issues in one fire. Verify's SC-6 dry run on real findings planned 3 creates and 13 seeds, so the realistic first fire is small.
  - **Decision:** deferred, but C1's fix must land first, or the first fire's count repeats nightly.
- **m7: hospitality captures and baselines are one viewport tall.** The app shell scrolls an inner `main`, so `fullPage` stops at the viewport. The VR floor and the per-route judge both miss everything below the fold on hospitality.
  - **Classification:** loop (harness) defect.
  - **Decision:** deferred to an Operate seed (scroll or resize the inner container before capture).
- **m8: judged accessibility tells still file under a `stale` calibration** (`findings-plan.mjs:211-213` drops only `face: agent-built`). This is per the architecture ("bugs/a11y still file"), but those three tells come from the same uncalibrated model.
  - **Bound:** they are P2, so at most 3 issues per fire.
  - **Decision:** accepted as designed, and noted for Operate's first-week read of their precision.
- **m9: legacy rialto-web diff comments are orphaned.** Comments posted before this change carry the old marker (no `suite=`), which `commentMarkerPrefix` never matches (`visual-diff-comment.mjs:85`). On a PR that was open across the deploy, the next rialto-web run posts a second comment instead of updating or retracting the stale one.
  - **Decision:** deferred. This is a one-time transition cost.

### Product defects the loop surfaced (not loop defects, not blockers)

These are routed as Operate backlog seeds. Each is also evidence of a tell the rubric lacks.

- **Marketing `/` overflows horizontally at 375 px.** `root@375x812.png` is 413 px wide. Seed the product fix, and a `bugs/horizontal-overflow` mechanical tell (rubric bump), since no current detector names it.
- **The marketing nav marks "Home" active on every page** (for example, at `/acmm`). Seed the product fix. This is a navigation-face tell candidate.
- **Hospitality mobile layout:** the floor-plan canvas and `setup/hours` overflow at 375 px. Seed the product fixes.
- **`admin` redirects to `/` for a non-admin session**, so that visual row snapshots the wrong page. This is a harness note, not a product defect. Seed "capture `admin` with an admin session or drop the row from the VR floor".

## Specialist verdicts

- **`e2e-selector-drift-reviewer`: FLAG (1 critical, 3 major, 3 minor).** The specs only navigate and screenshot, so there are no strict-mode collisions and no volatile-text locators.
  - **Checked and fine:**
    - Mock shapes match what the api-client parses.
    - The 599 recorder is the lowest-priority route handler.
    - The held-open event stream is really what `fetch-event-source` reads.
    - `storageState` paths resolve.
  - **Critical:** unfrozen committed metrics JSON. I verified it and folded it in as **M3**, downgraded to major because the workflow is advisory and no baselines are committed yet.
  - **Major:**
    - stale tolerance provenance, folded in as **M4**
    - no landing assertion (`admin` redirect), folded into **M5**
    - timeline date mismatch, folded into **M5**
  - **Minor, all deferred to Operate seeds:**
    - The unmocked-request guard is checked once, before `toHaveScreenshot`'s stability loop (`visual.spec.ts:244-245` in both apps). Re-check it after the screenshot, or in fixture teardown.
    - The profile row renders the real Auth0 avatar from an external CDN, so its pixels depend on the network. Pin a `data:` URI.
    - `workflow-coverage.test.ts` in both apps only `toContain`s the spec path anywhere in the workflow file, so a comment keeps it green. Pin the `run:` line with a regex, as the `e2e.yml` check does.
- **`dependency-update-reviewer`: PASS (0 critical, 0 major, 2 minor).**
  - `@axe-core/playwright ^4.13.0` and `@playwright/test ^1.63.0` resolve to versions already in the lockfile. There are no new `packages:` or `snapshots:` entries, and the specs match every other consumer.
  - Dependency placement is correct: axe is a runtime `import()`, so it belongs in `dependencies`.
  - Checked in a scratch `git archive` export: `pnpm install --frozen-lockfile` passes and leaves the lockfile byte-identical. test-fixtures typecheck, build and 29/29 tests pass, at 97 % line coverage.
  - **Minor:**
    - the lockfile change cold-busts turbo (known gotcha)
    - existing `brace-expansion` highs in `pnpm audit`, not caused by this branch
- **`generated-artifact-determinism-reviewer`: PASS (0 critical, 0 major, 3 minor).**
  - **What it ran:** in a scratch clone, `install → build CLI → pnpm regen → regen --check`.
    - At HEAD: clean. The new `ui-quality-ledger` family ran (154 rows), and `ledger.mjs check` passed.
    - On a simulated merge with `origin/main`: clean.
    - `ledger.mjs generate` under three locales and `TZ=Pacific/Kiritimati`: byte-identical output.
  - The pack generator is untouched. No new tracked llms file needs a manifest entry.
  - **Minor, all deferred:**
    - The ledger family's `changedBy` (`regen-manifest.mjs:208-213`) watches only `ROUTER_FILES`. It misses rialto-web page renames and edits to `routes.mjs`/`ledger.mjs` themselves, so drift surfaces late in CI rather than at the hook. It is still caught before main.
    - `drift-fix.yml` checks out shallow, so a new row's `last_changed_at` falls back to the HEAD date. That is only an accuracy loss, and the code documents it as intended.
    - `regen-manifest.mjs:36` now imports `ui-quality/routes.mjs` at load time, which is a new way for the pre-push gate to break. Keep `routes.mjs` free of load-time side effects, or move `ROUTER_FILES` to `config.mjs`.
- **`rialto-prop-drift-detector`:** not dispatched, because `packages/rialto/src/**` did not change.

### Merge conflict with `origin/main`

The branch does not merge cleanly with `origin/main`. `git merge-tree` shows conflicts in `scripts/routine-liveness.mjs` and `scripts/__tests__/routine-liveness.test.mjs`: the branch's `activatedAt` `pending` block against main's new `late` handling.

This is not a code defect, but GitHub cannot build a merge ref until it is resolved, so no `pull_request` CI (including CI Gate) runs. **Ship must merge `origin/main` and resolve both files, keeping both behaviours, before opening the PR.** The generated-artifact reviewer confirmed that neither file feeds any generated output.

## Passes with no findings

- **Fail-closed calibration, traced end to end.** The stamp comes from a real calibration record keyed on (`model_id`, `rubric_version`, `set_sha256`), and a missing record means `stale` (`calibration.mjs:197-212`). `unknown` always stamps `stale` (`rate.mjs:345-356`). `calibration-status` exits 3 on `stale` (`rate.mjs:359-373`).
  - On the unlabelled placeholder that ships, `pairs --calibration` exits 2. The prompt logs this, never retries it, and carries `stale` forward (`mbe-ui-quality.md:56-60`).
  - `rate.mjs record` stamps every ratings row `calibration.status: stale`, so no score is recorded as trusted.
  - `findings.mjs plan --calibration-status stale` drops every `face: agent-built` finding (`findings-plan.mjs:211-214`), and an absent flag defaults to `stale` (`findings.mjs:101-107`). Bugs and a11y still file.
  - This holds within one fire. C1 is about state _across_ fires.
- **The routine prompt.**
  - GitHub only over MCP. No `gh`, no live site.
  - At most one fix PR, never merge, never auto-merge.
  - Explicit staged paths, never `git add -A`. Nothing it may commit touches `docs/ui-quality/rubric.*` or `calibration.json`, so the sandbox model cannot edit the bar it is judged by.
  - It stops filing when a created issue lacks `ui-quality`.
  - No instruction reads as spend, purchase, or rubric edit. The literal `unknown` path is the only self-report escape, and it fails closed.
- **`routine-liveness.mjs` `activatedAt` grace.** It applies only when _no_ matching artifact exists, and an unparseable value grants no grace. The previous behaviour is unchanged without it (`routine-liveness.mjs:106-114`).
- **`metrics-store.mjs`, `.gitignore`, `.gitattributes`.** All five metrics are durable. The coverage ledger is correctly `-merge` rather than union, because a union merge of a rewritten file duplicates rows. `/.ui-quality/` is ignored.
- **`regen-manifest.mjs` and `drift-fix.yml`.** The ledger family's `changedBy` covers exactly the four router files, and `drift-fix.yml`'s `add-paths` gained the output.
- **The new `VISUAL_SUITE` requirement.** Every caller of `publish-visual-diffs.mjs` sets it: `rialto-web-e2e.yml:208`, `apps-visual.yml:184,294`. No other script imports the removed `COMMENT_MARKER_PREFIX` or `DIFF_ARTIFACT_NAME`. `preview-comment.mjs` only mentions `isStandingComment` in a comment.
- **Security of `apps-visual.yml` and `visual-noise-floor.yml`.**
  - They use `pull_request`, not `pull_request_target`, so fork PRs get no secrets.
  - Hospitality is skipped for Dependabot, and the publishers decline fork PRs.
  - `permissions: contents: read` at the top, and write only on the publish jobs.
  - Every `run:` whose exit code matters opens with `set -o pipefail`, and none pipes a gate.
  - In `visual-noise-floor.yml`, the Auth0 secrets reach hospitality legs only.
- **`check-env-sync.js`.** `UI_QUALITY_CHROMIUM` is tooling-only, so it correctly joins `BUILD_TIME_VARS` rather than `.env.example`.
- **The `.claude/rules/ui-quality.md` pointers.** `paths:` frontmatter scopes the rule to UI files. The pointer lines in `packages/rialto/CLAUDE.md` and `implement-queue-worker.md` are one line each, and `detect-instruction-rot.mjs` now watches the rule.

## Verdict

**Fix first.** One critical (C1) blocks the authorized release. The fire must read the same loop state it writes (findings ledger, calibration store, coverage ledger), or its ledger PR must merge without a human. Otherwise, the second night files duplicate `ready` issues, re-runs a failed calibration, and reports a healthy routine as dark.

- **C1:** route to Implement, re-verify with a two-fire simulation (fire 2 planned against fire 1's unmerged branch → `skip`, not `create`), then Ship.
- **M1–M5:** fix before Ship commits any baseline, or Matt defers them explicitly. M2–M5 share one precondition: no baseline may be taken until the harness renders frozen, landed, populated pages, and the tolerance is re-measured on that harness.
- **Before Ship opens the PR:** merge `origin/main` and resolve the `routine-liveness` conflict.
- **Minors:** deferred with the reasons above. The product defects become backlog seeds at Operate.

Everything within a single fire is sound: fail-closed calibration, prompt guardrails, the shared-file changes, and workflow security.

## Re-review 2026-09-30

- **Scope:** `1e6141481..748e1a36a`: the `origin/main` merge `5468839da`, M1 `9f1c254b0`, M3 `50e9960e9`, M2 `d2d0bb058`, M5 `4cf81feb7`, the C1 items `a7e901246..b7898bc18`, and M4 `748e1a36a`.
- **Read in full:**
  - `scripts/ui-quality/state.mjs`
  - routine steps (0), (6) and (7)
  - the `--labelled-issues` guard in `findings.mjs` and `findings-plan.mjs`
  - the `observe` path in `routine-liveness.mjs`
  - the M1 ref-name diff
  - both visual specs
  - `revealLazyContent`
  - the M4 provenance lines
- **Tests run, all green:**
  - `pnpm exec vitest run --config scripts/vitest.config.mjs` over the state, two-fire, findings, liveness, prompt, visual-diff-refs, publish, visual-specs, apps-visual-workflow, trigger-safety and stale-human-blocked suites: 11 files, 432 tests.
- **Live probes:**
  - the real `fetchObservedArtifactsViaGhClient` for the `mbe-ui-quality` entry, run against the GitHub API
  - the marketing noise-floor artifacts of run 36764144910 (`measurement`, `replica-a`, `replica-b`), diffed pixel by pixel

### Per-finding status

- **C1: CLOSED within a fire and across fires, when the clone fetches the branch.** Now fixed:
  - Step (0) `state.mjs checkout` makes `ui-quality/ledger` the state authority. Every conflict it can hit is resolved by fixed rule.
  - `.claude/improvement-loop/log.md` and `metrics/*.jsonl` are `merge=union` in `.gitattributes`, so they never reach the resolver.
  - The two-fire simulation proves fire 2 skips fire 1's key, keeps its `failed` calibration and does not re-plan fire 1's 40 routes.
  - The checkpoint (6f) closes the "filed but unrecorded" window, and the fix-PR branch switch now happens on a clean tree.
  - Liveness no longer counts a checkpoint commit as a fire. The signature is `chore\(ui-quality\): ledger \d{4}-…`, which `chore(ui-quality): checkpoint <date>` and the merge commit's `Merge remote-tracking branch…` headline both fail to match.
  - `checkout -B` cannot lose unpushed work, because the sandbox holds none at step (0).
  - Merge commits from `main` keep the PR mergeable, since the repo is squash-only and `delete_branch_on_merge: true`. A human merge therefore just restarts the branch from `main`.

  Adversarial passes turned up four new defects in the fix itself: N1 and N2 (liveness), N3 (a permanent refusal), and N4 (clone mode).

- **M1: CLOSED.**
  - `buildRefName` requires a suite, and `parseRefName` reads both forms. A legacy ref parses as rialto-web's.
  - Retention keeps the newest ref per (PR, suite).
  - Legacy `pr-N/run-…` refs and suite refs `pr-N/<suite>/run-…` cannot collide as git refs: `run-…` is barred as a suite name, and both forms sit under the directory `pr-N`.
- **M2: CLOSED.**
  - `revealLazyContent` runs before every capture and every marketing `toHaveScreenshot`.
  - Checked on the image itself: replica-a `home-1280x720.png` renders the Projects cards and the Elsewhere links.
  - The fix does cost noise. See N5.
- **M3: CLOSED.**
  - The four automation-rewritten `public/*.json` files are served from frozen copies.
  - Any other same-origin `.json` fetch now fails the row (`isAppData`, `apps/marketing/e2e/visual.spec.ts`).
- **M4: CLOSED as specified: both tolerances were re-measured on the post-fix harness.**
  - Hospitality went from 3583 to 90 (N = 0 over 38 snapshots, S = 8177, verdict `ok`). That is sane, and confirms the review's prediction that the 3583 budget was absorbing noise that no longer exists.
  - The marketing result (300 to 23679) is a new problem. It is recorded as N5.
  - Ship's standing caveat still applies: both runs rendered on image `20260920.314.1` while `ubuntu-latest` is rolling to `20260927.320.1`, so Ship re-measures if the image changed.
- **M5: CLOSED.**
  - Every hospitality row asserts `toHaveURL(requested)` before the shot.
  - `admin` is captured with the `admin` permission on the stored profile.
  - `**/api/v1/reservations?*` is re-served on `FIXED_NOW`'s day.
- **Merge with `main`: CLOSED, and #5817 is preserved.** The branch's diff against `origin/main` in `routine-liveness.mjs` is additive only. `extractRoutineFindingStatusFromTitle`, `findPriorRoutineFindingCandidate`, `decideIssueTransition` (never reopen, recovery-only close) and the injected `closeIssue`/`getIssueState` are all intact, and the #5817 tests run in the green suite. Against current `origin/main`: 0 commits behind, and `merge-tree` is clean.
- **Minors m1, m2 and m5 to m9:** unchanged, and still deferred as recorded.
  - m3 is resolved by `bdc4326e2`: the path filter now keys on identity sources, not the ledger file.
  - m4 is still a Ship precondition.

### New findings

#### Critical

##### N1: the liveness query for `observe: "latest-matching-commit"` exceeds GitHub's GraphQL node limit, so the daily Routine Liveness job crashes for every routine

- **Where:**
  - `scripts/routine-liveness.mjs:530-532` (`--json title,createdAt,mergedAt,commits --limit 50`)
  - `scripts/routine-liveness.mjs:346`, where the throw is not caught
- **Measured, not inferred.** The real `fetchObservedArtifactsViaGhClient(createGhClient(), <mbe-ui-quality entry>)` throws:

  ```
  Command failed: gh pr list --search ui-quality --state all --json title,createdAt,mergedAt,commits --limit 50
  GraphQL: This query requests up to 505,050 possible nodes which exceeds the maximum limit of 500,000.
  ```

  gh's `commits` field is `commits(first: 100) { … authors(first:100) }`, so 50 × (1 + 100 × (1 + 100)) = 505,050. gh's current `trunk` source (`api/query_builder.go`) still has both `first: 100` values.

- **Scenario:** the throw fails before any data is read, so it does not depend on any PR existing. It fires on the first 08:10Z run after merge, because `mbe-ui-quality` is in scope with a signature even while `triggerId` is null.
  - `runRoutineLivenessCheck` calls `fetchObservedArtifacts` inside `inScope.map` with no try/catch. The throw aborts the whole run before any routine is classified.
  - The observation-blackout guard never runs.
  - The job goes red every day, and **no routine's** dark/recovery issue is filed or closed. This includes #5817's new recovery close.
- **Why it slipped through:** every test injects a fake `pr.list`. Only a real query can see the node limit.
- **Why critical:** merging this blinds an existing, shared production monitor for the whole routine fleet. It is not just a gap in the new feature.
- **Fix direction:**
  - Keep the list query as `title,createdAt,mergedAt`.
  - Fetch commits only for the PRs whose title matches the signature, one PR at a time. Use `gh pr view <n> --json commits` (10,101 nodes), or better, the REST `GET /repos/{o}/{r}/pulls/{n}/commits` or `GET /repos/{o}/{r}/commits?sha=ui-quality/ledger`, filtering the newest matching headline. REST also avoids N2.
  - Wrap each entry's `fetchObservedArtifacts` in try/catch, so one bad signature degrades that routine to `unobserved` instead of killing the run.
  - Pin it with a test on the real argument list: no `commits` field in a `--limit`ed list call.

#### Major

##### N2: `latestMatchingCommitAt` reads only the PR's first 100 commits, so a long-open ledger PR reads `dark` after about five weeks

- **Where:** `scripts/routine-liveness.mjs` `latestMatchingCommitAt`, fed by gh's `commits(first: 100)`.
- **Scenario:** each fire adds 2–3 commits to the never-merged ledger PR: the `origin/main` merge, the checkpoint, and the ledger commit. Around fire 35–50, the newest `chore(ui-quality): ledger` commit falls outside the first 100.
  - The PR is then dated by the last _visible_ matching commit, which only gets older.
  - The routine turns `late` and then `dark`, and a false `ci-fix` + `ready` issue is filed. The loop explicitly never waits for the PR to merge.
- **Fix:** the same fix as N1. Date the PR by the head branch's newest matching commit through REST (newest first), or by the newest page of the PR's commits, never the first page. Pin it with a >100-commit fixture.

##### N3: one `ui-quality`-labelled issue the findings ledger does not know wedges filing permanently, and the only signal is on an unmerged branch

- **Where:**
  - `scripts/ui-quality/findings-plan.mjs:70` (`unknownLabelledIssues`)
  - `scripts/ui-quality/findings.mjs:117`
  - routine step (6f)
- **Scenario:**
  1. Fire N files #A (6d) and records it locally (6e).
  2. Its checkpoint push is rejected (6f). A transient network error or a pre-push hook failure is enough, since `.husky/pre-push` runs the antipattern ratchet, the regen gate and `regen --check` on these pushes.
  3. Step (7c)'s push fails the same way, and the sandbox is discarded.
  4. From fire N+1 on, #A is labelled `ui-quality` but absent from the ledger, so `plan` exits 2 **on every fire forever**.

  A human adding the `ui-quality` label to any issue by hand has the same effect.

- **Why major:** the guard fails in the safe direction, so there are no duplicates. But nothing resolves the refusal:
  - There is no documented recovery. Closing #A does not help, because the search covers all states. Only removing the label, or hand-editing `metrics/ui-quality-findings.json` on the branch, does.
  - The evidence (the unknown numbers) is written only to `.claude/improvement-loop/log.md` on `ui-quality/ledger`, which nobody reads until the PR merges.
  - Liveness stays `alive`, because (7c) still commits. The loop silently stops filing.
- **Fix direction:** either
  - **(a) Surface it.** On a plan exit 2 that names unknown labelled issues, the fire comments on (or opens) one de-duplicated `ui-quality` escalation issue naming the numbers and the recovery step. Or:
  - **(b) Self-heal.** Adopt an unknown labelled issue into the ledger when its title/body carries a finding key the plan can recompute (the routine's own issue bodies do). This turns a lost checkpoint into a one-fire gap, not a permanent one.

  Either way, document the recovery in `.claude/rules/ui-quality.md`.

##### N4: in a `--single-branch` or shallow sandbox clone, `state.mjs` silently falls back to `main` while the branch exists (conditional on the clone mode)

- **Where:** `scripts/ui-quality/state.mjs:142-143`: a bare `git fetch origin`, then `rev-parse refs/remotes/origin/ui-quality/ledger`.
- **Scenario:** a single-branch clone, including any `--depth` clone, has the fetch refspec `+refs/heads/main:refs/remotes/origin/main`. `git fetch origin` then never creates the ledger's remote-tracking ref, so `hasBranch` is false and the fire reports `source: "main"`. This is C1's original failure, minus dedupe:
  - The labelled-issue guard refuses filing.
  - The calibration store on `main` lacks fire N−1's `failed` record, so the gate re-calibrates. That is the retry-until-pass C1 forbade.
  - Coverage re-plans the same routes.
  - The (7c) push of a branch recreated from `main` is rejected as non-fast-forward, so liveness goes `late`/`dark`.

  In a shallow full-refspec clone, the `origin/main` merge can fail for lack of a merge base. That fails closed (exit 2).

- **Unknown:** the two-fire test only uses full clones, and the sandbox's clone mode was never measured.
- **Fix:**
  - Fetch the ref explicitly: `git fetch origin +refs/heads/ui-quality/ledger:refs/remotes/origin/ui-quality/ledger`, treating "couldn't find remote ref" as absent and any other error as `state-unavailable`.
  - Run `git fetch --unshallow` (or `--deepen`) when `rev-parse --is-shallow-repository` is true.
  - Add a single-branch-clone arm to the two-fire test.
  - At minimum, Ship's first-week check must confirm `source: "branch"` on fire 2.

##### N5: marketing's re-measured `maxDiffPixels: 23679` makes the marketing VR floor blind to small regressions, and the noise behind it looks fixable

- **Where:**
  - `apps/marketing/playwright.visual.config.ts:35`
  - `packages/test-fixtures/src/ui-quality-capture.ts:116-133` (`REVEAL_SCRIPT` / `SETTLED_SCRIPT`)
- **What changed:** the pre-fix measurement had 0 px of run-to-run noise on every marketing snapshot. The post-fix run 36764144910 has noise on exactly three snapshots:
  - `home-375x812`: 6226 px
  - `status-1280x720`: 1724 px
  - `status-375x812`: 1687 px

  The budget is one global number, so 23679 px now applies to all 12 snapshots, including the nine that measured 0.

- **Consequence:** any marketing regression under about 23.7k px passes. That covers a status-chip colour, a dropped nav item, a missing icon or a changed CTA label. Only layout shifts and whole-section losses still fail. SC-4's floor is meaningful for marketing only at section scale.
- **What the noise looks like** (replica-a vs replica-b, byte diff):
  - It is not in the revealed sections. Deltas are small (mostly 4–15 per channel, max 63–71) and spread over every text row of the page, starting at the nav (y = 24) down to the footer.
  - `status` has no scroll-revealed content, and it went from 0 to about 1.7k px. The only harness change on that route is `revealLazyContent`'s scroll to the bottom and back.
  - So the scroll itself likely leaves a run-dependent render state:
    - a JS-driven (framer-motion) opacity or colour that Playwright's `animations: "disabled"` does not finish and `SETTLED_SCRIPT` does not see, since it checks only inline `opacity` below 1
    - or re-rasterised text after the scroll
    - on `home`, possibly also the "By the numbers" count-up, which starts on `revealed`
- **Recommendation: fix the harness, not the budget.**
  1. Call `revealLazyContent` only on routes that have scroll-revealed content, or never on `status`.
  2. After the return to the top, wait for `document.getAnimations().length === 0` and `document.fonts.ready`, plus two frames.
  3. Settle the count-up, for example by emulating the fallback timeout with the clock.
  4. Re-dispatch `visual-noise-floor.yml` for marketing, aiming to bring the budget back toward the pre-fix hundreds.

  If some noise is irreducible, the alternative is a per-snapshot budget: a `maxDiffPixels` override on only the `home`@375 and `status` calls, each with its own provenance line so the guard test keeps pinning it.

- **Why major, not critical:** `apps-visual` is advisory and never gates CI Gate. Shipping with 23679 still catches section-scale regressions, and M2's empty-section baseline would have been worse. If Matt accepts it, record the deferral explicitly.

#### Minor

- **n1: a squash-merge of the ledger PR during a fire re-creates the deleted branch.** Because of `delete_branch_on_merge: true`, the fire's (7c) push re-creates the branch, carrying commits `main` already has in squashed form. The next `state.mjs checkout` then merges `main` against those. Every conflicted path is rule-resolved (branch side, or union for `docs/backlog.md`), so this should converge, but it is untested. Add a "merged-then-recreated" arm to the two-fire test, or accept it.
- **n2: `core.hooksPath=/dev/null` in `state.mjs` is legitimately scoped. No change needed** (details under Recommendations).

### Recommendations

- **`core.hooksPath=/dev/null`: keep as is.** It applies only to `state.mjs`'s own git calls: fetch, rev-parse, `checkout -B`, merge, `checkout --ours`, add, and the merge-concluding commit.
  - **Those calls never push,** and the only commit they create is the merge of `origin/main` (already gated on `main`) with rule-resolved state files.
  - **Every commit and push the routine itself makes still runs the hooks:** `git commit` at (6f) and (7c), and `git push` of the ledger and fix branches. That means lint-staged, check-adr, gitleaks and semgrep on commit, and the ratchet, regen gate and `regen --check` on push. CI Gate still runs on the ledger PR and on any fix PR.
  - **Running the hooks inside `state.mjs` would be actively wrong:**
    - `post-checkout` and `post-commit` run `pack-changed` and dirty llms files on a tree `state.mjs` must leave clean.
    - `pre-commit`'s lint-staged on a merge commit would lint and `--fix` all of main's incoming files, making the ledger branch differ from `main` outside its state files.
  - **Optional hardening:** a test asserting that `createGit`'s hooks-off flag never accompanies a `push` argument vector, so a future edit cannot quietly extend the bypass to a push.
- **Marketing tolerance:** see N5. Root-cause and remove the scroll-induced noise, then re-measure. Fall back to per-snapshot budgets only if some noise is irreducible. Hospitality's 90 px is sound.

### Updated verdict

**Fix first.** C1, M1, M2, M3, M4 and M5 are closed, and the merge with `main` preserved #5817. But the C1 fix introduced a new critical:

- **N1:** the new liveness query crashes the fleet-wide Routine Liveness job on its first run after merge. It is measured against the real API, not predicted. This blocks Ship.
- **N2 (major):** fixed by the same change as N1. Pin it with a >100-commit fixture.
- **N3 and N4 (major):** fix before Ship, or Matt defers them explicitly. For N4, the minimum is a first-week Operate check that fire 2 reports `source: "branch"`.
- **N5 (major):** fix before Ship commits marketing baselines, or Matt explicitly accepts the 23679 px floor.

Route N1 and N2 (plus N3 and N4 if not deferred) to Implement. Re-verify N1 with a real `gh`/REST call against the repo, not a fake `pr.list`. Then Ship.
