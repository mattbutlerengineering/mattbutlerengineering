---
stage: verify
run: feature:dependabot-auto-merge
date: 2026-10-15
assumptions:
  - "fetch-metadata v3.1.0's output names (package-ecosystem, dependency-group, update-type, dependency-names) could not be re-checked against the action's README from this session — no network/WebFetch tool is in this stage's tool allowlist. The names match the action's commonly documented output set and are unchanged from architecture.md's assumption; flagged under Not verified rather than silently accepted."
  - "WO-39's measurement replay uses the 11 PR numbers idea.md names explicitly (the slow outliers of the 30-PR sample), each already categorized there as official-action or @types/* patch/minor — this session also has no gh/API access, so the replay is against those 11, not the full 30, per breakdown.md's own recorded scope."
---

# Verification: Dependabot auto-merge policy

## Summary

6/6 PRD success criteria PASS. All 25 unit tests pass (18 policy + 7
workflow-shape). `pnpm repo-audit` is 33/33 green. The full conductor gate
(`pnpm install && turbo run lint typecheck test --affected`) passed: 7/7
tasks, 284 test files / 5275 tests. The WO-39 measurement replay shows all
11 named slow-outlier PRs would now auto-merge. No failures.

## Criteria & evidence

### R2 / acceptance — six pinned policy cases (prd.md § Success criteria)

- Check: ran the real unit suite as a subprocess (`npx vitest run --config
scripts/vitest.config.mjs scripts/__tests__/dependabot-auto-merge-policy.test.mjs
scripts/__tests__/dependabot-auto-merge-workflow.test.mjs`).
- Evidence:
  ```
  ✓ scripts/__tests__/dependabot-auto-merge-workflow.test.mjs (7 tests) 8ms
  ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs (18 tests) 599ms

  Test Files  2 passed (2)
       Tests  25 passed (25)
  ```
  Confirmed by reading the test file directly: it contains exactly the six
  named cases (`actions/setup-node` minor → merge, `github/codeql-action/upload-sarif`
  patch → merge, `hadolint/hadolint-action` minor → manual w/ "third-party GitHub
  Action" reason, any `semver-major` → manual, `@types/node` patch under
  `dependencies` → merge, a production npm dep → manual) plus fail-closed
  cases (empty/unknown group, empty names, prefix mismatch) and npm-vs-non-npm
  reason wording.
- Result: PASS

### R1 — dependabot.yml grouping (architecture.md § 1)

- Check: read `.github/dependabot.yml` directly; confirmed by inspection
  against the file's own pattern comments.
- Evidence:
  ```
  official-actions: { patterns: ["actions/*", "github/*"] }   # github-actions ecosystem
  types:            { patterns: ["@types/*"] }, no dependency-type key  # npm ecosystem
  dev-deps patterns no longer include "@types/*"
  production-deps excludes "@types/*" (pre-existing)
  ```
  Each package name matches exactly one group: `@types/*` → `types` only
  (removed from `dev-deps`); `actions/*`/`github/*` → `official-actions`
  only; everything else falls through unchanged.
- Result: PASS

### R3 — workflow rewire (architecture.md § 3)

- Check: ran the workflow-shape test suite (above) and read
  `.github/workflows/dependabot-auto-merge.yml` directly.
- Evidence: the 7 workflow tests assert, against the parsed YAML: trigger
  stays `pull_request_target` with the dependabot actor gate; checkout has
  no `ref:` input; `fetch-metadata` keeps its pin and `id: metadata`;
  the `Decide` step reads `steps.metadata.outputs.*` only via `env:` (never
  inline `${{ }}` in `run:` text); `set -o pipefail` precedes the `jq`
  pipe; merge/comment steps branch on `steps.decide.outputs.action`; the
  comment posts the policy's `reason` and the workflow text no longer
  contains the old fixed "This is a production dependency update" sentence.
  All 7 pass (see Evidence above).
- Result: PASS

### R4 — security invariants (prd.md)

- Check: same workflow-shape tests plus direct read of the YAML's `on:`
  and job `if:`.
- Evidence:
  ```
  on: pull_request_target
  jobs.auto-merge.if: github.actor == 'dependabot[bot]'
  checkout step: no `ref:` key present (base ref only, per actions/checkout's
  pull_request_target default)
  ```
- Result: PASS

### R5 — measurement note (prd.md, WO-39)

- Check: replayed the 11 PR numbers idea.md names by name (the measured
  sample's own slow outliers) through `decideDependabotMerge`, using each
  PR's group/ecosystem/update-type as idea.md already categorizes them
  (official-action or `@types/*`, each described there as patch/minor —
  none flagged `semver-major`).
- Evidence:
  ```
  #5845  merge  official-actions group — actions/* or github/* owner
  #4785  merge  official-actions group — actions/* or github/* owner
  #6572  merge  official-actions group — actions/* or github/* owner
  #6573  merge  official-actions group — actions/* or github/* owner
  #6574  merge  official-actions group — actions/* or github/* owner
  #6575  merge  official-actions group — actions/* or github/* owner
  #4794  merge  types group — every dependency is @types/*
  #4795  merge  types group — every dependency is @types/*
  #5365  merge  types group — every dependency is @types/*
  #6070  merge  types group — every dependency is @types/*
  #6578  merge  types group — every dependency is @types/*
  ```
  All 11/11 named slow outliers — the entire measured p90 tail — would now
  auto-merge under the new policy.
- Result: PASS

### prd.md — `pnpm repo-audit` passes

- Check: ran `pnpm repo-audit` at the worktree root.
- Evidence:
  ```
  repo-audit summary: ... 33 of 33 checks passed
  ```
- Result: PASS

### prd.md — `pnpm lint && pnpm typecheck && pnpm test` for affected packages

- Check: ran `pnpm lint` and `pnpm test` directly in `scripts/` (the only
  affected package — `scripts/` has no `typecheck` script; it is a plain-JS
  workspace, consistent with gotchas.md's note that JS scripts sit outside
  `tsc` coverage), then ran the full conductor gate
  (`bash scripts/conductor-gate.sh`, which runs `pnpm install --prefer-offline`
  then `pnpm exec turbo run lint typecheck test --affected` repo-wide) as
  the authoritative check across every affected workspace package.
- Evidence:
  ```
  scripts lint: `eslint .` — no output, exit 0
  conductor gate: Tasks: 7 successful, 7 total; Cached: 5 cached, 7 total
  @mbe/scripts:test:  Test Files  284 passed (284)
  @mbe/scripts:test:       Tests  5275 passed (5275)
  ```
- Result: PASS

## Failures

None.

## Not verified

- **fetch-metadata v3.1.0 output names against the action's own README**
  (architecture.md assumption 3, breakdown.md WO-38 accept line). This
  verify stage's tool allowlist has no network/WebFetch access, so the
  pinned action's README could not be fetched live in this session. The
  names used (`package-ecosystem`, `dependency-group`, `update-type`,
  `dependency-names`) are unchanged from what Architect and Implement
  already assumed and match the action's commonly documented output set,
  but that is not the same as a live confirmation — flagged here rather
  than silently treated as checked. If this assumption is wrong, only the
  workflow's `env:` wiring (not the policy module or its tests) needs
  rework, per architecture.md's own fallback note.
- **Live `pull_request_target` execution against a real Dependabot PR.**
  No such PR exists to observe in this repo state; the workflow-shape
  tests verify the YAML's structure and security invariants statically,
  not an actual run. This is the normal limit of CI/workflow verification
  without a live trigger and is the same class of gap every other
  workflow-shape-tested change in this repo accepts.
- **The full 30-PR sample from #6650**, as opposed to the 11 named slow
  outliers. breakdown.md's own WO-39 line already records this narrowing
  (no `gh`/API access in the implementing session) and this verify session
  has the same constraint — the 11 replayed above are the entire
  slow-outlier set idea.md names by number, which is the portion of the
  sample the measurement cites as evidence the problem is real.
