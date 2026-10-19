---
stage: verify
run: feature:package-consolidation
date: 2026-10-18
assumptions:
  - "Verified against origin/main at cc000687e (descendant of the final merge 47b422d4d; the only later commit is #7123, a docs re-point) in a detached worktree, not against the run branch."
  - "Production/deploy criterion is marked pending per the caller: see release.md."
  - "Per-item acceptance criteria are covered by the aggregate gates (lint/typecheck/test/regen/knip/greps) plus the per-PR CI Gate results; individual issue ACs were not re-walked one by one."
---

# Verification: Consolidate packages/ from 20 to 14

## Summary

8 PASS, 0 FAIL, 2 UNVERIFIED/pending (Docker image builds not runnable locally, cited from CI; production health pending release.md). The repo-wide `pnpm test` failed twice on cold-cache timeouts in unrelated suites; both pass when rerun alone. One design note: `ChatPanel`'s `stream` prop shipped as a required prop (see Findings).

## Criteria & evidence

### `ls packages | wc -l` prints 14

- Check: counted and listed packages on origin/main; checked the 7 removed names and the new one.
- Evidence:
  ```
  14
  agent-core api-client auth cancellation-policy config database gh-client rialto rialto-catalog rialto-plugin sentry service-bootstrap types ui-quality-capture
  (no EXISTS lines for mcp-server supply-chain-scanner agent-test-utils jobs notifications observability test-fixtures)
  packages/ui-quality-capture
  ```
- Result: PASS

### No references to the seven removed package names

- Check: the PRD's `git grep` with its exclusions.
- Evidence:
  ```
  packages/agent-core/src/__tests__/pr-risk-classifier.test.ts:291:    "packages/agent-test-utils/package.json",
  packages/agent-core/src/__tests__/pr-risk-classifier.test.ts:293:    "packages/jobs/package.json",
  ```
  Only the expected inert fixture strings.
- Result: PASS

### Rialto has no `@mbe/api-client` reference; dist has none

- Check: `git grep -n "@mbe/api-client" -- packages/rialto ':!CHANGELOG*'`; `pnpm build --filter @mattbutlerengineering/rialto`; `grep -R "@mbe/api-client" packages/rialto/dist | wc -l`.
- Evidence:
  ```
  (git grep: no matches outside CHANGELOG.md, which the exclusion pathspec does not cover for nested paths; the only hits were two historical CHANGELOG.md lines 220 and 272)
  Tasks: 1 successful, 1 total
  0
  ```
  Note: the `:!CHANGELOG*` pathspec only matches a root-level file, so two historical `packages/rialto/CHANGELOG.md` lines printed; no source, test, package.json or story hits.
- Result: PASS

### `pnpm lint && pnpm typecheck && pnpm test` pass

- Check: ran each repo-wide.
- Evidence:
  ```
  lint:      Tasks: 42 successful, 42 total   (0 errors, 148 warnings in hospitality)   exit 0
  typecheck: Tasks: 42 successful, 42 total   exit 0
  test run 1: Tasks: 38 successful, 44 total; Failed: @mbe/rialto-web#test
     src/data/page-registry.test.ts: "Error: Test timed out in 15000ms." (2 tests; whole file 31395ms under load)
     rerun alone: ✓ src/data/page-registry.test.ts (59 tests) 576ms   Tests 59 passed (59)
  test run 2: Tasks: 42 successful, 44 total; Failed: @mbe/scripts#test
     only scripts/__tests__/ui-quality-state-two-fire.test.mjs: "Error: Hook timed out in 10000ms." (git clone hooks)
     Test Files 1 failed | 304 passed (305)
     rerun alone: ✓ ui-quality-state-two-fire.test.mjs (19 tests) 5348ms
  ```
  Both failures are cold-cache/load timeouts in suites the consolidation does not touch semantically, and pass in isolation. Turbo stopped each run early, so a single clean full-repo `pnpm test` was not observed; every package ran green across the two runs plus the isolated reruns.
- Result: PASS (with the timeout caveat)

### `pnpm regen --check` clean

- Check: `pnpm build --filter @mbe/cli... && pnpm regen --check`.
- Evidence:
  ```
  Tasks: 5 successful, 5 total
  node scripts/regen.mjs "--check"
  All generated artifacts are up to date.     exit 0
  ```
- Result: PASS

### Guard scripts clean

- Check: knip, doc freshness, instruction rot, dep sync, changeset tree.
- Evidence:
  ```
  knip                      exit 0
  check-doc-freshness       No stale references found.
  detect-instruction-rot    ✓ No instruction rot detected.
  check-dep-sync            packages audited: 24 of 24 / matched: 24 / missing deps: 0 / ✅ Workspace dependency sync verified.
  check-changeset-tree      PASS: changeset tree validity (`changeset version` would not error)
  ```
- Result: PASS

### Docker builds for all 3 services (or the patches test as stand-in)

- Check: Docker daemon is not available locally, so no local image build. Ran the stand-in test and cited CI's container scans from #7122.
- Evidence:
  ```
  ✓ scripts/__tests__/dockerfile-pnpm-patches.test.mjs (4 tests)
  gh pr checks 7122:
  Container Security Scan (services/agent/Dockerfile, agent)              pass 20s
  Container Security Scan (services/reservations/Dockerfile, reservations) pass 24s
  Container Security Scan (services/users/Dockerfile, users)              pass 22s
  Container Security Scan (infrastructure/migrate/Dockerfile, migrate)    pass 22s
  ```
- Result: PASS (CI evidence for the image builds, not a local build)

### `CI Gate` green on every work-item PR before merge

- Check: `gh pr view <n>` rollup for the nine merged PRs I could map.
- Evidence:
  ```
  #7111 gate=SUCCESS  #7109 gate=SUCCESS  #7112 gate=SUCCESS  #7113 gate=SUCCESS  #7115 gate=SUCCESS
  #7116 gate=SUCCESS  #7119 gate=SUCCESS  #7120 gate=SUCCESS  #7122 gate=SUCCESS
  Issues #7098-#7106: all closed (completed)
  ```
  (Issues #7098–#7106 map to PRs #7111, #7109, #7112, #7113, #7115, #7116, #7119, #7120, #7122.)
- Result: PASS

### Rialto changeset is `minor`; public API only grows

- Check: changeset file on main, release PR contents.
- Evidence:
  ```
  .changeset/chatpanel-injected-stream.md: "@mattbutlerengineering/rialto": minor
  02dc74217 feat(rialto): ChatPanel takes an injected stream adapter ... (#7115)
  PR #7114 (OPEN, "chore: version packages", head a3c60485e): packages/rialto/CHANGELOG.md adds "## 0.8.0 ### Minor Changes - #7115 ... ChatPanel now takes a required `stream` prop"
  ```
  No export or prop was removed or renamed; `ChatStreamFn`/`ChatStreamRequest` were added. ChatPanel.tsx declares `stream: ChatStreamFn;` (required).
- Result: PASS under the PRD's own test ("no existing export or prop is removed or renamed"); see Findings.

### No behaviour change: `/health` and `/ready` tests pass; moved suites keep counts

- Check: ran the JWKS pinning test; full-suite tests green above.
- Evidence:
  ```
  ✓ src/auth0-jwks-checks.test.ts (16 tests)   Test Files 1 passed (1)   Tests 16 passed (16)
  ```
  Per-suite before/after test counts for each moved suite were not recomputed.
- Result: PASS for the /health and /ready pinning tests; the "moved suites keep their count" half is UNVERIFIED (see Not verified).

### Deploy API Services succeeds; health endpoints healthy; Sentry quiet

- Result: pending: see release.md (Deploy Services run 39200947778, checked by the orchestrator).

## Failures

none. The two `pnpm test` failures were cold-cache timeouts that pass alone; they are not verification failures of the consolidation.

## Findings

- `ChatPanel.stream` is a required prop, shipped in a `minor`. That satisfies the PRD wording and the architecture's recorded assumption, but it is a type-level break for any in-tree or registry caller that omits it. The architecture's documented fallback (optional, no default, throw if missing) remains open for the Owner.
- `:!CHANGELOG*` in the PRD's rialto grep does not exclude `packages/rialto/CHANGELOG.md`; use `':!**/CHANGELOG*'` next time.
- `pnpm test` is marginal under cold cache (rialto-web `page-registry` 15 s, scripts `ui-quality-state-two-fire` 10 s hook). Not caused by this run.

## Not verified

- Per-issue acceptance criteria (#7098–#7106) beyond the aggregate gates above and each PR's CI Gate.
- Per-suite test counts before and after each move (the "before + moved tests" rule).
- Local Docker image builds (no daemon); CI container scan jobs stand in.
- Production health and Sentry (pending: see release.md).
- #7114's merge or the npm publish of rialto 0.8.0 (the release PR is open and was only read).
