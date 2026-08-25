---
stage: decompose
run: feature:visual-diffs-in-pr
date: 2026-08-25
assumptions:
  - "Milestone boundaries and item sizing were chosen by this stage without the skill's review-the-cut step — the run is unattended and the brief pre-decided scope, delivery, comment shape, tracker policy, and release authorization, but not the cut lines."
  - "SC-1/SC-3/SC-4/SC-5 are discharged by a deliberately perturbed demonstration pull request (item 3.5) that is never merged, rather than by waiting for a visual failure to occur naturally. Taken as the recommended default: the repo has a documented failure class of work that shipped and closed COMPLETED without ever executing, and an opportunistic wait leaves these four criteria unverifiable on demand."
  - "No tracker interaction anywhere in this breakdown — no item carries a `(tracker: #N)` reference and no export step is offered. Directed by autorun-brief.md § Decisions already made."
  - "The `parseMaxDiffPixels` fixture is a point-in-time verbatim copy of `apps/rialto-web/playwright.config.ts` (commented-out `maxDiffPixelRatio: 0.01` at line 23, live `maxDiffPixels: 300` at line 28, re-measured 2026-08-25) and is deliberately never re-synced with that file: no acceptance criterion asserts the live config still reads 300, because that is precisely the drift test `architecture.md` § `parseMaxDiffPixels` rejects — it would red CI on the very PR that legitimately changes the budget. Consequence, accepted rather than hidden: if the live config later adopts a comment style the parser cannot strip, nothing goes red — the comment degrades to its budget-less form instead."
---

# Breakdown: Visual regression diffs inline in the pull request

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

> Source: `architecture.md` in this directory (**revised 2026-08-25**). This is
> a work breakdown, not a design pass: every mechanism named below is
> Architect's. The two contract-level gaps this stage found were routed back
> rather than designed around; Architect closed both in that revision, and
> **Design gaps found** below records each one together with the resolution
> that is now folded into the items.

## Standing rules for every item

- **TDD is the repo default.** Any item that adds logic starts with a failing
  test. The `scripts/__tests__/<name>.test.mjs` sibling is part of the item
  that adds `scripts/<name>.mjs`, never a follow-up item.
- **Gates before an item is checked off:** `pnpm lint`, `pnpm typecheck`,
  `pnpm test`. `/local-ci-precheck` runs the same set in parallel before a
  push.
- Stage by explicit path — never `git add -A` (the PostToolUse prettier hook
  leaves ~171 files dirty).
- Third-party actions stay pinned by full commit SHA. Reuse the existing pins:
  `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` (v8.0.1,
  from `preview-deploy.yml`), `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`.
- Any `run:` block whose exit code is the point opens with `set -o pipefail`.
- **Nothing here is merged, tagged, published, or deployed.** Release
  authorization is withheld (`autorun-brief.md`); Ship prepares and stops.

## Milestone 1: The visual run emits a machine-readable report, and we can parse it

**Demonstrable at the boundary:** a real Playwright JSON report from this
repo's own visual suite parses, at a terminal, into the exact list of changed
snapshots with their pixel counts and the in-artifact paths of all three
images — including the `-expected` trap handled correctly — and the same module
reads the suite's pixel budget out of the text of the config that report names.

- [x] **1.1 Capture a real JSON-report fixture** — run the rialto-web visual
      suite locally to produce a genuine Playwright `json` report and commit a
      trimmed copy under `scripts/__tests__/fixtures/`. A macOS local run fails
      against the Linux-CI baselines by construction (documented gotcha), which
      is exactly the failure material this needs.
  - Accept: fixture committed under `scripts/__tests__/fixtures/`; it contains
    at least one spec with `ok: false`, an `attachments[]` entry whose
    `-expected` `path` points at `e2e/screenshots/…` (the trap), a matching
    `-actual` and `-diff` attachment, and an `errors[].message` carrying the
    literal `N pixels (ratio …) are different.` string. Because
    `playwright.config.ts` sets `retries: 0` outside CI, a two-entry
    `results[]` retry pair (failed-then-passed, and failed-twice) is
    hand-synthesized into the fixture and labelled as such in a comment. The
    trimmed fixture **retains `config.configFile`** (present and absolute in a
    real 1.62.1 report) — item 3.2 resolves the Playwright config path from it,
    and a fixture that trimmed it away would make that path untestable.
  - Blocked by: —
  - Verified: **locally.**

- [x] **1.2 `scripts/visual-diff-report.mjs` — `parseVisualReport(report)` and
      `parseMaxDiffPixels(configSource)`** — the pure module that turns one
      Playwright JSON report into `{ total, changed[] }`, each changed record
      `{ name, pixels, reason, expectedPath, actualPath, diffPath }`, **and**
      reads the suite-wide pixel budget out of the _text_ of the Playwright
      config that same report names. Both are facts about Playwright's own
      formats, which is why the budget is parsed here and not in the comment
      module — the comment module is the one that must learn none.
  - Accept (`parseVisualReport`), all against the 1.1 fixture in
    `scripts/__tests__/visual-diff-report.test.mjs`:
    `total` is **derived from the report's spec count**, never hardcoded (SC-2's
    denominator cannot go stale); the returned baseline path is derived by
    suffix substitution on the **`-actual`** attachment and the test asserts it
    resolves inside `test-results/`, _not_ `e2e/screenshots/`; an ANSI-wrapped
    error message still yields the pixel count; an unparsable message yields
    `pixels: null` with no throw and no guessed number; only the highest-`retry`
    entry of a failing spec is read and a failed-then-passed spec is **absent**
    from `changed`; `reason` distinguishes `pixel-diff` / `size-mismatch` /
    `missing-baseline`; a report with a suite-level failure and zero changed
    snapshots returns `changed: []` rather than throwing.
  - Accept (`parseMaxDiffPixels`), in the same test file: the input is the
    config file's **text**, passed in as a string — the module opens nothing
    itself; the return is `number | null` and **never a fallback number**;
    `null` when no `maxDiffPixels` is present, when more than one is, and when
    a **live** `maxDiffPixelRatio` sits alongside one (the enforced budget is
    then the per-image `min(maxDiffPixels, w × h × ratio)`, which is not a
    single number a comment could name); never throws on malformed input.
  - **The comment-stripping fixture, and why it is the load-bearing case:** a
    fixture copied verbatim from `apps/rialto-web/playwright.config.ts` — which
    carries a commented-out `maxDiffPixelRatio: 0.01` inside the `//` prose
    block at line 23 and its only live setting, `maxDiffPixels: 300`, at line
    28 (re-measured 2026-08-25) — must return `300`. A comment-blind
    implementation returns `null` for that fixture, which would degrade every
    comment this feature ever posts, silently and forever. Commit the fixture
    as text (`scripts/__tests__/fixtures/playwright-config-commented-ratio.txt`),
    not as a real `.ts` config: the contract is a string, and a `.ts` fixture
    importing `@playwright/test` would drag lint and typecheck onto a fixture.
  - Deliberately **not** asserted: that the live config still reads `300` —
    that is the drift test `architecture.md` § `parseMaxDiffPixels` rejects
    (see frontmatter assumption 4).
  - Both functions pure — the module imports no `node:fs`,
    `node:child_process`, or gh client.
  - Blocked by: 1.1 (report fixture; the config-text fixture is captured here)
  - Verified: **locally.**

- [ ] **1.3 `visual` job emits and uploads the JSON report; workflow header
      comment corrected** — in `.github/workflows/rialto-web-e2e.yml`, add
      `--reporter=github,json` (github first, to preserve today's annotations)
      with `PLAYWRIGHT_JSON_OUTPUT_FILE` pointing **outside**
      `apps/rialto-web/e2e/test-results/`, plus one `continue-on-error: true`
      upload step publishing that report as its own small artifact.
  - Accept: the existing `rialto-web-visual-diffs` upload step is byte-identical
    in name, `path`, and `retention-days` (SC-8); the report upload cannot
    change the job's conclusion (SC-7); **the header comment's claim that the
    `visual` job's "invocation and artifact are unchanged from before" is
    updated in this same item** — the invocation half stops being true here and
    nowhere else; on a CI run of the feature branch both artifacts are present
    and the `visual` job's conclusion matches what the same commit would have
    produced before.
  - Blocked by: —
  - Verified: **live CI run** (an artifact list is not producible locally).
    Note the paths filter: `rialto-web-e2e.yml` triggers only on
    `apps/rialto-web/**`, `packages/rialto/src/**`, `infrastructure/worker/**`.
    A branch touching only `scripts/` and `.github/` produces **zero** runs of
    this workflow — this is expected, not a fault, and is why item 3.5's
    demonstration PR must carry a `apps/rialto-web/**` change.

## Milestone 2: The comment body exists as a computed artifact you can look at

**Demonstrable at the boundary:** the exact comment this feature will post can
be rendered from the real 1.1 fixture and previewed as GitHub markdown, before
any push, any workflow, or any PR exists. SC-2 and SC-6 are settled here, and
the PRD's parked legibility question (`width=250`, cap of 6) becomes an
eyeball-it-now question instead of a wait-for-Verify one.

- [x] **2.1 `scripts/visual-diff-comment.mjs` — `selectDisplayed(changed, cap)`
      and `MAX_IMAGE_ROWS`** — ordering and the display cap.
  - Accept: orders **descending by pixel count, `pixels: null` first, ties
    broken by snapshot name**, deterministic for a shuffled input; returns at
    most `cap`; `MAX_IMAGE_ROWS = 6` is an **exported constant** in the module
    (the shape `branch-cleanup.mjs` uses for `AGE_FLOOR_DAYS`), not an env var;
    a `changed` list shorter than the cap returns all of it; pure.
  - Blocked by: 1.2 (consumes its record shape)
  - Verified: **locally.**

- [x] **2.2 `renderComment(...)` — the full comment body** — marker, heading,
      capped image sections, exhaustive overflow text, footer. Its input
      contract gains **`budget: number | null`** (Gap 1's resolution): the
      number arrives from the caller and is never a literal in this module.
  - Accept: body's first line is exactly
    `<!-- visual-diffs-in-pr run=<run_id> attempt=<run_attempt> -->`; heading is
    `## 🖼 Visual regression — X of 49 changed` with both numbers from
    `parseVisualReport`; at most `MAX_IMAGE_ROWS` `### <name> (N px over
<budget> budget)` sections, `<budget>` being **the value the caller
    passed**, each a three-column baseline | actual | diff
    table whose `<img src>` are `raw.githubusercontent.com/<slug>/<sha>/<file>`
    at `width=250`, addressed by **commit SHA, never a ref name**; **every**
    changed snapshot beyond the cap still appears by name and pixel count in
    plain text, with an explicit "N more" count and the
    `rialto-web-visual-diffs` artifact named as where the full set lives (SC-6);
    a `<sub>` footer carries the unchanged count and the artifact name; a
    record with `pixels: null` renders its `reason` and never the string
    `null px`; **SC-2 is asserted directly** — a test renders with a numeric
    budget, reads the body as text only with no image fetched, and recovers the
    changed-of-total and every changed snapshot's name and pixel count _against
    the budget_; pure.
  - Accept, the budget specifically — **both states rendered from the same
    fixture**: with `budget: 300`, every heading and every overflow line carries
    the `over 300 budget` clause; with `budget: null`, every heading degrades to
    `### <name> (N px changed)`, the overflow lines drop the clause too, the
    footer states that the budget could not be read from the run's Playwright
    config, and **no default is substituted anywhere**. A **grep test asserts
    the literal `300` appears nowhere in `scripts/visual-diff-comment.mjs`** — a
    comment confidently asserting a budget it did not read would reproduce
    #4496, the incident this run exists because of, inside the fix for it.
  - Manual check that is part of this item: render the 1.1 fixture through the
    module, paste the output into a GitHub markdown preview, and record in
    **Notes** below whether 6 rows at `width=250` is legible for a 300-pixel
    budget. This is the PRD's parked legibility question, answered where it is
    cheapest to answer.
  - Blocked by: 2.1
  - Verified: **locally.**

- [x] **2.3 `decideCommentAction({ existingBody, runOrdinal, visualFailed })`**
      — the single staleness guard over **every** write to the one shared cell,
      deletion included (Gap 2's resolution; replaces the draft's
      `shouldReplaceComment`, renamed because a predicate consulted by both
      branches must not be named after one of them).
  - Accept: returns a **verb** — `"post" | "patch" | "delete" | "skip"` — never
    a boolean, so the thin caller executes rather than decides; reproduces
    `architecture.md` § `decideCommentAction`'s **8-cell table** (4
    standing-comment states — absent / ordinal ≤ ours / ordinal strictly newer
    / marker present but ordinal unparsable — × 2 outcomes, `visual` failed and
    `visual` passed), **one test case per cell, read from that table rather
    than re-derived**, with the two easily-inverted cells called out by name:
    `absent + passed → skip` (nothing to clear, not a post) and
    `unparsable + passed → skip` while `unparsable + failed → patch` — the one
    deliberate asymmetry, because a wrong patch leaves visible stale content
    the next run repairs while a wrong delete leaves a live failure with no
    comment at all.
  - Accept, the ordinal rule: ordinals compare **lexicographically on
    `[run_id, run_attempt]`**, and a run may act iff its own ordinal is **≥**
    the standing marker's — it declines only on a strictly newer marker. A
    dedicated equal-ordinal case asserts the `≥` (a `>` implementation would
    stop a re-executed publisher step from correcting its own comment, and is
    caught only by that case); never throws on a malformed or absent marker;
    pure.
  - A test documents the motivating interleaving — `rialto-web-e2e.yml`
    declares no `concurrency:` group, so two runs for one PR can overlap and
    the older can finish last — and a second documents the **delete direction**
    specifically: an older _passing_ run declining to remove a newer _failing_
    run's comment. That direction is the gap that routed back to Architect, and
    it is where SC-5's local half is discharged.
  - Blocked by: —
  - Verified: **locally.**

## Milestone 3: The comment lands on a real pull request

**Demonstrable at the boundary:** a real PR shows the images. This is the
milestone at which the feature exists; everything before it is machinery, and
everything after it is bounded growth.

- [x] **3.1 `scripts/visual-diff-refs.mjs` — ref namespace** — construct and
      parse `visual-diffs/pr-<N>/run-<run_id>`.
  - Accept: the ref prefix is a **single exported constant** (so the Milestone 5
    probe is a one-constant change); construction produces exactly
    `visual-diffs/pr-<N>/run-<id>`; parse round-trips and returns `null` for any
    non-matching name (including `main`, `visual-diffs/`, and a trailing-slash
    variant); pure; both functions exported for reuse by 3.2 and 4.1.
  - Blocked by: —
  - Verified: **locally.**

- [ ] **3.2 `scripts/publish-visual-diffs.mjs` — the thin caller** — the only
      impure edge: read the report **and the config file it names**, call the
      three pure modules, build and push the orphan commit, execute the comment
      verb it is handed, write the job summary.
  - Accept: builds the orphan commit with plumbing (`hash-object` → a temporary
    `GIT_INDEX_FILE` → `write-tree` → `commit-tree`) and a sandbox test asserts
    `git status --porcelain` is unchanged across the operation — the runner's
    working tree and index are never touched; pushes `<sha>:refs/heads/<refName>`
    and a test asserts the string `--force` appears nowhere in the file (the
    naming scheme removes the lost-update race; a force-push reintroduces it);
    **executes whatever verb `decideCommentAction` returns — `post` / `patch` /
    `delete` / `skip` — and branches on nothing else**, in particular never on
    the marker itself and never on the `visual` outcome a second time; **never
    retries the POST** (a landed-but-failed POST would double-post; the next
    run's marker lookup repairs it) while the read and the PATCH are retry-safe
    (SC-4); the `delete` verb is **not** gated behind the diffs artifact, which
    does not exist on a passing run (SC-5); on a missing or unparsable report,
    or zero changed snapshots with a failing job, it writes a job-summary note
    saying the failure was not a snapshot diff and exits 0 — the comment must
    never claim "0 of 49 changed"; every shell-out uses `execFileSync` with an
    argv array, never string interpolation.
  - Accept, **every `skip` is noted**: the caller writes a job-summary line
    naming this run's ordinal and the standing comment's, for every one of the
    four skip cells (`absent + passed`, `strictly newer` × both outcomes,
    `unparsable + passed`) — so "a newer run owns this comment" is readable
    without archaeology. In the one degenerate cell, `absent + passed`, there is
    no standing ordinal to name and the line says so. A test asserts no skip
    path returns without emitting that line. Silence is exactly the property that made the delete-path
    version of this bug invisible, and the note costs one line in a job nothing
    depends on.
  - Accept, the budget hand-off: resolves the Playwright config path from the
    report's own `config.configFile`, re-rooted as
    `path.relative(GITHUB_WORKSPACE, configFile)` (both jobs run at
    `GITHUB_WORKSPACE`); reads that file as **text** and hands it to
    `parseMaxDiffPixels`, forwarding the result to `renderComment` unaltered; a
    `configFile` that is absent, escapes the workspace, or names a file not in
    the checkout **no-ops to `budget: null`** and the degraded comment — never
    a substituted default, asserted by a test per case. Text and not `import()`
    is not a style choice: the job deliberately runs no `pnpm install`, so
    `defineConfig` is unresolvable and importing the config would throw.
  - Accept, the thinness grep test — **extended**: the module holds no
    ordering, cap, parse, or staleness logic; it imports all three pure
    modules, and **defines no comparator and contains no budget literal**. The
    unextended version of this test would have passed a module that quietly
    re-derived either one.
  - Blocked by: 1.2, 2.1, 2.2, 2.3, 3.1
  - Verified: **locally** for the git-plumbing, budget hand-off, skip-note and
    no-`--force` assertions; **live PR** (3.5) for everything that touches
    GitHub.

- [ ] **3.3 `publish-visual-diffs` job in `.github/workflows/rialto-web-e2e.yml`**
      — the new job that owns the delivery path.
  - Accept: `needs: [visual]` with `if: always() && …` so it sees both outcomes;
    guards in order, each a no-op-with-job-summary-note rather than a failure —
    `github.event_name == 'pull_request'` (the push-to-`main` case: no PR, job
    never starts), then
    `github.event.pull_request.head.repo.full_name == github.repository` (the
    fork case: declines rather than failing on a predictable 403), then a
    readable JSON report; job-level `permissions: contents: write,
pull-requests: write` **additive over** the workflow's unchanged
    `contents: read` (mirroring `ci.yml`'s `ci-gate`); downloads both artifacts
    with the SHA-pinned `actions/download-artifact` and tolerates
    `rialto-web-visual-diffs` being absent on a passing run without failing the
    job; runs **no** `pnpm install`, no build, and no test (this is what makes
    SC-7/SC-8 true by construction); an explicit `timeout-minutes` on the push
    step (`git` has no default and a hung push burns the job budget); every
    exit-code-bearing `run:` block opens `set -o pipefail` (the marker lookup
    pipes through `head`); the `visual` job's own steps, artifact, permissions,
    and conclusion are untouched.
  - Blocked by: 1.3, 3.2
  - Verified: **live CI run**, then fully in 3.5.

- [ ] **3.4 Trigger-hygiene guard test** —
      `scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs`, in the shape
      `ci-node-matrix.test.mjs` and `drift-fix-workflow.test.mjs` already use.
  - Accept: reads **every** file in `.github/workflows/`, and fails if any
    `push:` branch filter — or any `create:` / tag trigger — could match the
    `visual-diffs/` prefix; passes against the repo as it stands (measured: every
    `push:` trigger here is scoped to `branches: [main]`, and there are no
    `create:` or tag triggers at all); **and a test proves the guard can fail** —
    fed a synthetic workflow source containing `push: branches: ['**']`, it
    reports a violation. Without that second half the guard is decorative, and a
    later `branches: ['**']` would turn every failing visual run into a CI storm.
  - Blocked by: 3.1 (consumes the ref-prefix constant)
  - Verified: **locally.**

- [ ] **3.5 LIVE demonstration on a real pull request with a genuinely failing
      visual job** — the item that discharges SC-1, SC-3, SC-4 and SC-5, none of
      which any unit test can reach. Nothing in Milestones 1–3 counts as done
      until this passes.
  - Accept, recorded as a PR number plus the rendered comment text (not passing
    tests, not merged code):
    1. The PR's diff includes a change under `apps/rialto-web/**` — required for
       the workflow's paths filter to fire at all — that makes ≥1 snapshot
       genuinely differ.
    2. **SC-1:** after the run completes, the comment is present on that PR.
    3. **SC-2 in situ:** `gh pr view <N> --comments` alone, with no image
       fetched, yields the changed-of-total and every changed snapshot's name
       and pixel count.
    4. **SC-3:** every `<img src>` in the comment returns HTTP 200 with an
       image content type when fetched with **no credentials**. Cross-check any
       failure against the documented LAN DNS sinkhole trap (`dig @1.1.1.1` and
       `curl --resolve`) before concluding the URL is bad.
    5. **SC-4:** re-run the `visual` job on the same PR — the PR carries exactly
       one such comment and its contents reflect the newer run.
    6. **SC-5:** restore the perturbation so the suite passes and push — no
       comment claiming a failure is left standing.
    7. **SC-6 in situ:** if fewer than 7 snapshots changed, force the cap by
       perturbing enough surfaces (or re-run against a broader change) so the
       overflow line is observed at least once on a real comment.
    8. **SC-7:** `CI Gate` concludes on the PR exactly as it would without this
       feature, and `gh api repos/.../branches/main/protection/required_status_checks`
       returns the same contexts as before.
    9. **SC-8:** `rialto-web-visual-diffs` still uploads on failure with its
       existing name and contents.
  - The PR is **never merged** — release authorization is withheld.
  - Blocked by: 3.2, 3.3
  - Verified: **live failing PR. Cannot be discharged any other way.**

## Milestone 4: Storage stays bounded

**Demonstrable at the boundary:** the retention rule is executable and has
actually been run — in dry-run, against this repo's real refs — printing a
keep/delete verdict per ref. Growth is bounded by _(open PRs + 24h of churn)_,
and no ref a standing comment depends on can be selected.

- [ ] **4.1 `selectRefsToDelete({ refs, openPrNumbers, now, minAgeHours })`** in
      `scripts/visual-diff-refs.mjs` — the three-clause retention rule.
  - Accept: **keeps** the newest ref of each _open_ PR (what that PR's standing
    comment points at); **keeps** any ref younger than
    `MIN_AGE_HOURS = 24`, exported as a constant (its run may still be in
    flight with the comment not yet written); **deletes** everything else —
    superseded runs on open PRs, and every ref of every closed or merged PR; a
    ref name `parseRefName` cannot parse is **never** selected (fail-safe);
    pure. A test states the invariant the data model names: for an open PR whose
    ref is older than the floor, its newest ref survives — the flat-age-floor
    alternative would delete images out from under a live comment and break
    SC-3.
  - Blocked by: 3.1
  - Verified: **locally.**

- [ ] **4.2 Sweep `main()` and `.github/workflows/visual-diff-ref-sweep.yml`** —
      the impure runner and its daily thin caller.
  - Accept: `main()` shells to `git ls-remote` / `gh pr list` / `git push
--delete` via `execFileSync` argv arrays; deleting an already-absent ref
    counts as success, so the sweep is idempotent; `DRY_RUN` defaults to `"true"`
    and is **not** hard-wired for scheduled events — the explicit reason this
    workflow is separate from `branch-cleanup.yml`, whose scheduled runs can
    never delete anything, and a test asserts the new workflow does not
    reproduce that wiring; the workflow is `schedule:` daily plus
    `workflow_dispatch:`, `permissions: contents: write, pull-requests: read`,
    a thin caller with SHA-pinned actions.
  - Evidence this item is actually exercised, not merely written:
    `DRY_RUN=true node scripts/visual-diff-refs.mjs` is run against this repo's
    real refs and its per-ref verdict recorded in **Notes** below.
  - **Known residual, recorded rather than hidden:** GitHub schedules and
    dispatches workflows only from the default branch, so the _scheduled_
    workflow cannot fire before merge. The local dry-run above is the pre-merge
    evidence; `release.md` must carry a post-merge follow-up to confirm the
    first scheduled run executed and its verdicts were correct. This is exactly
    the repo's shipped-but-never-executed failure class, and it is the one
    component here that cannot be closed out pre-merge.
  - Blocked by: 4.1
  - Verified: **locally** (dry-run), then **post-merge** for the schedule.

## Milestone 5 (optional): Custom ref namespace probe

**Optional. No item outside this milestone blocks on it, no success criterion
depends on it, and dropping the milestone entirely changes nothing.** The
design deliberately ships the verified `refs/heads/visual-diffs/…`; this is the
contained one-constant improvement Architect named.

- [ ] **5.1 Probe whether `refs/visual-diffs/…` is pushable under
      `GITHUB_TOKEN`** — a custom namespace could not match a `branches:` filter
      by construction and would stay out of the branch list, but its
      pushability is unverified.
  - Accept: the probe is run and its result recorded in **Notes** either way.
    If **pushable**: flip the single ref-prefix constant in
    `visual-diff-refs.mjs`, update 3.4's guard test and 4.2's sweep to match,
    and re-demonstrate SC-1 and SC-3 on a live PR (a namespace change that
    breaks the image URLs must not be discovered later). If **not pushable**:
    one line in Notes recording the negative result and the evidence, and the
    milestone closes with no code change.
  - Blocked by: 3.5
  - Verified: **live** (a push under a real `GITHUB_TOKEN` is the whole probe).

## Coverage map

### Architecture components → items

| Component (`architecture.md` § Components / Data model)                     | Item(s)                                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `visual` job (existing, modified)                                           | 1.3                                                                                     |
| `publish-visual-diffs` job (new)                                            | 3.3                                                                                     |
| `scripts/visual-diff-report.mjs` (pure — report parse **and** budget parse) | 1.2 (`parseVisualReport` + `parseMaxDiffPixels`; fixtures: 1.1 report, 1.2 config text) |
| `scripts/visual-diff-comment.mjs` (pure)                                    | 2.1, 2.2, 2.3                                                                           |
| `scripts/visual-diff-refs.mjs` (pure + `main()`)                            | 3.1 (namespace), 4.1 (rule), 4.2 (`main()`)                                             |
| `scripts/publish-visual-diffs.mjs` (thin caller)                            | 3.2                                                                                     |
| `.github/workflows/visual-diff-ref-sweep.yml` (new)                         | 4.2                                                                                     |
| Trigger hygiene / anti-recursion guard test                                 | 3.4                                                                                     |
| Data model — orphan commit + flat tree                                      | 3.2                                                                                     |
| Data model — sticky-comment marker                                          | 2.2 (writes), 2.3 (reads), 3.2 (looks up)                                               |
| Data model — parsed snapshot record                                         | 1.2                                                                                     |
| Retention invariant (comment-referenced commit stays reachable)             | 4.1                                                                                     |

Every component in `architecture.md` appears in at least one item.
Re-verified after the 2026-08-25 revision: the two contracts the revision added
land in existing items rather than new ones — `parseMaxDiffPixels` in 1.2
(alongside `parseVisualReport`, both being facts about Playwright's formats)
and `decideCommentAction` in 2.3 (replacing `shouldReplaceComment` in place).
No component is left without an item, and no item was re-cut or re-sequenced.

### PRD success criteria → items

| SC                                                | Covered by                         | Mode                     |
| ------------------------------------------------- | ---------------------------------- | ------------------------ |
| SC-1 comment present on a failing PR              | 3.5 (2)                            | **live failing PR only** |
| SC-2 comment text carries counts and names        | 2.2 (text-only assertion), 3.5 (3) | local, confirmed live    |
| SC-3 image URLs 200 without credentials           | 3.2 (SHA-addressed URLs), 3.5 (4)  | **live PR only**         |
| SC-4 exactly one comment after re-run             | 2.3, 3.2 (upsert), 3.5 (5)         | local, **decided live**  |
| SC-5 passing run leaves no failure comment        | 2.3, 3.2 (delete path), 3.5 (6)    | local, **decided live**  |
| SC-6 display cap plus an explicit overflow line   | 2.1, 2.2, 3.5 (7)                  | local, confirmed live    |
| SC-7 `CI Gate` and the `visual` verdict unchanged | 1.3, 3.3, 3.5 (8)                  | live CI                  |
| SC-8 `rialto-web-visual-diffs` still uploads      | 1.3, 3.5 (9)                       | live CI                  |

Every SC-1..SC-8 is covered by at least one acceptance criterion.

### What can and cannot be proven locally

**Locally provable, in full:** 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.4, 4.1, and
3.2's git-plumbing, budget hand-off, skip-note and no-`--force` assertions.

**Requires a live CI run** (an artifact list and a job conclusion are not
producible on a laptop): 1.3, 3.3.

**Requires a real pull request with a genuinely failing visual job, and cannot
be discharged any other way:** SC-1, SC-3, SC-4, SC-5 — all of item 3.5.
Verify must actually produce that condition: perturb a `apps/rialto-web/**`
visual surface so ≥1 snapshot genuinely differs, open the PR, read the
rendered comment, fetch the image URLs unauthenticated, re-run the job, then
restore the perturbation and confirm the comment clears. Passing tests are not
evidence for any of these four.

**Cannot be proven before merge at all:** the _scheduled_ execution of
`visual-diff-ref-sweep.yml` (4.2) — GitHub only schedules workflows from the
default branch. Local dry-run is the pre-merge substitute; the post-merge
confirmation belongs in `release.md`.

## Design gaps found — both RESOLVED (2026-08-25)

Two contract-level omissions surfaced by decomposition. Neither was designed
around here: both were routed to Architect, and Architect closed both in
`architecture.md`'s 2026-08-25 revision. The records stay — a resolved gap is
the evidence that the route-back happened, and each resolution is what the
items above now encode.

**Gap 1 — `renderComment`'s pixel budget had no input. RESOLVED.** The output
shape specified `### <name> (N px over 300 budget)`, and SC-2 requires the pixel
difference to be shown _against the budget_, but `renderComment`'s stated
input was "the changed list, the cap, the pushed commit SHA, the repo slug" —
the budget was not among them, and `300` lives in
`apps/rialto-web/playwright.config.ts` as `maxDiffPixels: 300`. Hardcoding it
in the comment module creates a second source of truth for a number the
comment asserts, and the run's own motivating incident (#4496) is a tolerance
change that nobody noticed. Candidate resolutions — **not chosen here**:
(a) pass the budget in as a `renderComment` parameter, sourced by the thin
caller; (b) derive it in the caller by reading `playwright.config.ts`;
(c) accept a constant with a drift test asserting it equals the config's value.
Blocked item 2.2. **Routed to Architect.**

> **How `architecture.md` closed it** — § `parseMaxDiffPixels`, §
> `selectDisplayed`/`renderComment`, and frontmatter assumption 3. Candidate
> (a) is adopted for _how the number arrives_: `renderComment`'s input contract
> gains `budget: number | null` and the module never holds the literal. The
> half all three candidates were missing — _where the number comes from_ — is a
> new pure contract `parseMaxDiffPixels(configSource)` on
> `scripts/visual-diff-report.mjs`, fed the **text** of the config this run
> itself loaded, located from the report's own `config.configFile` (text, not
> `import()`, because the publisher job runs no `pnpm install` and
> `defineConfig` would be unresolvable). It returns `null` — never a fallback
> number — whenever the answer is not a single unambiguous value, and
> `renderComment` then degrades to `### name (N px changed)` plus a footer
> note. Candidate (c) is rejected with a reason: the drift test must read that
> same file to compare against, so the constant is a redundant second copy
> whose only effect is a red CI run on the PR that legitimately changes the
> budget. Re-measured while writing the items above, and now a required test
> fixture: the live config carries a commented-out `maxDiffPixelRatio: 0.01`
> inside the `//` prose at line 23 and live `maxDiffPixels: 300` at line 28, so
> comment-stripping is load-bearing, not hygiene. **Folded into items 1.1
> (fixture retains `config.configFile`), 1.2, 2.2 and 3.2.**

**Gap 2 — the delete path had no staleness guard. RESOLVED.**
`shouldReplaceComment` existed because `rialto-web-e2e.yml` declares no
`concurrency:` group, so two runs for one PR can overlap and the older can
finish last. The design applied that guard to the _failure_ path (PATCH/POST)
but stated the _success_ path as "find by marker → DELETE if found",
unguarded. The same interleaving therefore survived on the other branch: an
older passing run finishing after a newer failing run deletes the newer run's
comment, leaving a PR with a live visual failure and no comment — the exact
state SC-1 and SC-5 exist to prevent, in opposite directions. There was an
obvious contained resolution (consult `shouldReplaceComment` before deleting),
but which ordinal a delete should compare against, and whether a stale _delete_
should be silently skipped or noted in the job summary, was Architect's call.
Affected item 3.2. **Routed to Architect.**

> **How `architecture.md` closed it** — § `decideCommentAction` and frontmatter
> assumption 4. `shouldReplaceComment` is replaced by
> `decideCommentAction({ existingBody, runOrdinal, visualFailed })`, returning
> a verb — `"post" | "patch" | "delete" | "skip"` — so the thin caller executes
> and never decides; a boolean could not carry it, because the caller would
> then have to tell "nothing to clear" from "a newer run owns the comment",
> which is policy landing in the module that holds none. **One comparison, both
> branches:** ordinals compare lexicographically on `[run_id, run_attempt]` and
> a run may act iff its ordinal is **≥** the standing marker's. That answers
> _which ordinal a delete compares against_ — the same one a patch does,
> because a delete is not "remove the comment my run wrote" but "this run's
> verdict is the latest word about this PR". And it answers _silent or noted_:
> **noted** — every `skip`, on either branch, writes a job-summary line naming
> both ordinals. The full 8-cell table (4 standing-comment states × 2 outcomes)
> lives in `architecture.md` and is the source for 2.3's per-cell tests; its one
> deliberate asymmetry is the unparsable marker, resolving to `patch` on failure
> and `skip` on success, toward the recoverable wrong answer. **Folded into
> items 2.3 and 3.2**, and it is why SC-5's local coverage now names 2.3.

## Notes

### 2026-08-25 — 1.1, the fixture is a platform-difference failure, not a regression

The committed baselines are Linux-CI-runner-specific (documented gotcha), so a
macOS local run of the visual suite fails all 49 snapshots by construction.
That is what `scripts/__tests__/fixtures/playwright-visual-report.json` was
captured from, and it is stated in the fixture's own `_fixtureNotes`. For
parsing purposes the distinction is immaterial — the report shape, the
attachment layout, the ANSI-wrapped matcher message and the `-expected` trap
are byte-for-byte what a genuine CI regression produces. It does mean the
fixture proves nothing about whether the _suite_ is currently healthy, and
item 3.5 still needs a genuinely perturbed surface on a real pull request.

### 2026-08-25 — 2.2, the legibility answer: `width=250` triages, it does not read

Rendered the 1.1 fixture through `renderComment` and then judged the images
directly, by scaling real `-diff.png` files from the same run to 250 px wide
and looking at them. Two representative shapes, both against the live 300-pixel
budget:

| snapshot                                        | native     | at `width=250` | verdict                                                                                                                                                   |
| ----------------------------------------------- | ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `light-button-variants` (579 px diff)           | 1232 × 113 | 250 × 23       | a sliver. The changed pixels are visible as faint red marks; nothing about _what_ changed is readable.                                                    |
| `light-master-override-variants` (2315 px diff) | 1232 × 850 | 250 × 172      | usable. Red diff regions are clearly located — "one component" vs "everything shifted" is answerable at a glance — but no text or edge detail is legible. |

So: **six rows at `width=250` answers the triage question this feature exists
for** (is this drift or a regression, and where), and does **not** answer the
review question (what exactly moved). The suite's sections are all ~1232 px
wide and 100–850 px tall, so the constraint is the 4.9× downscale, not the row
count — six rows is comfortable to scroll.

Recorded, not acted on. Two contained improvements are available and both were
left alone deliberately: wrapping each `<img>` in an `<a href>` to the full-size
raw URL (GitHub does not make a bare `<img>` click-through), and raising the
width. The comment shape is listed in `prd.md` § Constraints as chosen by the
user at brief time, and this run is unattended — changing it is Verify's call
with a real comment in front of a human, which is where `prd.md` parked it.
