---
stage: verify
run: feature:visual-diffs-in-pr
date: 2026-08-25
assumptions:
  - "No live interview was available (autorun). Where this stage would have asked, it took its own recommendation and recorded it here."
  - "Artifact filename: the orchestrator's brief said `verify.md`; the pipeline protocol's table and all six prior runs in this repo (`docs/features/*/`, `docs/fixes/*/`) name this artifact `verification.md`. Written as `verification.md` so stage orientation resolves. Flagged to the caller rather than done silently."
  - "Verification ran entirely on this macOS host at `90edf9b7a`, branch `feat/visual-diffs-in-pr`. No pull request and no workflow run exists for this branch (`gh pr list --head feat/visual-diffs-in-pr --state all` -> `[]`, `gh run list --branch feat/visual-diffs-in-pr` -> `[]`), so nothing below is evidence about the `ubuntu-latest` runner or about a live PR."
  - "Falsifiability was proven by mutation: three separate sabotage passes (the epoch type-guard, a synthetic unscoped-push workflow, injected comparator/budget/force-push literals). Every mutation was reverted and the working tree confirmed byte-identical and `git status --porcelain` empty at the end."
---

# Verification: visual regression diffs inline in the pull request

## Summary

**8 criteria: 2 PASS, 6 CANNOT VERIFY LOCALLY, 0 FAIL.** Nothing routes back
to Implement.

The six undischarged criteria are not soft. Four of them (SC-1, SC-3, SC-4,
SC-5) require a real pull request carrying a genuinely failing `visual` job,
which `breakdown.md` § "What can and cannot be proven locally" already named as
undischargeable any other way. Two more (SC-7, SC-8) require observing a live
job conclusion and a live artifact list. Passing unit tests are not evidence
for any of the six, and none is claimed as such here.

What **was** proven, by running things rather than reading them: the pure
modules do what they say; the epoch defect Implement reported is real, fixed,
and its regression test genuinely goes red against the pre-fix logic; the
trigger-hygiene guard genuinely goes red when a real workflow gains an unscoped
`push:`; the thinness greps genuinely bind; and the one change to the existing
`visual` job — adding `--reporter=github,json` — is exit-code-neutral, measured
against a live Playwright invocation in both the passing and failing case.

Four findings are recorded. None is a criterion failure and none blocks review.

## Criteria verdicts

| SC   | Verdict                   | Basis                                                                                                                    |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SC-1 | **CANNOT VERIFY LOCALLY** | Requires a PR whose `visual` job fails. No PR exists for this branch; no run exists.                                     |
| SC-2 | **PASS**                  | Comment rendered from the captured report fixture; text alone carries changed-of-total, per-snapshot name, px vs budget. |
| SC-3 | **CANNOT VERIFY LOCALLY** | Requires published `raw.githubusercontent.com` URLs. No `visual-diffs/**` ref has ever been pushed.                      |
| SC-4 | **CANNOT VERIFY LOCALLY** | Requires two live runs against one PR. `decideCommentAction` is unit-covered; the upsert itself is not observed.         |
| SC-5 | **CANNOT VERIFY LOCALLY** | Requires a fail-then-pass sequence on one PR. The `delete` verb is unit-covered; the retraction is not observed.         |
| SC-6 | **PASS**                  | Rendered comment caps image rows at 6 and states the overflow count and the artifact by name.                            |
| SC-7 | **CANNOT VERIFY LOCALLY** | Two of three sub-claims measured (below); "CI Gate concludes on the PR" needs a live PR run.                             |
| SC-8 | **CANNOT VERIFY LOCALLY** | The upload step is byte-identical to `main` (proven), but an artifact list needs a live failing run.                     |

### SC-2 — PASS

`renderComment` fed the committed report fixture and the **live**
`apps/rialto-web/playwright.config.ts`, with every `<img>` stripped to show
what an agent reading `gh pr view --comments` gets without fetching anything:

```
total = 13 | changed = 12 | budget = 300
<!-- visual-diffs-in-pr run=32873184619 attempt=1 -->
## 🖼 Visual regression — 12 of 13 changed

### light-brand-new (missing-baseline)
### light-unparsable (pixel-diff)
### light-size-mismatch (91520 px over 300 budget)
### telemetry-game (5606 px over 300 budget)
### light-retry-persistent (4242 px over 300 budget)
### light-master-override-variants (2315 px over 300 budget)

**6 more changed snapshots** — images omitted; the full set is in the `rialto-web-visual-diffs` artifact on this run.

- `light-textarea-states` — 1826 px over 300 budget
- `light-card-variants` — 1200 px over 300 budget
- `light-table-default` — 839 px over 300 budget
- `light-dialog-open` — 680 px over 300 budget
- `light-drawer-open` — 680 px over 300 budget
- `light-button-variants` — 579 px over 300 budget

<sub>1 of 13 snapshots unchanged. Full baseline/actual/diff set: the <code>rialto-web-visual-diffs</code> artifact on this run.</sub>
```

Changed-of-total present; every changed snapshot named with its measured
difference against the budget, including the six the cap excluded from images.
The two records with no readable pixel count degrade to their reason rather
than printing `null px`.

### SC-6 — PASS

Same render. Twelve changed, six image rows shown (`MAX_IMAGE_ROWS = 6`), and
the overflow line states the count (`6 more changed snapshots`), that images
were omitted, and where the full set lives (`rialto-web-visual-diffs`). The
overflow snapshots still appear by name and difference, so SC-2 and SC-6 hold
together rather than trading off.

### SC-7 — two of three sub-claims measured

- **"the set of required checks on `main` is unchanged"** — measured live,
  read-only:

  ```
  gh api repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks
  {"strict":false,"contexts":["CI Gate"],"checks":[{"context":"CI Gate","app_id":null}]}
  ```

  This branch touches no branch-protection state and does not touch `ci.yml`
  (`git diff --name-only main..HEAD` carries no `ci.yml`).

- **"the `visual` job's own pass/fail verdict is unchanged"** — the only
  change to that job's test invocation is `--reporter=github,json` plus
  `PLAYWRIGHT_JSON_OUTPUT_FILE`. Measured against a live Playwright run
  (scratch config, one passing test then one failing test), pointing the
  output at a directory that did not exist:

  | suite   | baseline invocation | with `--reporter=github,json` |
  | ------- | ------------------- | ----------------------------- |
  | failing | `exit=1`            | `exit=1`                      |
  | passing | `exit=0`            | `exit=0`                      |

  The report was written to the non-existent nested path (Playwright creates
  it), and `config.configFile` was present in the emitted JSON as an absolute
  path — the field `resolvePlaywrightConfigPath` depends on. The new
  "Upload the JSON report" step carries `if: always()` and
  `continue-on-error: true`, so it cannot change the job conclusion either.

- **"`CI Gate` concludes on the PR exactly as it would"** — not observed.
  Structurally, `ci.yml`'s `ci-gate` job's `needs:` list contains no
  `rialto-web-e2e` job, so the new `publish-visual-diffs` job is not in
  `CI Gate`'s dependency graph. That is strong, but it is inference, not an
  observed conclusion on a pull request.

### SC-8 — the upload step is byte-identical, but no artifact was observed

```
git show main:.github/workflows/rialto-web-e2e.yml | grep -A6 "Upload diff artifacts on failure"   # vs the same on HEAD
>>> IDENTICAL (name, path, retention-days unchanged)
```

Name (`rialto-web-visual-diffs`), `path`
(`apps/rialto-web/e2e/test-results/`) and `retention-days: 14` are unchanged,
and nothing was inserted before it in the job. The evidence SC-8 actually asks
for is an artifact list on a failing run, which no laptop can produce.

## Gates

Node `v22.22.3`, pnpm `9.15.4`, `.nvmrc` = `22`. Verbatim final output:

### `pnpm lint` — PASS

```
 Tasks:    47 successful, 47 total
Cached:    0 cached, 47 total
  Time:    38.27s

EXIT=0
```

### `pnpm typecheck` — PASS

```
 Tasks:    48 successful, 48 total
Cached:    19 cached, 48 total
  Time:    21.896s

EXIT=0
```

### `pnpm test` at default concurrency — **FAILED**

```
 Tasks:    36 successful, 50 total
Cached:    19 cached, 50 total
  Time:    24.933s
Failed:    @mbe/service-bootstrap#test

 ERROR  run failed: command  exited (1)
 ELIFECYCLE  Test failed. See above for more details.
EXIT=1
```

### `pnpm exec turbo run test --concurrency=4` — PASS

```
 Tasks:    50 successful, 50 total
Cached:    0 cached, 50 total
  Time:    2m24.135s

EXIT=0
```

### The default-concurrency failure, checked rather than accepted

Implement reported this class in `@mattbutlerengineering/rialto` and
`@mbe/marketing`. **This stage saw a different package.** The failure here was
`@mbe/service-bootstrap`:

```
 ❯ src/feature-flags-boundary.test.ts (2 tests | 1 failed) 9828ms
     × has no consumer importing FeatureFlagMap, parseFeatureFlags, or isEnabled from the feature-flags module 9826ms
 FAIL  src/feature-flags-boundary.test.ts > feature-flags package boundary > has no consumer importing …
Error: Test timed out in 5000ms.
```

Checked, not assumed:

1. **The branch does not touch it.** `git diff --name-only main..HEAD` lists
   only `.github/workflows/` (2), `docs/features/visual-diffs-in-pr/` (5),
   `scripts/` (4 modules) and `scripts/__tests__/` (6 tests + 2 fixtures).
   Nothing under `packages/service-bootstrap`, `packages/rialto` or
   `apps/marketing`.
2. **It passes in isolation, fast.** `pnpm --dir packages/service-bootstrap test`
   -> `Test Files 11 passed (11) / Tests 157 passed (157)`, with the offending
   test at **828 ms** against a 5000 ms default timeout — a ~12x slowdown under
   full parallel load, not a logic failure.
3. **The test is load-sensitive by construction.** It walks the entire repo
   tree from `REPO_ROOT` reading every `.ts`/`.tsx` file. This branch adds no
   `.ts`/`.tsx` files at all (only `.mjs`, `.json`, `.txt`, `.md`, `.yml`), so
   it does not enlarge that walk.
4. **The suite goes green at reduced concurrency**: 50/50 at `--concurrency=4`.

This is the documented cold-cache/parallel-load timeout class in
`.claude/rules/gotchas.md` § CI (the `buildApp()` and `pnpm-lock.yaml`
cache-bust bullets), on a package this branch does not touch. Implement's claim
is **corroborated in class and remedy, but not in which package** — the
specific package varies run to run, which is itself consistent with a
load-dependent timeout rather than a fixed one. See Finding 1.

### Other CI-mirroring checks

| Check                                               | Result                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `node scripts/agent-core-build-freshness.mjs check` | `{"trusted":true,"state":"fresh",…}` — exit 0                         |
| `check-adr`                                         | `✅ No architectural violations detected.`                            |
| `check-deps`                                        | `✅ All external dependencies are consistent across the monorepo.`    |
| `pnpm regen --check`                                | `All generated artifacts are up to date.`                             |
| dep-graph drift                                     | clean                                                                 |
| `node scripts/check-orphaned-tests.mjs`             | `PASS: Every test file lives under a workspace package that CI runs.` |

`/local-ci-precheck` exists at `.claude/skills/local-ci-precheck/SKILL.md` but
is `disable-model-invocation: true`, so its lanes were run directly. All five
lanes are above.

### The new tests actually execute

The repo's own recurring failure class is work that ships having never run, so
this was checked rather than assumed. All six new test files appear in the
green `--concurrency=4` run, with their counts:

| file                                      | tests |
| ----------------------------------------- | ----- |
| `visual-diff-comment.test.mjs`            | 51    |
| `visual-diff-refs.test.mjs`               | 38    |
| `publish-visual-diffs.test.mjs`           | 33    |
| `visual-diff-report.test.mjs`             | 28    |
| `visual-diff-ref-sweep.test.mjs`          | 21    |
| `visual-diff-ref-trigger-safety.test.mjs` | 15    |

186 tests total, all under `turbo run test`, and `check-orphaned-tests` agrees.

## The six targeted checks

### 1. The epoch bug fix — REAL, and the regression test genuinely binds

The fix is present in `scripts/visual-diff-refs.mjs`:

```js
function ageHours(committedAt, now) {
  if (typeof committedAt !== "string" || committedAt.trim() === "") return null;
  const then = new Date(committedAt).getTime();
  if (!Number.isFinite(then)) return null;
  return (now.getTime() - then) / 3_600_000;
}
```

Coverage is `it.each([null, undefined, "", "   ", "not-a-date", 0, {}])` plus
an absent-key case — so falsy inputs are covered, not just `NaN`.

**Proven by mutation.** Deleting the type-guard line (restoring the pre-fix
logic) and re-running:

```
     × keeps a ref it cannot date (committedAt null) instead of reading it as ancient
     × keeps a ref it cannot date (committedAt +0) instead of reading it as ancient
 Test Files  1 failed (1)
      Tests  2 failed | 36 passed (38)
```

The file was restored and re-verified byte-identical; the suite returned to
`38 passed (38)`.

**Honest refinement of Implement's claim.** Of the nine falsy/edge cases, only
**two** are discriminating: `null` and `0`. `undefined`, `""` and `"   "` all
produce `NaN` under both the old and new logic, so they pass either way and are
documentation rather than regression coverage. This does not weaken the fix —
`null` is exactly what `commitDate()` returns when the GitHub commit lookup
404s, so the one case the live defect actually produced **is** the one that
goes red. `breakdown.md` already states this accurately ("Two of those nine
were red before the fix").

### 2. Thinness assertions — present, and they bind

Verified directly against `scripts/publish-visual-diffs.mjs`:

| forbidden                 | result             |
| ------------------------- | ------------------ |
| `.sort(`                  | ABSENT (0 matches) |
| `300`                     | ABSENT (0 matches) |
| `maxDiffPixel`            | ABSENT (0 matches) |
| `pixels (ratio`           | ABSENT (0 matches) |
| `-actual.png`             | ABSENT (0 matches) |
| `visual-diffs-in-pr run=` | ABSENT (0 matches) |
| `--force`                 | ABSENT (0 matches) |
| `execSync`                | ABSENT (0 matches) |

**Proven by mutation.** Injecting a comparator, a budget literal and a
force-push string into the module:

```
     × defines no comparator — ordering belongs to selectDisplayed
     × holds no pixel-budget literal
     × never force-pushes
 Test Files  1 failed (1)
      Tests  3 failed | 30 passed (33)
```

Restored byte-identical afterwards. See Finding 2 for the one part of the
stated thinness contract that is true in fact but not test-bound.

### 3. The `300` literal — absent

```
grep -n "300" scripts/visual-diff-comment.mjs
exit=1
```

Zero matches. The budget arrives as the `budget` parameter and the module
degrades to `N px changed` plus a footer note when it is `null`.

### 4. Trigger hygiene — the guard is non-vacuous

The test carries its own in-memory non-vacuity check. This stage proved it
against the **real directory scan** instead: adding
`.github/workflows/zz-vacuity-probe.yml` with `on: push: branches: ['**']`:

```
     × finds no trigger that could fire for a visual-diffs/ ref
 FAIL  … > finds no trigger that could fire for a visual-diffs/ ref
AssertionError: zz-vacuity-probe.yml: `push.branches` [**] matches visual-diffs/pr-4567/run-32873184619: expected [ Array(1) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
```

The probe file was removed and `git status --porcelain .github/workflows/`
confirmed empty. The related non-vacuity claim in
`visual-diff-ref-sweep.test.mjs` also holds: `branch-cleanup.yml:49` really
does carry the always-dry-run trap
(`DRY_RUN: ${{ github.event_name != 'workflow_dispatch' && 'true' || inputs.dry_run }}`),
so asserting the sweep does not reproduce it is a real comparison.

### 5. Workflow YAML — both parse; pipefail and SHA pinning correct

Parsed with `js-yaml`:

```
.github/workflows/rialto-web-e2e.yml -> PARSES OK
   jobs: visual, publish-visual-diffs, functional
.github/workflows/visual-diff-ref-sweep.yml -> PARSES OK
   jobs: sweep
```

Every multi-line `run:` block added by this branch opens with
`set -o pipefail` (the fork check, the publisher, the sweep). One
multi-line `run:` in the repo lacks it — the `functional` job's spec list —
but it is **pre-existing, untouched by this branch**, and contains no pipe at
all (the `\` are line continuations, not pipelines), so `pipefail` would be
inert there.

Every `uses:` in both workflows is pinned to a full 40-character commit SHA
(`actions/checkout`, `pnpm/action-setup`, `actions/setup-node`,
`actions/upload-artifact`, `actions/download-artifact`). No floating tags.

### 6. The commented-ratio fixture — still true, and the parser returns 300

```
23:      // maxDiffPixelRatio: 0.01 (~8.4k px budget) because most of the diff
28:      maxDiffPixels: 300,
```

Line 23 commented-out ratio, line 28 live `maxDiffPixels: 300` — exactly as
reported. Against the **live** config file:

```
parseMaxDiffPixels(real config) = 300
```

Comment-stripping is load-bearing as claimed: a comment-blind parse would see
a `maxDiffPixelRatio` key and correctly-but-uselessly return `null`.

The fixture `scripts/__tests__/fixtures/playwright-config-commented-ratio.txt`
is currently **byte-identical** to the live config (`diff` reports no
difference). See Finding 3.

## Findings

None blocks review.

### Finding 1 — the parallel-load timeout is real but the affected package drifts

`pnpm test` at default concurrency is not reliably green on this host, and the
package that tips over changes between runs (Implement saw rialto and
marketing; this stage saw service-bootstrap). The pattern is a repo-wide
condition, not a branch defect — but it means "run `pnpm test` and read the
result" is not a stable gate locally. The durable fix is the one the gotchas
file already prescribes for this class (`testTimeout: 15000` on the affected
package's `vitest.config.ts`), applied to
`packages/service-bootstrap` — whose `feature-flags-boundary.test.ts` walks
the whole repo tree and is structurally the slowest test in that package.
**Reported, not fixed:** it is outside this run's scope and touches a package
this branch has no business editing.

### Finding 2 — the display cap is thin in fact, but not test-bound

The stated thinness contract is that the publisher holds "no ordering, cap,
parse, staleness, or budget logic". Ordering, parse, staleness and budget each
have a binding grep assertion. **The cap does not.** The module is correct
today — it imports `MAX_IMAGE_ROWS` and calls
`selectDisplayed(changed, MAX_IMAGE_ROWS)` — but a future edit to
`selectDisplayed(changed, 6)` would pass every thinness test. A one-line
`expect(SRC).toContain("MAX_IMAGE_ROWS")` would close it. Reported rather than
fixed: adding a test assertion is a judgment call about the contract's shape,
not a typo.

### Finding 3 — nothing keeps the config fixture in sync with the live config

`visual-diff-report.test.mjs`'s load-bearing budget test reads `CONFIG_SOURCE`
from the **fixture**, while its comment makes a claim about
`apps/rialto-web/playwright.config.ts` ("carries a commented-out
`maxDiffPixelRatio: 0.01` … at line 23 and its only live setting …
at line 28"). Both files agree today — this stage confirmed byte-identity and
confirmed the parser returns `300` for each. But no test asserts they stay in
sync. If the live config later gains a project-level override or reinstates a
live ratio, `parseMaxDiffPixels` would start returning `null` in production
while the fixture test stays green asserting `300` forever.

The degradation direction is safe (`null` -> the comment drops the budget
clause and says so in its footer; it never prints a wrong number), which is why
this is a finding and not a defect. Closing it is one assertion comparing the
fixture to the live file — but that is a design choice (freeze the parse
behaviour vs. track the live config), so it is reported, not taken.

### Finding 4 — the acknowledged `contents: write` residual risk is real and correctly scoped

`architecture.md` lines 89-91 already state it: `publish-visual-diffs` runs on
`pull_request` with `contents: write` and persisted credentials, checking out
code the pull request itself may have edited — including
`scripts/publish-visual-diffs.mjs`, which is what runs under that token. The
mitigations are real and were verified in the workflow source: forks are
declined before any API call (`Decline on pull requests from forks`), and the
job runs no `pnpm install`, no build and no tests, so nothing in the PR's
dependency tree executes. That bounds the exposure to someone who can already
push a branch to this repo. Recorded here so Review sees it as a deliberate,
bounded acceptance rather than an oversight — no action requested.

## What remains genuinely unproven

Everything below needs a real pull request that carries an
`apps/rialto-web/**` change (this branch touches none, so it triggers **zero**
runs of the workflow it edits — `rialto-web-e2e.yml`'s `paths:` filter covers
only `apps/rialto-web/**`, `packages/rialto/src/**`,
`infrastructure/worker/**`) **and** a genuinely failing `visual` job:

- SC-1 — the comment exists on a failing PR at all.
- SC-3 — the `raw.githubusercontent.com` URLs return 200 with an image
  content type, unauthenticated. Nothing has ever been pushed to
  `refs/heads/visual-diffs/**` (`git ls-remote` returns empty), so the whole
  delivery mechanism is unexercised end to end.
- SC-4 — the re-run upsert leaves exactly one comment.
- SC-5 — a later passing run retracts the failure comment.
- SC-7 — `CI Gate`'s conclusion on that PR.
- SC-8 — the `rialto-web-visual-diffs` artifact list on that failing run.
- Breakdown items 1.3, 3.3 and 3.5 remain unchecked for exactly these
  reasons, and item 5.1 (the custom-namespace probe) is optional and untaken.
- The **scheduled** execution of `visual-diff-ref-sweep.yml` cannot be proven
  before merge at all — GitHub only schedules workflows from the default
  branch. The local dry-run is the pre-merge substitute and it runs clean
  (`Refs seen: 0`, `Eligible for deletion: 0`, exit 0) but proves only that
  the two shell-outs work; post-merge confirmation belongs in `release.md`.
- The `already-absent` branch of `deleteRef` is still unexercised against
  GitHub's HTTPS wording, as `breakdown.md` records.

## Verdict

**Ready for Review.** Gates are green (with the parallel-load caveat in
Finding 1 understood and shown to be branch-independent), the pure logic is
exercised and its guards are proven falsifiable by mutation, and the one change
to the existing `visual` job is measured to be verdict-neutral. The feature's
delivery path — push a ref, embed the images, upsert the comment — has never
run, and cannot until a demonstration PR with a real `apps/rialto-web/**`
perturbation exists. That is the single largest open risk and it is squarely a
Ship-time obligation, not something Verify could have closed.
