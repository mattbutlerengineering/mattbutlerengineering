# CI conditional-step audit (2026-10-10)

Issue: #6180 ("Audit for when we can conditionally run ci steps"). Deliverable is this document only. **No workflow was changed.** Each recommendation in section 6 is a candidate follow-up issue and has not been filed.

## 1. Method and data

- Workflow text read from `main` at `7919cb06a`: `.github/workflows/ci.yml` (1161 lines) plus every other workflow that has a `pull_request` trigger.
- Job timings: `gh run view <id> --json jobs` on the **25 successful `ci.yml` `pull_request` runs** on 2026-10-10 (18:14Z to 23:20Z). `startedAt` to `completedAt` per job. Changed files for each run came from `gh pr view --json files` on the PR that owns the head SHA (24 of 25 runs resolved; 4 of those are docs-only PRs).
- For the other PR-triggered workflows, 4 to 8 successful recent PR runs each.
- Billed minutes: GitHub rounds each hosted-runner job up to a whole minute, so "billed" below is `ceil(duration)` per job with a 1-minute floor. That is an assumption about the billing plan, not something read from an invoice. Raw durations are given alongside so the reader can re-derive.
- Average over the sample: **29.1 billed runner-minutes per `ci.yml` run**, median wall clock **10.0 min**.
- Caveats: one day, one author profile (mostly agent worktree PRs, small diffs). Skip-rates below are measured on this sample and will move with the PR mix. The 25 `action_required` and 5 `cancelled` runs in the 60-run window were excluded because they have no comparable job data.

## 2. Inventory: what each job gates on today

### 2.1 `ci.yml`

The workflow has no `paths:` filter on `pull_request` (and must not, see section 4.1). The push trigger ignores only `*.png`, `.gitignore`, `LICENSE`. All gating is job-level.

`detect-changes` emits one output, `has_code`. On any non-`pull_request` event (push, `merge_group`, `workflow_dispatch`) it is forced to `true`. On a PR it is `true` when `git diff --name-only origin/$BASE...HEAD -- . ':!*.md' ':!docs/' ':!*.png' ':!.gitignore' ':!LICENSE'` is non-empty.

| Job                                           | Gate today                                                                           | Median / billed min (sample) | Notes                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Detect Changes                                | none                                                                                 | 0.1 / 1                      | Root of the chain; CI Gate requires it to be `success`.                                                                                   |
| Prepare                                       | `has_code == 'true'`                                                                 | 0.5 / 1                      | Prisma client generate; root of the heavy chain.                                                                                          |
| Dependency Sync                               | needs `prepare`                                                                      | 2.5 / 3                      | Runs `depcheck` on every workspace package; the step takes 77 to 148 s.                                                                   |
| Docs Formatting                               | `has_code != 'true'`                                                                 | 1.0 / 1                      | Only runs for docs-only PRs. Compensates for Build being skipped.                                                                         |
| Dockerfile Lint (hadolint)                    | `has_code == 'true'`                                                                 | 0.2 / 1                      | Lints 4 Dockerfiles. Runs on every code PR regardless of Dockerfile changes.                                                              |
| Container Security Scan (trivy, 4-way matrix) | **none** (no `needs`, no `if`)                                                       | 0.3 to 0.4 each / 1 each     | Runs on every PR including docs-only. Scans one `Dockerfile` path per leg (`scan-type: fs`).                                              |
| Lint                                          | needs `prepare`                                                                      | 1.7 / 2                      | turbo-cached.                                                                                                                             |
| Typecheck                                     | needs `prepare`                                                                      | 1.4 / 2                      | turbo-cached.                                                                                                                             |
| Architecture Audit                            | needs `prepare`                                                                      | 0.8 / 1                      | `check-adr` + `check-deps`.                                                                                                               |
| Integrity                                     | needs `prepare`                                                                      | 0.4 / 1                      | `detect-instruction-rot` + `check-doc-freshness`.                                                                                         |
| Build                                         | needs `typecheck`                                                                    | 2.0 / 2                      | Includes `repo-audit`, `pnpm audit`, `pnpm regen`, size budgets. `regen` step is ~47 s.                                                   |
| Accessibility AI Attribution                  | `pull_request` and head ref starts `agent-` or `worktree-agent-`; needs `prepare`    | 0.5 / 1                      | Already conditional; skipped on 12 of 25 sample runs.                                                                                     |
| Test (Node 22)                                | needs `typecheck`                                                                    | 6.1 / 7                      | `turbo test:coverage --concurrency=2` step is 73 to 294 s. Largest single job.                                                            |
| Validate Migrations                           | needs `typecheck`                                                                    | 1.0 / 1                      | Postgres service container; runs on every code PR whether or not a Prisma file changed.                                                   |
| RLS Integration                               | needs `typecheck`                                                                    | 1.5 / 2                      | Postgres service container; suite lives in `services/reservations`.                                                                       |
| AI Antipattern Ratchet                        | needs `prepare`                                                                      | 0.5 / 1                      | `scripts/check-ai-antipatterns.mjs`.                                                                                                      |
| Visual Tolerance Change Check                 | `pull_request` and `has_code == 'true'`                                              | 0.2 / 1                      | Already conditional in its own script (passes trivially).                                                                                 |
| Migration Dry-Run                             | `pull_request` and `has_code == 'true'`; **step-level** `has_migrations` gate inside | 0.2 / 1                      | The runner is always started and checks out with full history; only the Postgres steps are skipped.                                       |
| Report CI Health                              | `always()` and `main` and `has_code == 'true'`                                       | n/a on PRs                   | Skipped on every PR.                                                                                                                      |
| CI Gate                                       | `always()`; needs all 18 jobs above                                                  | 0.1 / 1                      | Fail-closed: only `success` or `skipped` pass; `detect-changes` must be `success`; `prepare` must be `success` when `has_code == 'true'`. |

### 2.2 Other PR-triggered workflows (none are required checks; `CI Gate` is the only required check)

| Workflow                                                                                            | Gate today                                                                                                                | Typical duration (sample)                        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `adr-check.yml`                                                                                     | none (every PR and push)                                                                                                  | 0.7 to 0.9 min; installs deps and builds the CLI |
| `secret-scan.yml`                                                                                   | none; `fetch-depth: 0`                                                                                                    | 0.1 to 0.2 min                                   |
| `ai-attribution.yml`, `tier-classifier.yml`, `auto-review.yml`, `auto-merge.yml`, `merge-queue.yml` | none, but each is 0.1 to 0.2 min                                                                                          | negligible                                       |
| `e2e.yml`                                                                                           | `paths:` (hospitality, marketing, rialto, reservations, users, database, workflow) plus `dorny/paths-filter` per-app jobs | no successful PR runs in the recent window       |
| `e2e-screenshots.yml`                                                                               | `paths: apps/hospitality/**`                                                                                              | 5.0 to 6.6 min                                   |
| `apps-visual.yml`                                                                                   | `paths:` plus a `changes` job and per-app `if:`                                                                           | 1.3 to 2.2 min per app                           |
| `rialto-web-e2e.yml`                                                                                | `paths: apps/rialto-web/**, packages/rialto/src/**, infrastructure/worker/**`                                             | visual 2.4 to 2.6 + functional 2.9 to 3.6        |
| `rialto-visual.yml`                                                                                 | `paths: packages/rialto/src/**` and friends                                                                               | 2.5 to 2.6 min                                   |
| `storybook.yml`                                                                                     | `paths: packages/rialto/**`; deploy job skipped on PRs                                                                    | not in sample                                    |
| `preview-deploy.yml`                                                                                | `paths: apps/**, packages/rialto/**, packages/rialto-catalog/**` plus a `detect-changes` job                              | 0.1 to 1.2 min                                   |
| `instruction-regression.yml`                                                                        | `paths: CLAUDE.md, AGENTS.md, GEMINI.md`                                                                                  | not in sample                                    |

The second table is already well-gated. Only `adr-check.yml` runs unconditionally with real cost, and it duplicates a `ci.yml` job (section 3, R3).

## 3. Opportunities, ranked by billed runner-minutes saved per `ci.yml` run

"Saved" is measured on the 24 resolved sample runs (sum of billed minutes of the jobs that would have been skipped, divided by 24). "Predicate" is the proposed `if:` condition. Every predicate must also be true whenever `ci.yml`, `.github/actions/**`, `pnpm-lock.yaml`, or the script the job runs changed, so a change to the check itself always exercises the check.

| Rank | ID  | Opportunity                                                                       | Saved per run (billed min)    | Skippable in sample |
| ---- | --- | --------------------------------------------------------------------------------- | ----------------------------- | ------------------- |
| 1    | R1  | Container Security Scan: gate on Dockerfile change, and collapse the 4-leg matrix | 4.0 (3.0 from collapse alone) | 24 of 24            |
| 2    | R2  | Test: run only affected packages on PRs                                           | est. 2 to 3 (not measured)    | not measured        |
| 3    | R3  | Validate Migrations + RLS Integration: gate on their real inputs                  | 2.5 (1.17 + 1.33)             | 23 of 24 / 20 of 24 |
| 4    | R4  | `adr-check.yml`: stop duplicating the Architecture Audit job on code PRs          | ~1.0                          | 24 of 24            |
| 5    | R5  | Dockerfile Lint: same predicate as R1                                             | 0.83                          | 24 of 24            |
| 6    | R6  | Dependency Sync: skip when nothing in a workspace or manifest changed             | 0.75                          | 9 of 24             |

Sum of the measured items (R1, R3, R4, R5): about **8.3 billed min of the 29.1 average (~29%)**. R6 adds 0.75; R2 is an estimate.

### R1. Container Security Scan (trivy)

- **What it checks.** `aquasecurity/trivy-action` with `scan-type: fs`, `scan-ref: <one Dockerfile>`, scanners `vuln,secret,misconfig`, severity CRITICAL,HIGH. The scan target is a single Dockerfile, not a built image or a lockfile tree. Inference (not independently verified by running trivy): with no lockfile in scope the `vuln` scanner has nothing to match, so the gate is effectively a Dockerfile misconfig and secret scan. A new CVE published tomorrow does not change the result for an unchanged Dockerfile.
- **What can affect it.** `services/users/Dockerfile`, `services/reservations/Dockerfile`, `services/agent/Dockerfile`, `infrastructure/migrate/Dockerfile`, `.dockerignore`, any trivy config (none exists at the repo root today), and the pinned action version (which lives in `ci.yml`).
- **Today.** No `needs`, no `if:`. It runs on docs-only PRs too (25 of 25 sample runs). Each leg runs 0.3 to 0.4 min but bills a full minute, so the matrix costs 4 billed min to do about 1.4 min of work.
- **Evidence.** 96 billed min over the 24-run sample, every run unnecessary under the predicate above.
- **Safe condition.** `detect-changes` emits `docker: 'true'` when the PR diff touches `**/Dockerfile`, `.dockerignore`, `.hadolint.yaml`, or `.github/workflows/ci.yml`; forced `true` on non-PR events. Trivy and hadolint gate on `docker == 'true'`. Independently, collapse the matrix into one job that loops over the four paths (3 billed min saved even when it does run).

### R2. Test (Node 22) on affected packages only

- **What it checks.** `pnpm turbo test:coverage --concurrency=2` over the whole workspace, then a repo-wide statement-coverage threshold (60%), an agent-core threshold (80%), and a Codecov upload.
- **Today.** Median 6.1 min (7 billed), 128 min total over 21 code runs, 73 to 294 s in the test step alone. This is the biggest job, so even a modest hit rate matters.
- **Safe condition.** `turbo ... --filter='...[origin/main...HEAD]'` on `pull_request` only (changed packages plus dependents); full run on push to `main`, `merge_group`, and whenever the lockfile or root config changes.
- **Why this one is not "just add a filter".** The repo-wide coverage threshold is computed by globbing every `*/coverage/coverage-final.json`. With a filtered run the denominator and numerator both shrink, so the percentage becomes a different number, not a cheaper version of the same one. The check must either run only on the full (main) run or be recomputed from main's baseline. Codecov patch coverage is unaffected (it is diff-based) but `coverage-final.json` paths listed in the upload step must tolerate missing files. The saving figure of 2 to 3 min is an estimate (median package-scoped PR touches one package, and the test step is 73 to 294 s); it has not been measured and the first deliverable of the follow-up should be a measurement.

### R3. Validate Migrations and RLS Integration

- **Migrations (1.0 min, Postgres service container).** Runs `check-destructive-migrations.js`, `db:migrate:deploy`, `db:migrate:status` for every Prisma service. Inputs: `services/*/prisma/**`, `scripts/discover-prisma-services.mjs`, `scripts/check-destructive-migrations.js`, the Prisma version in `pnpm-lock.yaml`, `ci.yml`. Skippable on 23 of 24 sample runs. `migration-dry-run` already gates its Postgres steps this way at step level (but still starts a runner and a full-history checkout).
- **RLS Integration (1.5 min).** Runs `vitest` RLS suites in `services/reservations` against a Postgres owner role. Inputs: anything in the `@mbe/reservations-service` dependency closure. The hand-written glob used for the sample (`services/reservations|users`, `packages/auth|database|observability|service-bootstrap`, lockfile, assert script, `ci.yml`) was skippable on 20 of 24 runs, but **the follow-up must derive the closure from `pnpm ls --filter "@mbe/reservations-service..." --depth -1 --json`** rather than hardcode it, or a new internal dependency silently escapes the gate.

### R4. `adr-check.yml` duplicates Architecture Audit

- `adr-check.yml` runs `pnpm install`, `pnpm build --filter @mbe/cli...`, `pnpm --filter @mbe/cli start check-adr` on every PR and push. `ci.yml`'s `architecture-audit` job runs the same `check-adr` (plus `check-deps`) for every code PR.
- **But not for docs-only PRs.** `architecture-audit` is skipped when `has_code` is false, and `docs/adr/*.md` edits are exactly the docs-only change that alters `check-adr`'s rules. `adr-check.yml` is therefore the only PR-time ADR check for ADR-doc edits. **Do not delete it.** Narrow its trigger to `paths: docs/adr/**, tools/cli/src/**` (and `.github/workflows/adr-check.yml`), keep the push trigger as is, and let `architecture-audit` cover code PRs. This workflow is not a required check, so skipping it cannot affect `CI Gate`.
- Saving ~1 billed min per run (0.7 to 0.9 min each, billed 1).

### R5. Dockerfile Lint

Same predicate and detect output as R1. 0.2 min but 1 billed min, 24 of 24 skippable.

### R6. Dependency Sync

`scripts/check-dep-sync.mjs` runs `depcheck@1.4.7` per package under `apps`, `packages`, `services`, `tools`, so any source file edit there can add an undeclared import. A safe predicate must therefore include every file under those four directories, which leaves only PRs that touch `scripts/`, `.claude/`, `docs/`, root config, or `infrastructure/` only: 9 of 24 in the sample, 0.75 billed min per run. The better lever here is not a condition but speed (28 sequential `npx` spawns, 77 to 148 s); parallelising or caching `depcheck` is a separate change and is out of scope for this audit.

### Considered and not recommended

- **Skip the whole chain for "data-only" PRs** (`metrics/**`, `.claude/improvement-loop/**`, `apps/marketing/public/*.json`, `*.jsonl`). In the sample 3 of 24 runs were this shape and each cost ~29 billed min, so the prize is real (~3.6 min per run on average). It is unsafe in this repo: `scripts/__tests__/*` and `repo-audit` read `metrics/*.json*` (`ai-antipattern-baselines.json` feeds the antipattern ratchet; `check-queue-telemetry-dupes`, `metrics-freshness`, `health-trends`, `sensor-report` tests read the data files), and `apps/marketing/src/components/TrendChart.tsx` consumes the marketing JSON. Treat these PRs as code. Revisit only with a per-file allowlist backed by a test that proves no consumer reads the file.
- **Negative path filters on app e2e/visual workflows** (e.g. `!**/*.test.tsx`). Only 1 of 24 sample PRs was test-only inside an app path, and these workflows are advisory, so the saving is small and the false-negative risk (a test change that is the thing being verified) is not worth it.
- **Rialto source fan-out.** A `packages/rialto/src/**` change triggers `rialto-visual` (2.6), `apps-visual` (marketing 1.5 + hospitality 2.2), `rialto-web-e2e` (2.6 + 3.2), `e2e-screenshots` (5 to 6.6) and `e2e.yml`. Already path-gated, advisory, and each depends on rialto output; no safe narrower condition found.

## 4. Traps that make conditional skipping unsafe here

Sources: `.claude/rules/gotchas.md` § CI, `scripts/ci-gate-required-results.mjs`, `scripts/ci-gate-status.mjs`, and the workflow text above.

1. **A path-filtered or otherwise non-reporting required workflow leaves `CI Gate` missing.** `CI Gate` is the only required check on `main`. If it never runs the PR is `BLOCKED` with nothing red (the `gate-missing` state, #3969). So: never add `paths:`/`paths-ignore:` to the `pull_request` trigger of `ci.yml`, and never gate `ci-gate` itself. All conditionals must be job-level `if:` (or step-level) inside `ci.yml`. A job skipped by `if:` reports `skipped`, which `ci-gate-required-results.mjs` accepts.
2. **Docs-only skipping already bit once (2026-08-31).** `has_code == false` skips the entire Build chain, including `pnpm repo-audit` and `prettier --check .`; docs-only PR #4787 merged six unformatted docs and reddened #4790/#4792/#4797 and main. The fix was `docs-format`. Any new skip must ask the same question: which check does a skipped job perform that nothing else performs for this diff? Current residual gaps of the same class that this audit found (these are not new skips, they exist today): on a docs-only PR, `Integrity` (`detect-instruction-rot`, `check-doc-freshness`) and `Architecture Audit` are skipped, so a docs-only edit to `CLAUDE.md`, `AGENTS.md` or `docs/adr/*.md` is not checked for instruction rot, doc freshness or ADR rules until the push to `main`.
3. **The `ci.yml` header comment about docs-only pushes is stale.** It says a docs-only push runs only `detect-changes`, `docs-format`, `trivy`, and `ci-gate`. It does not: `detect-changes` forces `has_code=true` on every non-PR event, and main push run `38089972417` (docs-only commit `b87aec437`) ran Build, Test, Lint, RLS, etc. in full and skipped `Docs Formatting`. Practical consequence: the push to `main` is a complete safety net for anything a PR skipped, which is why every predicate below keeps non-PR events unconditional. That net catches problems after merge, not before, so it limits the blast radius but does not make a wrong skip free.
4. **A skip signal can be silently wrong (fail-open).**
   - `detect-changes` computes `git diff ... | wc -l`. GitHub's default `bash -e` shell has no `pipefail` (gotchas.md § CI), so a failing `git diff` (bad base ref, shallow clone) yields `0`, which sets `has_code=false` and skips the whole chain. `CI Gate` still passes, because `has_code` is a valid value. Harden this before adding more outputs.
   - `ci-gate-required-results.mjs` validates only `has_code` (`"true"` or `"false"`) and `prepare`. A new output such as `docker` that ends up empty (step failed, typo in the output name) makes `needs.detect-changes.outputs.docker == 'true'` false, which reads as a legitimate skip. Each new output must be added to the fail-closed root check (exactly `"true"` or `"false"` or the gate fails) and covered in `scripts/__tests__/ci-gate-required-results.test.mjs`.
5. **A skipped parent cascades `skipped` to every dependent, which looks identical to a legitimate skip** (the 2026-10-05 incident, PR #6077, where `abandoned` jobs plus cascaded `skipped` let `CI Gate` go green with nothing verified). New gates must hang off `detect-changes` (like `hadolint` and `migration-dry-run` do), not off a job that can itself be skipped or abandoned, and must stay in `ci-gate`'s `needs:`.
6. **Predicates must include the check's own definition.** A PR that changes `ci.yml`, `.github/actions/setup-workspace/**`, `pnpm-lock.yaml`, `.dockerignore`, `.hadolint.yaml`, or the script a job runs must still run that job. Without this a change that breaks the check passes because the check was skipped.
7. **Lockfile changes force a cold run** (turbo `globalDependencies`). Keep `pnpm-lock.yaml` in the force-run set for R2, and expect marginal-timeout suites to be tighter on those runs (gotchas.md § CI, #3588).
8. **Filtered test runs change the coverage number** (R2). The repo-wide threshold is a ratio over whatever `coverage-final.json` files exist.
9. **Existing guards the follow-ups must satisfy.** `scripts/check-ci-gate-coverage.mjs` (every `ci.yml` job reachable by `ci-gate`), `scripts/check-workflow-paths-coverage.mjs` (a `paths:` filter that cannot fire on what the workflow exercises), and structure tests such as `ci-docs-format-gate.test.mjs`, `ci-lint-critical-path.test.mjs`. These will fail, correctly, if a new condition is wired in carelessly.
10. **`strict` is off on `main`** (branch protection measured as `strict: false`), so a PR is judged on its own head and merge ref, not on `main` as it will be after merge. A predicate computed from the PR diff cannot see a concurrent change on `main`; the unconditional push run on `main` is what catches interaction. Do not add a skip to the push, `merge_group`, or `workflow_dispatch` path.
11. **`workflow_dispatch` and the commit-status path.** `CI Gate` publishes a commit status so dispatch-triggered runs on `GITHUB_TOKEN`-authored PRs can still satisfy branch protection. New conditions must evaluate to "run everything" on `workflow_dispatch` (the existing `EVENT_NAME != pull_request` branch already does this).

## 5. How each recommendation keeps `CI Gate` reporting

All six use the same mechanism, and none touch `ci-gate`'s trigger:

- `detect-changes` gains a small number of explicit outputs (`docker`, `prisma`, `rls`), each forced to `"true"` on non-PR events, on any change to `ci.yml` / `.github/actions/**` / `pnpm-lock.yaml`, and computed with `set -o pipefail` and an explicit failure on a bad base ref.
- The gated job keeps `needs: [detect-changes]` (or its current upstream) and adds `if: needs.detect-changes.outputs.<name> == 'true'`. When false it reports `skipped`, which `ci-gate-required-results.mjs` treats as pass.
- The job stays in the `ci-gate` `needs:` list (automatically gated, since the gate reads `toJSON(needs)`).
- `ci-gate-required-results.mjs` is extended so each new output must be exactly `"true"` or `"false"`; anything else fails the gate (trap 4).
- R4 touches `adr-check.yml`, which is not a required check, so there is no gate interaction; the safety property is instead that code PRs remain covered by `architecture-audit`.
- R2 keeps the full run on `push`/`merge_group`/`workflow_dispatch`, so `CI Gate` and the coverage threshold are still evaluated against the complete suite on `main`.

## 6. Prioritized recommendations (candidate follow-up issues, not filed)

Order is by safety-adjusted payoff: do the hardening first, because every later item depends on it.

### 1. Harden `detect-changes` and the CI Gate root check before adding any new skip

- **Title:** `ci: make detect-changes fail closed and validate every output in CI Gate`
- **Why first:** trap 4. Today a failing `git diff` skips everything and passes the gate, and adding outputs widens that hole.
- **ACs:**
  - `detect-changes` uses `set -o pipefail` (or no pipe) and fails the job when the base ref cannot be resolved or `git diff` errors.
  - `ci-gate-required-results.mjs` requires every `detect-changes` output to be exactly `"true"` or `"false"`; a unit test covers empty, missing, and unexpected values.
  - A test asserts that for non-`pull_request` events every output is `"true"`.
  - The stale header comment in `ci.yml` (lines 4 to 12) is corrected to match behavior.
- **Saving:** none directly; unblocks items 2, 4, 5.

### 2. Gate Container Security Scan and Dockerfile Lint on Dockerfile changes, and collapse the trivy matrix

- **Title:** `ci: run trivy and hadolint only when a Dockerfile (or the workflow) changes`
- **Estimated saving:** 4.8 billed min per `ci.yml` run (trivy 4.0 + hadolint 0.83); 3.0 of that is the matrix collapse and holds even on runs that do scan. About 16% of the 29.1 average.
- **ACs:**
  - New `docker` output on `detect-changes`: `"true"` if the PR diff touches `**/Dockerfile`, `.dockerignore`, `.hadolint.yaml`, or `.github/workflows/ci.yml`, or the event is not `pull_request`.
  - `hadolint` and `trivy` have `if: needs.detect-changes.outputs.docker == 'true'` and `needs: [detect-changes]`; both remain in `ci-gate` `needs`.
  - The 4-leg trivy matrix becomes one job that scans each Dockerfile in turn; every scan still fails the job on CRITICAL/HIGH; SARIF upload is preserved per Dockerfile.
  - Tests: a docs-only PR and a code PR with no Dockerfile change both end with `CI Gate` green and trivy `skipped`; a PR touching one Dockerfile runs trivy and a seeded misconfig fails it.
  - `check-ci-gate-coverage` and the structure tests still pass.

### 3. Gate Validate Migrations and RLS Integration on their real inputs

- **Title:** `ci: skip Postgres-backed migration and RLS jobs when no Prisma or reservations-closure file changed`
- **Estimated saving:** 2.5 billed min per `ci.yml` run (1.17 + 1.33), about 8.6% of the average, plus two fewer Postgres service containers.
- **ACs:**
  - `prisma` output: `services/*/prisma/**`, `scripts/discover-prisma-services.mjs`, `scripts/check-destructive-migrations.js`, `pnpm-lock.yaml`, `ci.yml`, or non-PR event.
  - `rls` output derived at run time from `pnpm ls --filter "@mbe/reservations-service..." --depth -1 --json` (no hand-written package list), plus `scripts/assert-vitest-ran.mjs`, lockfile, `ci.yml`, or non-PR event.
  - Both jobs gate with `if:` on those outputs and stay in `ci-gate` `needs`.
  - A test proves adding a new internal dependency to `@mbe/reservations-service` flips `rls` to `"true"` for a change in that package.
  - `Migration Dry-Run` is moved to the same `prisma` output so it stops spinning up a runner with full history on every code PR (0.2 min, 1 billed, 23 of 24 sample runs had no Prisma change).

### 4. Narrow `adr-check.yml` so it stops duplicating Architecture Audit

- **Title:** `ci: limit adr-check.yml to ADR and CLI changes; code PRs stay covered by Architecture Audit`
- **Estimated saving:** ~1 billed min per PR (0.7 to 0.9 min, billed 1).
- **ACs:**
  - `adr-check.yml` `pull_request` trigger gets `paths: docs/adr/**, tools/cli/**, .github/workflows/adr-check.yml`; the `push` trigger is unchanged.
  - A test (or the `check-workflow-paths-coverage` check) confirms the filter still fires on the files `check-adr` reads for its rules.
  - Confirm `architecture-audit` runs `check-adr` against the same ADR set for code PRs (it does today); no change to `ci.yml`.
  - Docs-only PRs that edit `docs/adr/*.md` still get an ADR check.

### 5. Measure, then scope the Test job to affected packages on PRs

- **Title:** `ci: measure and prototype affected-only test:coverage on pull_request`
- **Estimated saving:** 2 to 3 billed min per code PR run (estimate, not measured; the job is the largest at a 6.1 min median, 128 min over 21 runs). Treat as an experiment, not a commitment.
- **ACs:**
  - Step 1 (measurement, no behavior change): for 30 recent merged PRs, compute the set of packages `--filter='...[origin/main...HEAD]'` would select and the resulting test minutes; record the distribution in a doc under `docs/audits/`.
  - Step 2 (only if step 1 supports it): `pull_request` runs `turbo test:coverage --filter='...[origin/main...HEAD]' --concurrency=2`; `push`, `merge_group`, `workflow_dispatch`, and any PR touching `pnpm-lock.yaml`, `turbo.json`, root config, or `ci.yml` run the full suite.
  - The repo-wide 60% and agent-core 80% thresholds are evaluated only on the full run (or recomputed against main's baseline) so a filtered run cannot move the number.
  - The Codecov upload step tolerates absent `coverage-final.json` files.
  - A deliberately broken test in an unaffected package is still caught on the push to `main` (documented, since PRs will no longer see it).

### 6. Close the docs-only coverage gap (safety, costs minutes)

- **Title:** `ci: run instruction-rot, doc-freshness and ADR checks on docs-only PRs`
- **Estimated cost:** roughly +1 billed min on docs-only PRs (Integrity is 0.4 min, billed 1). 4 of 25 sample runs were docs-only.
- **Why:** trap 2. Today `Integrity` and `Architecture Audit` are skipped when `has_code` is false, so edits to `CLAUDE.md`, `AGENTS.md`, or `docs/adr/*.md` are first checked on the push to `main`.
- **ACs:**
  - `docs-format` (or a sibling job gated on `has_code != 'true'`) also runs `node scripts/detect-instruction-rot.mjs` and `node scripts/check-doc-freshness.mjs`.
  - The job is in `ci-gate` `needs`; a docs-only PR with a dangling instruction reference fails `CI Gate`.
  - `ci-docs-format-gate.test.mjs` is extended to pin this.

### 7. Speed up Dependency Sync (not a condition, listed because the condition is weak)

- **Title:** `ci: parallelise or cache depcheck in Dependency Sync`
- **Estimated saving:** about 1 billed min per code run (step is 77 to 148 s, 28 sequential `npx` spawns); the condition-only variant (R6) saves 0.75 and is skippable on just 9 of 24 runs, so prefer speed over skipping.
- **ACs:** same fail-closed accounting in `check-dep-sync.mjs` (explicit clean / gaps / failed-to-audit per package, zero packages audited is a failure); `depcheck` stays pinned; wall time under 60 s on a warm run.

### Summary of expected effect

Items 2, 3, 4 together save about **8.3 billed min of the 29.1 average per `ci.yml` run (~29%)** with no loss of coverage on `main`. Item 5 might add 2 to 3 more but needs the measurement first. Item 1 is a prerequisite for 2 and 3, and item 6 is a deliberate small spend that closes a gap already visible today.
