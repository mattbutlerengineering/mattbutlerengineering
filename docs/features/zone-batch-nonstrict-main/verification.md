---
stage: verify
run: feature:zone-batch-nonstrict-main
date: 2026-10-18
assumptions:
  - "Verified against origin/main as of a1084d8fb (worktree docs/zone-batch-close), not the d1047723e tree in isolation: #6811 (1620b9073) later added shared-registry hotspot locks to the same selector, so 'today' for SC-1 is the pre-#6678 suite run against the current module."
  - "SC-1 'identical to today for every existing test' is shown by running the pre-#6678 test file (git show d1047723e^:scripts/__tests__/issue-zone.test.mjs) unmodified against the current module, as a throwaway copy deleted afterwards."
  - "SC-6 'pnpm lint / pnpm typecheck' graded on the full-repo turbo runs (not just @mbe/scripts), since that is what the PRD names."
  - "Replay source: only a Bash call that actually ran selectZoneSpreadBatch with probeMainStrictness counts as a batch composed by the new selection. In-progress label clusters (claims seconds apart from one session) are reported separately as a proxy and are not counted toward Operate's minimum."
  - "A merge commit 'Merge remote-tracking branch origin/main' on a PR branch counts as an update-branch-equivalent. Whether it resolved a textual conflict is not recorded anywhere I can read, so conflicts are graded not-shown, not zero."
  - "Replay uses the issues' current bodies and the current selector (including #6811 locks). A body edited after its claim could change the extracted paths; this was not checked per issue."
---

# Verification: Same-zone batching when `main` is not strict

## Summary

6 PRD criteria. **6 PASS, 0 FAIL.** The breakdown's acceptance criteria
are all covered by those six; WO-26's `check-adr` also passes. The live
`strict` flag reads **`false`**, so the relaxed mode is the one
running in production today. The fail-closed path works through the real
probe and selector: four kinds of failing `gh` all fell back to one issue
per zone.

The replay is thin. I found **exactly one** batch since ship that was
composed by `selectZoneSpreadBatch` + `probeMainStrictness`
(`strictMain: false`). It held **0** same-zone pairs. Every other
multi-issue claim I could trace came from sessions that hand-picked
issues and **never called the selector**. Same-zone batches composed by
the new rule: **0**, against Operate's minimum of 5. Details are in
§ Replay.

## Criteria & evidence

### SC-1: default unchanged (`strictMain: true` and omitted)

- Check: (a) ran the pre-#6678 `issue-zone.test.mjs` (60 tests, taken from
  `d1047723e^`) unmodified against the current module. (b) Checked that
  #6678 and #6811 only added lines to the test file. (c) Read the two
  explicit default-mode tests.
- Evidence:
  ```
  $ git show d1047723e^:scripts/__tests__/issue-zone.test.mjs > …/zz-verify-pre6678.test.mjs
  $ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/zz-verify-pre6678.test.mjs
   ✓ scripts/__tests__/zz-verify-pre6678.test.mjs (60 tests) 10ms
   Test Files  1 passed (1)
        Tests  60 passed (60)
  (temp file removed; git status --porcelain empty)

  $ git show d1047723e --numstat        → 88  0  scripts/__tests__/issue-zone.test.mjs
  $ git show 1620b9073 --numstat -- …   → 105 0  scripts/__tests__/issue-zone.test.mjs

  test("default (strictMain omitted) still defers same-zone issues")      → [1]
  test("strictMain: true defers same-zone issues even with disjoint paths") → [1]
  ```
- Result: PASS

### SC-2: three same-zone issues with disjoint paths form one batch (`strictMain: false`)

- Check: the unit test, plus the scratch script below, which goes through
  the real probe and the live API.
- Evidence:
  ```
  test("three disjoint same-zone issues batch together")
    selectZoneSpreadBatch([rialto(1,'…/a.ts'), rialto(2,'…/b.ts'), rialto(3,'…/c.ts')], { strictMain: false })
    expect(numbers(batch)).toEqual([1, 2, 3])          ✓ (in the 82-test run below)

  $ GH_MODE=real node …/zone-verify/failclosed.mjs     # three fix(rialto) issues, disjoint packages/rialto/src/fN.ts
  {"gh":"real","probe":{"strictMain":false},"batch":[1,2,3]}
  ```
- Result: PASS

### SC-3: overlapping or pathless same-zone pairs do not share a batch

- Check: unit tests for an identical path, ancestor/descendant paths, and
  pathless pairs. I also replayed it on real issues (§ Replay, cluster B).
- Evidence:
  ```
  "overlapping pair is deferred (identical path)"     → [1]
  "ancestor/descendant paths overlap (prefix-aware)"  → [1]
  "sibling names sharing a string prefix do not overlap" → [1, 2]
  "pathless same-zone issues never stack"             → [1]
  "global (null-zone) issues keep the single slot"    → [1]

  real replay, #6621/#6624/#6625 (all apps/hospitality), strictMain:false admits [6621]
  ```
- Result: PASS

### SC-4: an API error reading branch protection gives `strictMain: true` at the call site

- Check: (a) the classifier unit tests. (b) A scratch script that imports
  the real `probeMainStrictness` and `selectZoneSpreadBatch`, the same
  pair the compose hook in `.claude/implement-queue.md` uses, and is fed
  three disjoint same-zone issues. `gh` was swapped on `PATH` for shims
  that fail in four ways: exit 1 with an HTTP 503 message, HTML body,
  JSON with no `strict` field, and no `gh` at all.
- Evidence:
  ```
  ✓ scripts/__tests__/main-strictness.test.mjs (10 tests)
    "any error → strictMain true, even with a strict:false body"
    "non-JSON output → strictMain true"
    "missing strict field → strictMain true"
    "non-boolean strict value \"false\" | 0 | null | undefined → strictMain true"
    "empty, null, and non-string output → strictMain true"

  $ node failclosed.mjs                               (real gh)
  {"gh":"real","probe":{"strictMain":false},"batch":[1,2,3]}
  $ PATH=bin-fail:…     node failclosed.mjs           (gh: "HTTP 503: upstream unavailable", exit 1)
  {"gh":"fail","probe":{"strictMain":true},"batch":[1]}
  $ PATH=bin-garbage:…  node failclosed.mjs           (gh: "<html>rate limited</html>", exit 0)
  {"gh":"garbage","probe":{"strictMain":true},"batch":[1]}
  $ PATH=bin-nofield:…  node failclosed.mjs           (gh: {"contexts":["CI Gate"]}, exit 0)
  {"gh":"nofield","probe":{"strictMain":true},"batch":[1]}
  $ PATH=/usr/bin:/bin  node failclosed.mjs           (no gh on PATH)
  {"gh":"gh-absent","probe":{"strictMain":true},"batch":[1]}
  ```
- Result: PASS

### SC-5: ADR-027 exists and is indexed; ADR-023 amended with its Decision section byte-identical

- Check: the README index rows, ADR-023's whole diff since before #6661,
  and `check-adr`.
- Evidence:

  ```
  docs/adr/README.md:31 | [ADR-023](…) | Zone-Spread Merge-Train Batch Composition | amended (by ADR-027) | 2026-07-11 |
  docs/adr/README.md:35 | [ADR-027](…) | Same-Zone Batching Under Non-Strict Main   | active               | 2026-10-14 |

  $ git diff 14c71bc53^ HEAD -- docs/adr/ADR-023-merge-train-batch-composition.md
  @@ -2,11 +2,14 @@
   status: active
  +amended_by: ADR-027
  …
  +> **Amended by [ADR-027](…)**, which relaxes the one-issue-per-zone rule below — …
  (no other hunks — Decision section untouched)

  $ node tools/cli/dist/index.js check-adr
  Checking codebase against 1 active ADRs...
  ✅ No architectural violations detected.
  ```

- Result: PASS. ADR-023's frontmatter still says `status: active` and adds
  `amended_by: ADR-027`, while the README row says "amended (by
  ADR-027)". ADR-027 is `active`, but the plan said `provisional`. These
  are cosmetic and handed to Review.

### SC-6: gates green

- Check: the three affected suites, `pnpm lint` and `pnpm typecheck` at the
  repo root (turbo, all 52 tasks), and `eslint` on `@mbe/scripts`.
- Evidence:

  ```
  $ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/issue-zone.test.mjs \
      scripts/__tests__/zone-vocabulary.test.mjs scripts/__tests__/main-strictness.test.mjs
   ✓ scripts/__tests__/zone-vocabulary.test.mjs (12 tests) 10ms
   ✓ scripts/__tests__/main-strictness.test.mjs (10 tests) 4ms
   ✓ scripts/__tests__/issue-zone.test.mjs (82 tests) 11ms
   Test Files  3 passed (3)
        Tests  104 passed (104)

  $ pnpm lint        →  Tasks: 52 successful, 52 total   lint-exit=0
  $ pnpm typecheck   →  Tasks: 52 successful, 52 total   tc-exit=0
  $ pnpm --dir scripts lint  → eslint . (exit 0)
  ```

- Result: PASS

### Breakdown acceptance criteria not already covered above

- WO-29 "docs name `main-strictness.mjs` and ADR-027 consistently":
  `.claude/implement-queue.md:42` reads "(ADR-023, amended by ADR-027)",
  and `:44`, `:48` and `:52` name `scripts/main-strictness.mjs`. The
  gotchas § CI bullet now says "one-issue-per-zone is the strict (and
  fail-closed) mode; spread-with-disjoint-scopes is the
  measured-non-strict mode (ADR-027, amending ADR-023).
  `scripts/main-strictness.mjs` re-probes it every iteration…". PASS.
  One sentence at `implement-queue.md:42` is stale: it still states "Same-zone stacking
  incurs an N² `update-branch`/CI re-run tax against `strict` main
  (ADR-016)" as an unconditional premise. Handed to Review.

## Live `strict` value

```
$ date -u +%FT%TZ
2026-10-19T00:50:37Z
$ gh api repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks
{"url":"https://api.github.com/repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks","strict":false,"contexts":["CI Gate"],"contexts_url":"…/contexts","checks":[{"context":"CI Gate","app_id":null}]}
$ node scripts/main-strictness.mjs
{"strictMain":false}
```

## Replay of real implement-queue batches since 2026-10-15T05:37:59Z

**Sources I checked:**

- `metrics/queue-telemetry.jsonl`: 123 rows claimed after ship. It is
  **unreliable for batching**. It has no batch id, and its `claimed_at`
  is the PR's `createdAt`
  (`scripts/collect-queue-telemetry-from-github.mjs:82: claimed_at: pr.createdAt`).
  It is also mostly a backfill: `.claude/improvement-loop/log.md:3779`
  says no queue-worker row with real tokens has landed since
  2026-10-15T00:17:42Z.
- Conductor ledgers (`docs/factory/batches/*`) all predate ship.
- **Reliable source:** local session transcripts under
  `~/.claude/projects/-Users-mbutler-github-mattbutlerengineering*`. A
  batch counts only where a Bash call actually ran `selectZoneSpreadBatch`
  with `probeMainStrictness`. I paired these with GitHub issue timelines
  (`labeled in-progress` events) and the merged PRs' file and commit
  lists, all read through REST GET only.
- Cloud routines (`mbe-feature-drain`, `mbe-swarm`, etc.) leave no local
  transcript. Their batches are **not visible** to this replay.

**Batches composed by the new selection: 1.**

| Batch (claim time)                                                       | Issues              | Estimated zones                                   | Same-zone pairs | Update-branch / conflict                                                                    |
| ------------------------------------------------------------------------ | ------------------- | ------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| H, 2026-10-17T02:47:25Z (session `f828642f`, output `strictMain: false`) | #6901, #6903, #6905 | `null`, `services/reservations`, `services/agent` | 0               | n/a. PRs #6963, #6958 and #6959 have no merge-from-main commits and `rework_cycles` 0, 0, 0 |

The compose output, quoted from the transcript:

```
independent: #6901 #6903 #6905 #6906 #6907 #6908 #6911 #6917 #6919 #6921 #6930 #6953
strictMain: false
BATCH #6901 [Feature] shipped-stories [3/8]: generator CLI over gh api REST + first committed snapshot
BATCH #6903 [Feature] guest-change-booking [1/7]: moveReservationToHold service — atomic hold-backed move
BATCH #6905 [Feature] gen-point-and-refine [2/9]: subtree-scoped target mode on POST /api/gen/ui
```

**Same-zone batches composed by the new rule: 0.** This is the count for
Operate's 5-batch minimum.

**Proxy: hand-dispatched claim clusters.** These were claimed seconds
apart by one session (`810b6432`, `b9d9e4db`, `86a4b88b`). None of those
sessions called the selector:
`grep -c selectZoneSpreadBatch` → 0 and `grep -c main-strictness` → 0 in
each. I replayed each cluster through the real selector to see what the
rule would have done. They are **not** counted toward Operate.

| Cluster        | Issues (estimated zone)                                            | Selector `strictMain:false` would admit | Files the same-zone PRs actually shared                                                                                                                                                     | Merge-from-main commits on PR branches             |
| -------------- | ------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A 10-15T17:54Z | 6617 (rialto), 6618 + 6699 (hospitality), 6694 (root), 6665 (null) | 6617, 6618, 6694, 6665                  | 6618/6699: none                                                                                                                                                                             | 6617's PR #6724: 1                                 |
| B 10-15T18:07Z | 6621, 6624, 6625 (all hospitality, localization)                   | **6621 only**                           | every pair shared `apps/hospitality/src/i18n/catalogs/{en-US,es-MX,fr-CA}.json`, `eslint.config.js`, `docs/features/localization/breakdown.md`; 6624/6625 also shared the `llms*.txt` files | **6**: #6727 ×2, #6728 ×1, #6730 ×3 (rework 4/2/5) |
| C 10-15T21:38Z | 6628, 6620 (hospitality)                                           | **both** (strict would admit only 6628) | `docs/features/localization/breakdown.md` (run bookkeeping, not in either issue's file list)                                                                                                | 0. #6738 merged 22:02:05Z, #6739 22:05:37Z         |
| D 10-15T22:06Z | 6629, 6737 (hospitality)                                           | 6629 only                               | `apps/hospitality/e2e/locale-sweep.spec.ts`                                                                                                                                                 | #6741: 1                                           |
| F 10-16T03:41Z | 6768 (null), 6771 + 6772 (services/reservations)                   | 6768, 6771                              | `llms-full.txt`, `services/reservations/llms-full.txt` (generated)                                                                                                                          | 0                                                  |
| G 10-16T03:44Z | 6776, 6777, 6779 (root), 6778 (null)                               | 6776 only                               | 6776/6777: `CLAUDE.md`; other pairs none                                                                                                                                                    | 0                                                  |

Clusters E, I and J had no same-zone pair.

What the proxy shows:

1. Most of the parallel work since ship **bypassed the compose hook**, so
   the new rule has barely run. Only one recorded compose call exists.
2. The selector would have deferred all three of the hazard cases (B, D
   and G), where same-zone PRs really did collide on files. Cluster B is
   the localization case the feature was built for. Hand-batched, it cost
   six merge-from-main commits and 11 rework cycles. That fits the PRD's
   "fail toward deferral" requirement on real data.
3. Cluster C is the one case where non-strict mode would change the
   batch. Its only shared file was run bookkeeping that no issue lists,
   and neither PR needed a merge from main.
4. Two kinds of overlap are invisible to extraction from issue text:
   generated `llms*.txt` files and shared run docs such as
   `docs/features/<run>/breakdown.md`. Handed to Review/Operate. It was
   harmless in F and C here.

## Failures

None.

## Not verified

- **Conflicts:** no source records whether a merge from main resolved a
  textual conflict, so the conflict count is **not shown** (not zero).
- **Cloud-routine batches:** `mbe-feature-drain`, `mbe-swarm` and the
  cloud `implement-queue` routines left no local transcript. Any batch
  they composed is outside this replay.
- **Same-zone batches under the new rule in production: NOT SHOWN.**
  There were 0 found, against Operate's minimum of 5. The rule is live,
  but it has not yet run on a same-zone backlog through the selector.
- **Issue bodies at claim time:** the replay used current bodies, and
  edits made after a claim were not checked.
- **Stale-base merge risk** (ADR-027's mitigation via push CI and
  `revert-watchdog`) was not exercised. No same-zone batch from the
  selector reached the merge train.
