---
stage: architect
run: feature:ci-test-matrix-split
date: 2026-10-14
ux: skipped — No user-facing surface; the change is CI workflow topology (recorded at PRD time).
adr: none — ADR 104–106 reserved, none consumed; the split is a two-way door (one revert of ci.yml restores the single job), so it fails the hard-to-reverse leg of the ADR test.
assumptions:
  - "Leg composition (three named heavy packages + exclusion-derived rest) is fixed here from the issue's measured durations without live confirmation; the rest leg's ~7m fit is inferred (total − big three ≈ 740s of task time), measured only at SC-3."
  - "Coverage artifacts are uploaded per leg and downloaded with merge into the workspace root, reconstructing repo-relative paths; chosen over uploading a single tarball because it reuses the pinned actions already in ci.yml and keeps the gate's existing find-based scan byte-identical."
---

# Architecture: Test matrix legs + `test-coverage-gate`

## Shape

```
test (matrix.leg: reservations | hospitality | rialto | rest; node 22)
  run: pnpm turbo test:coverage --concurrency=2 <leg filters>
  upload: coverage-<leg>   (*/coverage/coverage-final.json, */*/coverage/coverage-final.json)
  upload: test-results-node22-<leg> (test-results/*.xml, */test-results/*.xml, */*/test-results/*.xml)
test-coverage-gate (needs: test, if: always() is NOT used — plain needs)
  download: pattern coverage-*, merge-multiple into workspace root
  repo-wide 60% gate | agent-core 80% gate | codecov upload   (logic unchanged)
ci-gate: needs gains test-coverage-gate; report-health: needs [.. test ..] untouched
```

## Decisions

1. **Legs.** `matrix.leg` ∈ `reservations` (`--filter=@mbe/reservations-service`),
   `hospitality` (`--filter=@mbe/hospitality`), `rialto`
   (`--filter=@mattbutlerengineering/rialto`), `rest` (exclusions only:
   `--filter=!@mbe/reservations-service --filter=!@mbe/hospitality
--filter=!@mattbutlerengineering/rialto`). Exclusion-derived `rest` is the
   load-bearing choice: a new package can never fall outside every leg, so
   the guard's exactly-one property holds by construction and the test only
   has to detect double-coverage (a package named in two legs) and drift
   (a named package that no longer exists). `node-version: [22]` stays a
   matrix axis so the job name keeps its `Node 22` semantics:
   `Test (Node 22, <leg>)`.
2. **Job id `test` survives.** `ci-gate` and `report-health` key on the job
   id, and GitHub waits on all matrix legs for a `needs: test` edge — so
   SC-4 needs no consumer edits. The required branch-protection context is
   `CI Gate` alone (measured, gotchas § CI), so display-name changes are
   safe.
3. **Per-leg steps.** Each leg keeps checkout, setup-workspace, turbo caches,
   Prisma-client restore, and the `--concurrency=2` cap (pinned by
   `nightly-compliance-workflow.test.mjs`). The three inline coverage/codecov
   steps and `COVERAGE_THRESHOLD` move out of `test` wholesale.
4. **Artifact round-trip.** Upload per leg as `coverage-${{ matrix.leg }}`
   with fixed-depth globs `*/coverage/coverage-final.json` and
   `*/*/coverage/coverage-final.json` (covers `scripts/` at depth 1 and every
   `packages|services|apps|tools|plugins|infrastructure/*` at depth 2; no
   root-level coverage exists). Download in the gate with
   `pattern: coverage-*`, `merge-multiple: true`, `path: .` — upload-artifact
   preserves paths relative to the workspace, so the gate's existing
   `find . -path '*/coverage/coverage-final.json'` scan and the codecov
   explicit file list work unchanged. Test-results XML stays per-leg
   (`test-results-node22-<leg>`), fixed-depth globs unchanged; nothing
   downloads it, as today.
5. **Gate job.** `test-coverage-gate` (name `Test Coverage Gate`),
   `needs: [test]`, `runs-on: ubuntu-latest`, env `COVERAGE_THRESHOLD: 60`.
   Steps: checkout (gate script is inline bash + node, checkout for repo
   context), download, then the three moved steps verbatim (repo-wide gate,
   agent-core gate, codecov upload with the existing explicit `files:` list
   and pinned action SHAs). The leg-conditional `if: matrix.node-version == 22`
   guards are dropped — the gate job has no matrix. Fail-closed behavior is
   inherited: zero coverage files found ⇒ `TOTAL_LINES -eq 0` ⇒ red.
6. **`ci-gate`.** Add `test-coverage-gate` to the inline `needs:` list;
   `toJSON(needs)` gates it automatically (ci.yml's own comment). `test`
   stays in the list — legs failing must stay independently fatal.
7. **Guard test.** `scripts/__tests__/ci-test-shards.test.mjs`, textual
   parse of the real `ci.yml` (pattern: `ci-lint-critical-path.test.mjs`):
   extract the leg filter expressions and assert against `git ls-files`'d
   workspace `package.json`s that every `test:coverage` package is selected
   by exactly one leg (named-leg lists disjoint, every named package exists,
   `rest` excludes exactly the union of named legs); assert `ci-gate` needs
   `test-coverage-gate`; assert `COVERAGE_THRESHOLD: 60` sits on the gate
   job and the literal 80 threshold remains in the agent-core step.

## Rejected

- **Turbo-native sharding or one-job-per-package:** 32 jobs × setup
  (~1–2m each) multiplies billable minutes for no critical-path win over
  four balanced legs.
- **Keeping gates in a designated leg:** reintroduces the serial join inside
  the longest leg and makes the gate's inputs depend on leg ordering.
- **`needs: [test]` with `if: always()` on the gate:** would run the gate on
  red legs and could report a plausible-but-partial repo-wide %; a missing
  leg must mean no gate verdict at all.
