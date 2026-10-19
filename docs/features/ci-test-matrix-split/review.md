---
stage: review
run: feature:ci-test-matrix-split
date: 2026-10-18
verdict: ship-record-ok — no critical finding; 1 major open for the Owner; 3 minors deferred
assumptions:
  - "Scope is #6684 (`3c0263c6e`) as merged, meaning its `ci.yml`, `ci-test-shards.test.mjs` and `ci-coverage-upload-paths.test.mjs` edits, plus #6720 (`650f19217`), whose `prepare` build step and `test: needs: [prepare]` change the Test legs. #6855 (`4b68906af`) and #6888 (`f1f6f7ecf`) were read. They touch only the `docs-format` and `lint` jobs, so they are out of scope."
  - "Severity is the reviewer's ranking. The skill has the Owner arbitrate it, and this unattended stage could not ask. The report-health finding is ranked major, not critical: it is latent, and the coverage gate failed in 0 of the 70 failed `ci.yml` runs since the merge. Only a live production defect counts as critical."
  - "Minors are deferred under the skill's default ('Minors … may be deferred freely'). This stage writes only review.md, so a finding can only be fixed by a follow-up."
  - "ADR standing: `adr_status.py` reports all 28 ADRs as `unrecognized`. Their status text reads `active`, so the ADR reference treats them as live."
  - "Standards: the plugin's `docs/standards.json` holds 4 statements, in the domains factory, pipeline and eval. None of them matches a target-repo CI workflow change, so no finding cites a slug."
  - "Cost sample: 60 successful `ci.yml` runs from 2026-10-12 to the merge, keeping the 46 with a single Test job, against 60 successful runs from 2026-10-16 to 10-18, all 41 of which ran 4 legs plus the gate. A job's billable minutes are its wall-clock rounded up to the minute. These are runner minutes, not a billing figure: the repo is public."
---

# Review: Test matrix legs + `test-coverage-gate`

## Scope

This review covers the change as it runs on `main` (`af0d8d546`, which is
`75fb859d4`'s parent tree), not a PR branch:

- **#6684 `3c0263c6e`**. It splits `test` into
  `matrix.leg ∈ {reservations, hospitality, rialto, rest}` (`ci.yml:538-658`)
  and adds the `test-coverage-gate` job (`ci.yml:660-754`). It adds the gate
  to `ci-gate`'s `needs` (`ci.yml:1138-1162`) and adds the guard
  `scripts/__tests__/ci-test-shards.test.mjs` (178 lines).
- **#6720 `650f19217`**. Prepare now builds the `^build` closure
  (`ci.yml:111-118`), so `test` needs `[prepare]` instead of `[typecheck]`
  (`ci.yml:551`).
- **#6855 and #6888** were read and found irrelevant. They add one step each,
  to `docs-format` and `lint`.

Read alongside: the `report-health` job (`ci.yml:978-1023`),
`scripts/ci-gate-required-results.mjs`, root and `scripts/` `turbo.json`,
`pnpm-workspace.yaml`, the edge worker's `health/system.js`, and ADR-016.

## Findings

### Major: `report-health` no longer sees coverage failures, so `/health/system` can report CI healthy on a red `main`

- **Where:** `ci.yml:980` `needs: [detect-changes, lint, typecheck, build, test, migrations]`.
  The verdict loop at `ci.yml:1005` reads only those results. Before #6684
  the repo-wide 60% step, the agent-core 80% step and the codecov step all ran
  inside `test`, so a threshold failure made `TEST_RESULT=failure`. #6684
  moved them into `test-coverage-gate` (verification.md WO-0058 diff), which
  `report-health` does not need. The architecture recorded this edge as
  "`report-health: needs [.. test ..] untouched`" (`architecture.md:24`). The
  guard pins only that edge: `ci-test-shards.test.mjs:175-176` asserts that
  `report-health.needs` contains `test`.
- **Scenario:** a push to `main` whose legs pass but whose coverage gate
  fails. Causes include repo-wide coverage under 60%, agent-core under 80%, a
  missing `packages/agent-core/coverage/coverage-final.json`, or a
  `download-artifact` error that leaves `TOTAL_LINES=0`. `CI Gate` goes red.
  `report-health` still runs (`if: always() && main && has_code`), finds no
  `failure` or `cancelled` result, and PUTs `conclusion: "success"` to KV
  `ci/latest` (`ci.yml:1004-1024`). The edge worker's `ciStatus()` maps that
  value to `healthy` (`infrastructure/worker/health/system.js:96-101`), so
  the public `GET /health/system` reports a green CI for a red `main`. The
  pre-split workflow reported `unhealthy` for the same failure.
- **Live?** No. The gate concluded `success` in 13 of the 70 failed `ci.yml`
  runs since the merge, `skipped` in 23, and was absent in 34. It never
  failed. Current margins are 86% against 60% and 95% against 80% (gate log,
  run 39172972797). This is a latent regression, not a live defect.
- **Suggested fix (for the Owner):** add `test-coverage-gate` to
  `report-health`'s `needs`, pass `COVERAGE_GATE_RESULT` into the loop, and
  have the guard assert both edges. `skipped` must stay non-failing, because a
  red leg already sets `TEST_RESULT=failure`.
- **Standard:** none.
- **Decision:** **open, for the Owner.** Majors are not decided at this stage.

### Minor: coverage collection is fixed at depth 2, and the guard's package list is hard-coded. Neither is tied to `pnpm-workspace.yaml`

- **Where:** the leg upload `ci.yml:654-656` collects
  `*/coverage/coverage-final.json` and `*/*/coverage/coverage-final.json`. The
  guard's `coveragePackages()` (`ci-test-shards.test.mjs:54-71`) walks a fixed
  list of directories: `apps services packages tools plugins` plus
  `infrastructure/pulumi`, `infrastructure/worker` and `scripts`. It does not
  read `pnpm-workspace.yaml`.
- **Scenario:** someone adds a workspace glob deeper than two levels, such as
  `packages/integrations/*`. Its package's tests still run, because `rest` is
  derived by exclusion and turbo resolves the workspace. Pass or fail, it is
  still gated. But its `coverage-final.json` sits at depth 3, so no leg
  uploads it. It drops out of the repo-wide numerator and denominator without
  any notice. Before the split, the single job's
  `find . -path '*/coverage/coverage-final.json'` (`ci.yml:703`, unchanged)
  ran in the same workspace and would have counted it. The guard stays green,
  because it never enumerates that directory. The same blind spot applies to
  a new top-level workspace directory, such as `infrastructure/edge`. That
  case is harmless for leg selection, since `rest` still picks it up. Today
  every glob in `pnpm-workspace.yaml:2-9` is at most two levels deep, so
  nothing is dropped now.
- **Standard:** none.
- **Decision:** deferred under the skill default. Suggested follow-up: derive
  the package list in `coveragePackages()` from `pnpm-workspace.yaml`, and
  assert that every glob's depth is covered by an upload pattern.

### Minor: ADR-016's Decision text now names the wrong job, and its runner-concurrency premise is unmeasured under four legs

- **Where:** `docs/adr/ADR-016-green-main-merge-gating.md:39-40`. The text
  says the repo-wide floor is "enforced inside that job's Node-22 leg" and is
  "defined once as the `test` job's `COVERAGE_THRESHOLD` env … a failing
  threshold fails the job". Since #6684 the env is on `test-coverage-gate`
  (`ci.yml:672-673`), and a threshold failure fails that job, not `test`.
  Line 37 grounds the critical-path composition on "merge-blocking jobs win
  Actions runner concurrency". Test now takes 4 concurrent runners plus the
  gate, where it took 1.
- **Scenario:** a reader takes ADR-016 as the source of truth. They are the
  likely author of the next `report-health` or `ci-gate` edit, which is how
  the major above happened. They look for the threshold on `test` and reason
  that a coverage failure fails `test`. No ADR is owed for the split itself:
  `architecture.md` records it as a two-way door, a single revert, and it
  fails the "hard to reverse" leg. But the live ADR's wording has decayed.
  Under the protocol's never-rewrite rule, the fix is an amending note or
  ADR, not an edit to the Decision section.
- **Queueing:** not measured. `verification.md` § Not verified also notes
  this gap.
- **Standard:** none.
- **Decision:** deferred under the skill default. The run consumed no ADR from
  its reserved block (104–106), so one is available if the Owner wants an
  amendment.

### Minor: #6720's hand-written `^build` filter in Prepare can drift from the real closure, and the guard pins only its text

- **Where:** `ci.yml:118` runs
  `pnpm turbo run build --filter='./packages/*' --filter='./services/*' --filter=@mbe/edge-worker`.
  The guard in `ci-lint-critical-path.test.mjs`
  ("prepare builds the ^build closure…") checks only that this string exists.
- **Scenario:** a test-bearing package gains a `^build` dependency outside
  `packages/` and `services/`, for example a `tools/*` library. Prepare does
  not build it. Each leg whose packages depend on it misses the cache and
  builds it itself, up to 4× per cold run. Results stay correct, because
  turbo builds what is missing. The cost is wall-clock and runner minutes,
  and none of it is visible: the guard stays green. Verification measured
  that today every leg's only cache misses are its own `test:coverage`
  tasks, so the closure is complete now.
- **Standard:** none.
- **Decision:** deferred under the skill default. Suggested follow-up:
  assert in the guard against `turbo run test:coverage --dry=json` that every
  `build` task in the Test legs' graph is selected by Prepare's filters.

## Passes with no findings

- **Correctness of the gate. It fails closed:**
  - **A skipped or cancelled leg cannot pass.** `fail-fast: false`, and
    `needs.test.result` is the matrix aggregate. A failed or cancelled leg
    makes `test` ≠ success, so `test-coverage-gate` is `skipped`.
    `ci-gate-required-results.mjs` passes only `success` and `skipped`, so
    `test=failure` or `test=cancelled` fails CI Gate. A `skipped` `test` is
    reachable only through a skipped `prepare`, and the module accepts that
    only when `has_code == "false"`. The `has_code == "true"` and
    prepare ≠ success case is rejected (`ci-gate-required-results.mjs:63-72`).
  - **Observed:** run 39091316665, attempt 2, cancelled before the matrix
    expanded: `Test (Node ${{ matrix.node-version }}, ${{ matrix.leg }})`
    `cancelled`, `Test Coverage Gate` `cancelled`, `CI Gate` `failure`. Run
    38786278037, attempts 1 and 2: hospitality `failure`, gate `skipped`,
    `CI Gate` `failure`.
  - **No `if: always()` on the gate** (`ci.yml:662-666`), so a partial
    percentage is never published.
  - **A missing artifact fails closed:**
    - A leg with no coverage files fails at upload (`if-no-files-found: error`, `ci.yml:658`).
    - Zero downloaded reports give `TOTAL_LINES -eq 0` and exit 1 (`ci.yml:717-720`).
    - A missing agent-core report exits 1 (`ci.yml:732-735`).
  - **3 of 4 artifacts with all legs green is not reachable:**
    - Each leg's upload step is part of that leg's success.
    - Artifacts are scoped to the run and survive re-runs. Run 38938873531,
      attempt 2, lists exactly one `coverage-*` per leg. Its gate logged
      `Found 7 artifact(s)` and `Total of 4 artifact(s) downloaded`. Runs
      38849195391 and 38752418893 logged the same.
  - **Turbo cache hits still produce coverage files:** `test:coverage` declares
    `outputs: ["coverage/**"]`, and verification counted 31 files in run 39172972797.
- **Pipefail.** The run blocks whose exit code matters are the leg's turbo
  command (`ci.yml:629`) and the two threshold scripts. None pipes into
  another command whose status would decide the step:
  - The `$(find …)` in a `for` list and the `< <(jq …)` process substitution
    can mask a failure. That only empties their input, which ends in the
    fail-closed `-eq 0` branches.
  - Both scripts were moved verbatim, as verification's WO-0058 diff shows.
  - The step #6720 added is a single command, and its own comment says so.
- **Shard completeness on a new package.** `rest` is pure exclusion
  (`ci.yml:569-570`). A new workspace package therefore lands in `rest`
  automatically and cannot fall outside every leg. The guard catches the two
  remaining drifts: a package in two legs, and a renamed or deleted named
  package (`ci-test-shards.test.mjs:93-111`). The guard cannot be replayed
  from cache past a workflow edit, because `scripts/turbo.json`'s
  `test:coverage` inputs include `$TURBO_ROOT$/.github/**`. The one
  completeness gap, coverage depth, is the minor above.
- **Coverage thresholds unchanged.**
  - `COVERAGE_THRESHOLD: 60` (`ci.yml:672-673`) and `-lt 80` (`ci.yml:750`)
    are pinned by the guard (`ci-test-shards.test.mjs:151-158`).
  - The codecov `files:` list is identical to the pre-split one
    (verification: `diff` exit 0, 17 files).
- **Security.**
  - Permissions are unchanged: workflow-level `contents: read`, no new
    `write` grant, and the gate job declares none.
  - All three new action uses keep full-SHA pins: `upload-artifact@cf430e0…`,
    `download-artifact@9000827…` and `codecov-action@303a32d…`.
  - **Artifact trust:** the artifacts come from the same run. The leg upload
    glob limits their paths to `coverage-final.json` files. The gate only
    `require`s them as JSON (`ci.yml:704`), which parses and does not execute.
    A PR author who could forge coverage there could edit `ci.yml` directly.
  - **Exposure narrowed:** `CODECOV_TOKEN` now lives in a job that never
    executes test code. Before the split it was a step in the same job that
    ran every package's tests.
- **Complexity** (lean cut-list over the diff): nothing to cut.
  - The `?? {…}` fallbacks in the guard (`ci-test-shards.test.mjs:22`,
    `114`, `143`, `153-161`) let it fail with an assertion instead of a TypeError when a
    job is missing. They are how it was proved RED, and they have readers.
  - `--concurrency=2` on single-package legs is required by
    `nightly-compliance-workflow.test.mjs`.
  - The four-leg matrix is the smallest shape the critical-path target allows.
    The alternative of one job per package (32) was rejected in
    `architecture.md`.
- **Cost.** This is a trade-off, not a defect:
  - **Per run.** Over the sample above, billable Test minutes per successful
    run went from 7.0 (single job, n=46) to 8.5 (4 legs + gate, n=41), about
    +21%. Most of the increase is per-job setup and rounding up to the
    minute.
  - **Wall-clock.** The summed wall-clock fell slightly, from 386s to 361s,
    after #6720 moved the build into Prepare.
  - **Billing and concurrency.** The repo is public (`gh api repos/… → visibility: public`),
    so these are runner minutes, not a measured bill. The concurrency side is
    in the ADR-016 minor.
- **Design vs `architecture.md`:**
  - Decisions 1–7 match the code as merged.
  - The one undocumented consequence, the `report-health` coverage blind spot,
    is the major above.
  - #6720 changes `test`'s `needs`, a change outside this run's architecture.
    It is recorded in its own commit, its guard and the job's comment
    (`ci.yml:547-551`).
  - No decision passes the three-leg ADR test.
- **ADR compliance.**
  - **ADR-015 (pnpm + turbo):** honoured, because legs select packages with
    `turbo --filter`.
  - **ADR-016:** its substance is honoured: one test pass per Node major, one
    60% source, and a failure still fails `CI Gate`. The wording drift is the
    minor above.
  - **ADR-023 and ADR-027 (merge-train batching):** not reached.
  - **Out of scope** (a subject this diff never reaches): ADR-001–014,
    017–022, 024–026 and 028.
- **Domain passes:** none selected. The paths in scope are `.github/workflows/ci.yml`,
  `scripts/__tests__/*.mjs` and `docs/features/**`. #6888's `package.json`
  and `pnpm-lock.yaml` edits sit outside the scope.

## Out-of-scope observations (not findings for this run)

- Neither the legs nor the gate set `timeout-minutes`, so the 360-minute
  default applies. That predates the split: the single `test` job had none
  either (`3c0263c6e^:ci.yml` sets `timeout-minutes` only on jobs at lines
  101, 132, 147, 171, 737 and 946).
- `report-health` never covered `integrity`, `architecture-audit` or the
  other `ci-gate` needs. Its narrower scope predates #6684. The major is only
  the part #6684 removed.

## Verdict

The change is already live on `main` and nothing blocks recording it as
released. No critical finding, and so no live production defect, was found.
The gate fails closed on every failure path checked: skipped, cancelled or
failed legs; missing artifacts; and re-run attempts. Shard completeness holds
by construction. The thresholds are unchanged.

**One major stays open for the Owner:** `report-health` can publish a green CI
health for a `main` whose coverage gate failed. It is latent, with 0
occurrences in 70 failed runs. The fix is two lines plus a guard assertion.

Three minors are deferred with their reasons logged:

- coverage depth and the guard's package roots are not tied to the workspace
- the decayed wording of ADR-016
- drift in #6720's Prepare closure
