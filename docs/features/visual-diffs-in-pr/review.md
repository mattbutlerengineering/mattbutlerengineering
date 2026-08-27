---
stage: review
run: feature:visual-diffs-in-pr
date: 2026-08-25
verdict: SHIP-AFTER-F1
assumptions:
  - "Autorun: no live user input. The skill's step 5 hands severity arbitration to the user; every grade and every fix/defer call below is the reviewer's, recorded for the orchestrator to arbitrate. Nothing was fixed in this pass — the caller's standing instructions forbid repair, and no finding is a prose typo."
  - "Artifact filename: written as `review.md`, matching the pipeline protocol's table and all six prior runs in `docs/features/*/` and `docs/fixes/*/`. The Verify stage flagged the same brief/convention disagreement for `verification.md` and resolved it the same way."
  - "F1's failure scenario rests on GitHub's documented invariant that `github.run_id` is stable across re-runs while `github.run_attempt` increments. That half is not measured here — this repository has no multi-attempt workflow run in its recent history to read (`gh api .../actions/runs?per_page=100`, pages 1-3, returns zero runs with `run_attempt > 1`). Everything downstream of that invariant IS measured: the non-fast-forward rejection, and the commit-SHA non-determinism that guarantees it."
  - "SC-1, SC-3, SC-4, SC-5, SC-7 and SC-8 are undischarged and this stage did not attempt to discharge them — no pull request was opened, nothing was pushed to any remote, and no workflow was dispatched, per the caller's no-tracker/no-push instruction. The verdict below is about code fitness, not about criteria coverage."
---

# Review: Visual regression diffs inline in the pull request

## Scope

`git diff main...feat/visual-diffs-in-pr`, head `ed4b7fa1d`, base `62d80cebe` — 20 files, 8
commits, +6354/−3. No pull request exists for this branch.

Read in full: the four new modules (`scripts/visual-diff-report.mjs`,
`visual-diff-comment.mjs`, `visual-diff-refs.mjs`, `publish-visual-diffs.mjs`), all six new
test files, both fixtures, `.github/workflows/visual-diff-ref-sweep.yml`, and the
`rialto-web-e2e.yml` diff plus its surrounding job definitions. Read as contracts:
`prd.md` (SC-1..SC-8), `architecture.md` (2026-08-25 revision), `breakdown.md`,
`verification.md`.

Read as collateral, because the code makes claims about them:
`apps/rialto-web/playwright.config.ts`, `apps/rialto-web/e2e/visual.spec.ts`,
`playwright@1.62.1`'s `lib/matchers/expect.js`, `eslint.config.js`, and every file in
`.github/workflows/`.

Claims were verified by running things. Everything executed in this pass was read-only against
the repository or confined to `scratchpad/` sandboxes, with one exception: a probe pushed a ref
into the **local** `.git` (never to GitHub) and it was deleted immediately —
`git for-each-ref refs/heads/visual-diffs` is empty and `git status --porcelain` is clean.

## Findings

Ten findings: **0 critical · 1 high · 4 medium · 5 low.**

**No finding is critical.** F1 is the only one that defeats a success criterion, and it fails
loudly — the publisher job goes red and writes a summary line — rather than silently, and it
cannot damage `CI Gate`, the `visual` verdict, or the artifact. Nothing here writes outside the
`visual-diffs/` ref namespace, and nothing here can mislead a reviewer about whether a visual
regression exists.

---

### F1 — HIGH: the diff ref name omits `run_attempt`, so every re-run's push is rejected

- Where: `scripts/visual-diff-refs.mjs:51-53` (`buildRefName`), consumed at
  `scripts/publish-visual-diffs.mjs:380-387`.
- Contract decayed: `architecture.md:407-411` — _"Retry: **safe.** The ref name contains this
  run's id, so a retry can only re-push our own commit — the second push is a no-op or a
  fast-forward, never a conflict, never a lost update."_ That is false for a re-run. It is also
  the exact flow **SC-4** names (_"After the job is re-run on the same PR…"_) and that
  `breakdown.md` item 3.5 step 5 must demonstrate.
- Scenario: the `visual` job fails on PR #N in run `100`, attempt 1. The publisher builds an
  orphan commit and pushes it to `refs/heads/visual-diffs/pr-N/run-100`, and comments. Someone
  clicks **Re-run failed jobs**. GitHub keeps `GITHUB_RUN_ID=100` and sets
  `GITHUB_RUN_ATTEMPT=2`. `visual` fails again, the publisher builds a _new_ orphan commit — a
  different SHA, unavoidably, because `git commit-tree` stamps the current time — and
  `buildRefName` produces **the same ref name**. Pushing a parentless commit onto a ref that
  already points at a different commit is a non-fast-forward, and `--force` is (correctly)
  forbidden. `execFileSync` throws, `main()`'s catch writes `Publisher failed: …`, the job exits
  1, and **the comment is never updated** — it still carries `attempt=1` and attempt 1's images.
- Evidence — the rejection, reproduced in a sandbox:

  ```
  attempt1 sha=c0383758…  * [new branch] → visual-diffs/pr-1/run-100      PUSH1 OK
  attempt2 sha=2113b9f4…  ! [rejected]   → visual-diffs/pr-1/run-100 (non-fast-forward)
                          error: failed to push some refs                 PUSH2 EXIT=1
  ```

- Evidence — the SHA cannot be made to collide, so no "identical re-run" escape exists. Same
  tree, same message, same author/committer identity, two `commit-tree` calls one second apart:

  ```
  s1=2acf580c5ff1b03b0df14c03f1c941f5ba0a2c9d
  s2=c2ae39bb51a048dd33e2bb360f9b1489dab4c52e   same=NO
  ```

- The design already knows attempts recur under one run id — the comment marker is
  `run=<id> attempt=<n>` and `decideCommentAction` compares the full `[run_id, run_attempt]`
  tuple (`visual-diff-comment.mjs:243-246`). Only the ref name dropped the second element.
- Fix shape (**not applied**): put the attempt in the ref name. It is not a one-liner —
  `parseRefName` (`visual-diff-refs.mjs:43,78-83`) and `newestRunIdByPr`
  (`visual-diff-refs.mjs:113-121`, which keys on `Number(runId)` alone) both have to learn the
  second component, or the sweep will treat two attempts of one run as one ref. The
  trigger-safety and sweep tests key on `REF_PREFIX`, not the full shape, so they should not
  need touching.
- Also unexercised on this path, and **not measured here**: `actions/upload-artifact` v4+ has a
  documented same-name conflict on re-runs. If attempt 2's `rialto-web-visual-diffs` upload
  409s, that step is `if: failure()` with no `continue-on-error`, so it is a pre-existing
  property of the `visual` job rather than something this branch introduces — but the new
  report upload (`continue-on-error: true`) and the publisher's downloads would then be reading
  attempt 1's data. Item 3.5 step 5 should watch for this while it exercises SC-4.
- Decision: **fix before Ship.** SC-4 cannot be demonstrated with this in place.

---

### F2 — MEDIUM: the sweep reports deletions it did not perform, and exits 0

- Where: `scripts/visual-diff-refs.mjs:291-330`. `formatSweepSummary` renders
  `Deleting: <ref> (<reason>)` from `plan.toDelete` — the _intent_. `main()` prints that, then
  runs the deletions, prints each `result.outcome` to stdout only, and finally appends
  **the same plan-derived text** to `GITHUB_STEP_SUMMARY`. `deleteRef`'s `failed` outcome
  (`:287`) never reaches the summary and never affects the exit code.
- Scenario: the scheduled sweep's `git push --delete` starts failing — a token scope change, a
  ref protection rule, a transient GitHub error. The job is green, its summary asserts that N
  refs were deleted, and the refs are all still there. `visual-diffs/**` grows without bound
  and nothing says so. This is the repository's signature defect class (a green job that
  produced nothing), landing in the one component `breakdown.md` item 4.2 already records as
  impossible to exercise before merge.
- Evidence — the real `main()`, `DRY_RUN=false`, against a sandbox remote made unwritable, with
  `gh` stubbed to date the commit 30 days ago and report no open PRs:

  ```
  Deleting: visual-diffs/pr-777/run-100 (closed-pr)
  remote: error: cannot lock ref … Permission denied
   ! [remote rejected] visual-diffs/pr-777/run-100 (failed to update ref)
    visual-diffs/pr-777/run-100: failed — remote: error: cannot lock ref …
  SWEEP EXIT=0

  === what the job summary says ===
  Deleting: visual-diffs/pr-777/run-100 (closed-pr)

  === is the ref still there? ===
  91e17e5e…  refs/heads/visual-diffs/pr-777/run-100
  ```

- Not high: the blast radius is ref clutter, no success criterion depends on retention, and the
  detail _is_ in the raw step log. It is medium because the summary actively asserts something
  false and the exit code agrees with it.
- No test reaches `main()`, `deleteRef`, or the summary — `visual-diff-refs.test.mjs` covers
  `resolveDryRun` and the pure planner only.
- Decision: **defer, with a Ship follow-up.** `release.md` already owes a post-merge
  confirmation that the first scheduled sweep ran; that confirmation must read the step log,
  not the summary, until this is fixed.

---

### F3 — MEDIUM: the trigger-hygiene guard is blind to the unfiltered `on:` forms it exists to catch

- Where: `scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs:103-105` (the `on:` locator)
  and `:113` (`/^\s{2}push:\s*$/`).
- Contract decayed: `architecture.md:463-467` — _"a unit test that reads every workflow file and
  fails if any `push:` branch filter could match the `visual-diffs/` prefix."_
- Scenario: someone adds a workflow written `on: [push]` — no branch filter at all, fires for
  every branch in the repository, including every `visual-diffs/pr-N/run-M` this feature
  creates. The guard returns zero violations, CI is green, and each failing visual run now
  starts a workflow storm. The parser only ever finds a `push:` key written as a block mapping
  at exactly two spaces under a block-style `on:`.
- Evidence — `findTriggerViolations` (exported from the test file) fed each form:

  ```
  on: [push]             []
  on: push (scalar)      []
  quoted "on":           []
  4-space push           []
  flow map push          []
  control: push/branches ['**']   ["x.yml: `push.branches` [**] matches visual-diffs/pr-4567/run-32873184619"]
  ```

- The guard is **not** vacuous today — measured across all 71 workflow files, 13 contain a
  `push:` and the parser reaches all 13, and the test's own non-vacuity case
  (`:173-183`, stripping `branches: [main]` out of the real `rialto-web-e2e.yml`) genuinely
  goes red. The gap is latent, for a workflow nobody has written yet, which is why this is
  medium and not high. It is also the shape the repo files under "guards that never fire".
- Note `dependabot-auto-merge.yml` already uses an inline `on:` form (it has no `push:`, so no
  violation) — the form is not hypothetical in this repo.
- Decision: **defer.** Fix is contained (parse the `on:` value's flow-sequence and scalar forms;
  treat a bare `push` with no filter as a violation) but it is a test change, not a prose typo.

---

### F4 — MEDIUM: the standing-comment lookup trusts any author, so anyone can suppress the feature on a PR

- Where: `scripts/publish-visual-diffs.mjs:291-307`. `findStandingComment` selects
  `.[] | select(.body | startswith("<!-- visual-diffs-in-pr run="))` across every comment on
  the pull request, with no author filter, and takes `ids[0]` — the _oldest_ match, since the
  issue-comments endpoint returns ascending by creation.
- Scenario, on a public repository: any GitHub user posts a PR comment whose first line is
  `<!-- visual-diffs-in-pr run=99999999999 attempt=1 -->`. Every subsequent run reads that as
  the standing comment, finds a strictly newer ordinal, and declines — on **both** branches,
  permanently. The feature is dead on that pull request and the only trace is a job-summary
  line in a job nothing depends on.
- Evidence:

  ```
  planted = '<!-- visual-diffs-in-pr run=99999999999 attempt=1 -->\nnothing to see here'
  realRun = { runId: '32873184619', runAttempt: '1' }
  visualFailed= true  -> skip
  visualFailed= false -> skip
  ```

- Second-order: even without a hostile ordinal, a planted marker comment created _before_ the
  first publisher run wins `ids[0]`, so the publisher would PATCH a third party's comment while
  its own comment (if any) stands alongside — SC-4's "exactly one such comment" broken by an
  outsider. Whether the `GITHUB_TOKEN` can actually edit another user's comment was **not
  tested** (doing so would have meant writing to a real PR); the suppression half above needs
  no such permission and is certain.
- Not high: no code execution, no data loss, self-healing the moment the planted comment is
  deleted, and the repository is effectively single-author today.
- Fix shape: filter the lookup on `.user.login == "github-actions[bot]"` (or
  `.user.type == "Bot"`), and prefer the newest match rather than the oldest.
- Decision: **defer** — a design call about which authors own the cell, not a repair.

---

### F5 — MEDIUM: `contents: write` runs the pull request's own copy of the publisher script

- Where: `.github/workflows/rialto-web-e2e.yml`, `publish-visual-diffs` job — job-level
  `permissions: contents: write` + `pull-requests: write`, a plain `actions/checkout` (this
  workflow does not set `persist-credentials: false`), then
  `node scripts/publish-visual-diffs.mjs`.
- This is `architecture.md:89-95`'s stated residual and `verification.md`'s Finding 4, and the
  decision is settled upstream. It is recorded here with one correction to how the mitigation
  is phrased in both places. The mitigation is _"the job runs no `pnpm install`, no build, and
  no test, so nothing in the PR's dependency tree executes."_ That bounds **dependency**
  execution. It does not bound **script** execution: the checkout is of the pull request's merge
  ref, so `scripts/publish-visual-diffs.mjs` as the pull request wrote it is what runs, verbatim,
  under a `contents: write` token. Anyone who can push a branch to this repository can therefore
  run arbitrary code with repository-write scope by editing that one file.
- Bounding facts that make this acceptable rather than alarming, all verified in the workflow
  source: forks are declined before any API call or push (`Decline on pull requests from forks`,
  gating every later step via `steps.fork-check.outputs.declined == 'false'`); the workflow's
  own `paths:` filter means the job only exists on PRs touching `apps/rialto-web/**`,
  `packages/rialto/src/**` or `infrastructure/worker/**`; `main` is protected by the required
  `CI Gate` check; and `scripts/` and `.github/` changes are visible in the diff.
- `architecture.md` rejects the standard mitigation (a second checkout pinned to
  `base.sha` for `scripts/`) with a real reason — a PR touching the publisher could then never
  exercise it. That trade is the design's to make.
- Decision: **defer — accepted risk**, recorded so it is not re-litigated as an oversight, and
  so the mitigation is not repeated in the shape that overstates it.

---

### F6 — LOW: the display cap has no binding assertion, and `scripts/` is outside every lint gate

- Where: `scripts/publish-visual-diffs.mjs:370`; the thinness suite at
  `scripts/__tests__/publish-visual-diffs.test.mjs:35-74`.
- This is `verification.md`'s Finding 2, still open. Confirmed by mutation rather than by
  reading: rewriting `selectDisplayed(changed, MAX_IMAGE_ROWS)` as `selectDisplayed(changed, 6)`
  leaves the file passing **33/33**. Ordering, budget, marker parsing and `--force` each have a
  grep that binds; the cap does not.
- What Verify did not check, and what makes it slightly worse than reported: the orphaned
  `MAX_IMAGE_ROWS` import would not be caught anywhere else either. `eslint.config.js:10-12`
  says so in its own comment — _"scripts/ is not part of any lint gate"_ — and `pnpm lint` is
  `turbo run lint` over workspace packages, which `scripts/` is not one of. All four new modules
  are unlinted.
- Fix shape: `expect(SRC).toContain("MAX_IMAGE_ROWS")` alongside the other seven greps. The
  lint-gate half is pre-existing and out of this run's scope — flagged, not touched.
- Decision: **defer.**

---

### F7 — LOW: the comment's image set and the published blob set are computed independently

- Where: `scripts/publish-visual-diffs.mjs:371` (`plannedImageFiles(...).filter(existsSync)`)
  versus `:390-398` (`renderComment` re-deriving its own cells from `changed`).
- Scenario: a record's image is planned but absent on disk. The blob is silently dropped from
  the commit while `imageCell` (`visual-diff-comment.mjs:99-103`) still emits an `<img>` for it,
  because it branches on the path being non-null, not on the file existing. Result: a 404 image
  in a live comment, breaking SC-3, with no note in the job summary. The `files.length === 0`
  early return catches total absence; a partial miss produces no signal at all.
- Why this is low and not medium: I could not construct a realistic trigger. Verified against
  `playwright@1.62.1`'s `lib/matchers/expect.js` that the two shapes which _look_ like triggers
  are already handled correctly — `handleMissing` (`:12472-12492`) writes no legacy expected
  image and the parser sets `expectedPath: null` for `missing-baseline`, and `handleDifferent`
  (`:12494-12516`) writes `legacyExpectedPath` whenever `expected !== undefined`, which includes
  the size-mismatch path. Confirmed on disk: all 49 `test-results/*/` directories from the local
  run carry `-actual`, `-diff` **and** `-expected` PNGs. So the divergence is structural rather
  than currently reachable.
- Decision: **defer.**

---

### F8 — LOW: a comment write that fails after a successful push can strand the standing comment

- Where: `scripts/publish-visual-diffs.mjs:380-402` — the push happens before
  `decideCommentAction` and before `executeVerb`.
- Scenario: run 200 pushes `run-200`, then the PATCH fails twice (it is retried once) and the
  job dies. The standing comment still points at run 100's commit, but `newestRunIdByPr`
  (`visual-diff-refs.mjs:113-121`) now sees 200 as the newest ref for that PR, so 100 is
  classified `superseded-on-open-pr` and deleted after 24 h — the comment's images 404. That is
  the one invariant `architecture.md:171` says nothing else may enforce: _"a commit referenced
  by a standing comment is always reachable."_
- Narrow: it needs a failed comment write, which also reds the job. Every other interleaving I
  worked through preserves the invariant, including the `skip`-after-push case (a strictly newer
  standing ordinal implies a strictly newer ref exists, so the newest-kept ref is the one the
  comment names).
- Decision: **defer.**

---

### F9 — LOW: pull-request-authored snapshot names reach the comment body and the blob names unescaped

- Where: `visual-diff-comment.mjs:107` (`### ${rec.name} …`), `:76-78` + `:101` (`blobName` into
  the raw URL), and `publish-visual-diffs.mjs:179` (the same string as a git tree entry name via
  `--cacheinfo`).
- Snapshot names come from `apps/rialto-web/e2e/visual.spec.ts`, which a pull request controls,
  and nothing escapes or validates them. The exposure is markdown/HTML confusion in the rendered
  comment and odd tree entry names, not injection: every shell-out is `execFileSync` with an
  argv array, `blobName` flattens any `/`, and GitHub sanitizes comment HTML.
- Verified the sanitizer keeps the intended output — the real fixture body rendered through
  `POST /markdown` yields 6 tables and 16 surviving `<img src=… width="250">` tags, with GitHub
  adding only its own `style="max-width: 100%"`.
- Ranked low because F5 already establishes that a pull-request author here can run arbitrary
  code under a stronger token; a malformed heading is not the interesting attack.
- Decision: **defer.**

---

### F10 — LOW: the staleness guard is bypassed when _our own_ ordinal is unreadable

- Where: `visual-diff-comment.mjs:292-299` — `if (standingOrdinal === null || ours === null)`
  returns `patch` on failure regardless of what the standing marker says.
- Scenario: `GITHUB_RUN_ID` or `GITHUB_RUN_ATTEMPT` is unset, so `toOrdinal(runOrdinal)` returns
  null, and this run patches a comment a strictly newer run owns. Evidence:
  `decideCommentAction({ existingBody: '<!-- … run=99999999999 attempt=1 -->', runOrdinal: { runId: undefined, runAttempt: undefined }, visualFailed: true })`
  → `"patch"`.
- Unreachable in GitHub Actions, where both variables are always set, and the resolution
  direction (`patch` on failure, `skip` on success) is the same recoverable-wrong-answer rule
  the design states for the standing-side unparsable case. Recorded for completeness.
- Decision: **defer.**

## Passes with no findings

**Correctness of the parse path.** The `-expected` trap is handled exactly as
`architecture.md:217-226` specifies and I re-derived the trap from the fixture rather than
trusting the note: the `-expected` attachment's `path` really does point at
`e2e/screenshots/…`, and `buildRecord` derives the in-artifact baseline from the `-actual`
attachment instead. Retry selection reads the highest-`retry` entry and drops
failed-then-passed specs. ANSI stripping, `pixels: null`, and the three `reason` values behave
as contracted. The `total` denominator is genuinely derived — and genuinely correct: the suite is
49 `test()` invocations (38 + 9 from two loops, plus 2 standalone) producing 49 committed
baselines, one snapshot per spec under a single `chromium` project, so spec count and snapshot
count coincide and `unchanged` cannot go negative.

**`parseMaxDiffPixels`.** Comment stripping is string- and template-aware, the "more than one",
"live ratio alongside", and "no match" cases all return `null` rather than a fallback, and the
live config still parses to `300`.

**The ordinal comparison at the `≥` boundary.** `atLeastAsNew` compares numerically, tuple-wise,
and the equal-ordinal case is covered by a dedicated test that a `>` implementation would fail.
All eight cells of the `decideCommentAction` table have a test, read from the table.

**`budget: null` rendering.** Both states render from one fixture; the null state drops the
clause from headings _and_ overflow lines, states the reason in the footer, and substitutes
nothing. `grep -n "300" scripts/visual-diff-comment.mjs` is empty.

**Ref-deletion verdicts.** The epoch defect Implement found is fixed and the fix is real:
`ageHours` accepts only a non-empty string, and `null` — the value `commitDate()` actually
returns on a 404 — retains as `undated`. An unparsable ref name is never selected. Clause 1
outranks the age floor, which is the clause that protects SC-3.

**Injection and shell safety.** Every shell-out in all four modules is `execFileSync` with an
argv array; there is no `execSync`, no shell string. Both new `run:` blocks take untrusted
values through `env:` indirection (`HEAD_REPO`, `THIS_REPO`, `PR_NUMBER`, `VISUAL_OUTCOME`)
rather than interpolating `${{ }}` into the script body — the correct pattern, applied
consistently. `set -o pipefail` opens every exit-code-bearing `run:` block this branch adds.
Every `uses:` in both workflows is pinned to a 40-character SHA.

**Mechanisms verified rather than assumed**, because each is a silent-failure candidate:

| claim                                                                           | how it was checked                                                                     | result                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `gh api -F body=@file` sends raw text, not base64                               | `POST /markdown` with a real body file                                                 | renders as markdown ✓                              |
| a SHA-addressed `raw.githubusercontent.com` URL serves unauthenticated          | `curl` against a real commit, `dig @1.1.1.1` cross-checked per the LAN-sinkhole gotcha | `200`, `text/plain` ✓                              |
| an orphan commit pushes from a `fetch-depth: 1` checkout                        | shallow clone → `commit-tree` → push                                                   | `* [new branch]`, exit 0 ✓                         |
| `git ls-remote --heads origin 'refs/heads/visual-diffs/*'` matches a nested ref | sandbox remote                                                                         | matches ✓                                          |
| the sweep's `DRY_RUN` ternary is live on a schedule                             | expression traced across all three events                                              | schedule → `'false'`, dispatch honours its input ✓ |
| artifact upload/download path arithmetic reaches `artifactFilePath`             | traced `apps/rialto-web/e2e/test-results/` → artifact root → `visual-diffs/`           | consistent ✓                                       |

**Gates.** All six new test files green — 186/186 in 671 ms. `prettier --check` clean across
every new and modified file. Working tree clean at the end of this pass.

## Verdict

**Fit to ship as a prepare-and-stop PR once F1 is fixed.**

The design is faithfully implemented — the parse contracts, the ordinal table, the budget
hand-off, the retention clauses and the trigger-hygiene argument all match `architecture.md`,
and the pure modules are tested to a standard well above this repo's norm. The failure paths
that usually rot (unparsable marker, missing baseline, `budget: null`, undatable ref) are the
ones handled most carefully.

F1 is the one thing that must not reach the demonstration PR: item 3.5 step 5 _is_ a re-run, so
SC-4 would fail the first time it is exercised, and the fix touches three functions rather than
one. Everything else can go to Ship as recorded deferrals.

Two things the code cannot fix and Ship must carry. First, F2 means the post-merge sweep
confirmation `release.md` already owes has to be read from the step log rather than the job
summary — the summary is not evidence. Second, SC-1, SC-3, SC-4, SC-5, SC-7 and SC-8 remain
undischarged exactly as `verification.md` records; the delivery path has never executed end to
end, and no amount of review substitutes for the perturbed pull request item 3.5 describes.

## Second review pass — adversarial, orchestrator-dispatched

Recorded 2026-08-26, after the fact. The Review stage above ran as one
subagent producing this artifact. The autorun orchestrator **also** dispatched
a second, independent adversarial reviewer against the same diff, prompted to
find what was wrong rather than to confirm the work. Its findings drove five of
the nine fixes in the fix pass, but it returned only to the orchestrator's
transcript and was never written into this run directory — so for a day the
repo carried the fixes with no record of the reasoning that produced them.
The `retro.md` Operate stage caught the gap by refusing to restate an
unevidenced claim; this section closes it.

**Verdict:** `flag`, score **4/10** — "a single major functional defect caps
this at 4 under the rubric; the green gates and the strong mutation results are
why it is a 4 and not lower."

**Converged with this artifact on F1**, reached independently. Its reproduction
was its own — a scratch bare repo, plus a separate proof that two `commit-tree`
calls on a byte-identical tree one second apart yield different SHAs, closing
the "identical re-run" escape:

```
$ git push origin d970162...:refs/heads/visual-diffs/pr-1/run-999
 * [new branch]      d970162... -> visual-diffs/pr-1/run-999
$ git push origin 6984e4a...:refs/heads/visual-diffs/pr-1/run-999
 ! [rejected]        6984e4a... -> visual-diffs/pr-1/run-999 (non-fast-forward)
```

### Findings it contributed that this artifact did not have

- **The comment reported hard-failing specs as "unchanged."** `unchanged =
total - all.length` in `visual-diff-comment.mjs`; a spec that failed with no
  `-actual` attachment was absent from both counts. Reproduced against a
  3-spec report (one 579 px diff, one `net::ERR_CONNECTION_REFUSED`, one
  `Test timeout of 30000ms exceeded`) rendering `1 of 3 changed` /
  `2 of 3 snapshots unchanged`. It misinformed the exact reader PRD user story
  4 exists for. Fixed by splitting `parseVisualReport` into three buckets.
- **`planRefSweep` deleted the only ref of an open PR** when the run id was
  non-numeric: `newestRunIdByPr` stored `Number(runId)`, `parseRefName`'s regex
  admits `run-([0-9A-Za-z._-]+)`, and the keep-clause `NaN === NaN` is false.
  The same fail-unsafe direction as the epoch bug, one clause away from it.
  Fixed by rejecting a non-numeric ordinal in `parseRefName` (returns `null`,
  which retains).
- **Array-form snapshot names bypass Playwright's sanitiser.** String names go
  through `sanitizeFilePathBeforeExtension`; the `path.join(...name)` branch
  does not, so a raw `"` reaches the `<img src>` attribute and the blob name.
  Bounded, reported as hardening rather than a shipped vulnerability. Fixed
  with `codeSpan()` and `encodeURIComponent`.
- **One non-binding test** — the flake guard in `visual-diff-report.test.mjs`,
  the **only survivor of 23 mutations** it ran across the four modules. Stated
  as one soft spot in an otherwise strongly-binding suite, not a pattern.

### Where it corrected this artifact on evidence

This artifact's Finding F6 said the display cap has no binding assertion. The
adversarial pass measured `MAX_IMAGE_ROWS 6 -> 600` killing **5 tests** — so
the _constant_ is bound, and it is the call-site wiring in `main()` that is
not. The fix pass acted on the corrected reading.

### On `verification.md`

Its unprompted assessment, worth preserving: `verification.md` is "the most
honest artifact in the run — it declines to claim six of eight criteria and
says out loud that the delivery path has never executed."

## Next stage

Ship, writing `docs/features/visual-diffs-in-pr/release.md` — after F1 routes back to Implement.
