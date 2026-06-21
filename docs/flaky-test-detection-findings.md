# Flaky-Test Detection Spike: Findings

**Date:** 2026-06-21
**Issue:** #2536
**Verdict:** NOT FEASIBLE without new infrastructure

## What per-test history exists today

### CI workflow (`ci.yml`)

The Test job runs `pnpm turbo test:coverage` — a turbo-cached vitest run that:

- Emits results to **stdout only** (default vitest reporter)
- Uploads **coverage JSON** (`coverage-final.json`) to Codecov — coverage is per-file, not per-test
- **Does NOT** upload a `--reporter=junit` XML artifact or a vitest `--reporter=json` `outputFile`
- Has **0 GitHub Annotations** on passing test jobs (confirmed via Checks API: `check-runs/{id}/annotations` returns `[]`)

### Vitest configuration

Root `vitest.config.ts` and `scripts/vitest.config.mjs` use the default reporter. The coverage configs in services (`services/*/vitest.config.ts`) specify `reporter: ["text", "json", "html"]` for coverage, not for per-test results. The only `--reporter=json` invocation in CI is a one-off for accessibility tests in the `a11y-attribution` job, and that output file (`a11y-results.json`) is not persisted between runs.

### Stored metrics

`metrics/` contains: `sensor-report.json`, `sensor-report-prev.json`, `ai-antipattern-baselines.json`, `threshold-changes.jsonl`, `process-metrics.jsonl`, `instruction-changes.jsonl`, `acmm-evals.jsonl`. **None contain per-test pass/fail records.**

### GitHub API

- `gh run list` returns workflow-level conclusions (`success`, `failure`) — no per-test granularity
- `gh api check-runs/{id}/annotations` returns 0 annotations for passing test jobs; only process-exit annotations for failing ones (not per-test failure details)
- No artifact uploads from unit test jobs; only E2E and smoke test artifacts exist

## Why flaky detection requires same-SHA data

A test is "flaky" only when it both passes **and** fails on the **same commit SHA** (unchanged code). Detecting this requires storing named test outcomes indexed by (test name, SHA) across multiple runs. Nothing in the current pipeline captures named per-test outcomes at any granularity — only aggregate pass/fail for the whole suite.

## Cheapest path to enable flaky detection

**Step 1: Enable JUnit reporter in CI (1 line change, no new deps)**

Add `--reporter=junit --outputFile=test-results/results-{shard}.xml` to the `pnpm turbo test` invocation, or configure vitest per-package with `reporters: ["default", "junit"]` and `outputFile: { junit: "test-results.xml" }`.

Vitest ships a built-in JUnit reporter — zero new dependencies.

**Step 2: Upload test results as workflow artifacts (2–4 lines)**

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-results-node${{ matrix.node-version }}
    path: "**/test-results*.xml"
    retention-days: 14
```

**Step 3: Download and parse in sensor-report (collector already stubbed)**

`collect-flaky-tests.mjs` (see this PR) exports `computeFlakyTests(runs)` where `runs` is an array of `{ sha, testName, passed }` records. Once artifact download + JUnit XML parsing is wired, the sensor activates automatically. The collector returns `{ available: false }` today with a `data_gap` note explaining what is missing.

**Estimated effort:** 1–2 hours for Steps 1–2 (CI changes), 2–3 hours for the download/parse glue in `sensor-report.mjs`. Total: one small agent-sized issue.

**Follow-on issue recommended:** "Enable JUnit reporter + upload test-result artifacts in CI to feed flakyTests sensor"

## What this PR delivers

- This findings document
- `scripts/collect-flaky-tests.mjs`: pure, dependency-injectable collector module — accepts a `runs` array as input, detects flaky tests (same SHA, mixed outcomes), returns structured output or `{ available: false }` when history is absent
- `scripts/__tests__/collect-flaky-tests.test.mjs`: unit tests at the collector seam using fixtures (a flaky test, a stable test, empty history)
- `sensor-report.mjs`: wired with a `flakyTests` sensor entry that calls the collector with no data today — returns `{ available: false, data_gap: "no per-test run history" }`

The collector is fully tested and ready to activate the moment per-test history is available. No speculative infrastructure was built.
