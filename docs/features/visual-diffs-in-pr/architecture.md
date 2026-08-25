---
stage: architect
run: feature:visual-diffs-in-pr
date: 2026-08-25
ux: skipped — No application UI, component, or design-system surface — the sole presentation is one GitHub PR comment whose layout the user already selected at idea stage.
assumptions:
  - "Fork pull requests degrade to a no-op with a note in the job summary, rather than gaining a fallback delivery path. Taken as the recommended default with no live user input. Grounded in measurement: `gh pr list --state all --limit 50 --json headRepositoryOwner` returns `mattbutlerengineering` for all 50 — this repo has no fork PR history. If that changes, the feature is silently absent on fork PRs, never broken."
  - "SC-2 (every changed snapshot's name and pixel count in comment text) and SC-6 (a display cap with an overflow line) are read as constraining different things: the cap bounds *image rows*, while the text enumerates *every* changed snapshot. Both criteria are satisfiable together only under this reading; the alternative reading — cap the text too — would make SC-2 unsatisfiable whenever the cap binds. Resolved here without user input."
  - "The pixel budget the comment asserts is read at publish time out of the Playwright config file the run itself loaded (`config.configFile` in the JSON report), rather than hardcoded in the comment module or held as a constant behind a drift test. Taken as the recommended default with no live user input, and narrowed to one option by measurement: the budget is absent from the JSON report (Playwright 1.62.1 — `FullConfig` carries no `expect` field, and the JSON reporter whitelists ten per-project fields that exclude it; confirmed by running `playwright test --list --reporter=json` against `apps/rialto-web/playwright.config.ts` and finding no `expect`/`maxDiffPixels` anywhere in `config`) and absent from the matcher message (`coreBundle.js:7564` emits the count and the ratio only). When the budget cannot be read, the comment reports the pixel count with no budget clause rather than asserting a number it did not read."
  - "The success path's DELETE is guarded by the same ordinal comparison as the failure path's PATCH/POST, and a run that loses the comparison skips with a job-summary note rather than silently. Taken as the recommended default with no live user input: symmetry is the default because the two paths' losing outcomes are the same feature failing in opposite directions, and the note is the default because every other guard in this design already writes one — silence is precisely the property that made the delete path's version of this bug invisible."
---

# Architecture: Visual regression diffs inline in the pull request

> **Revised 2026-08-25** after Decompose routed back two contract-level gaps:
> `renderComment` had no pixel-budget input, and the comment-**delete** path
> had no staleness guard. Both are closed below — a new
> `parseMaxDiffPixels` contract, and `decideCommentAction` replacing the
> draft's `shouldReplaceComment`. Nothing else in this design changed.

## Approach

A new **publisher job** in `.github/workflows/rialto-web-e2e.yml` runs after the
existing `visual` job, reads that job's Playwright JSON report and its already-
uploaded diff artifact, pushes the images it intends to display as a single
orphan commit on a run-scoped ref, and upserts one sticky comment on the pull
request whose `<img>` tags address those images by **commit SHA** on
`raw.githubusercontent.com`. The `visual` job itself gains exactly one thing —
a second reporter on its existing `playwright test` invocation — and keeps its
steps, its artifact, its permissions, and its conclusion. Everything that can
fail in the new path fails inside a job nothing depends on.

The shape that lost was the obvious one: do the push and the comment _inside_
the `visual` job. It is fewer moving parts, but it requires raising that job's
token to `contents: write` while it is executing pull-request-authored code
(`playwright.config.ts`, the spec, the dev server, the whole `pnpm install`
tree), and it puts new failure modes on the critical path of a job whose
conclusion SC-7 freezes. Splitting the write-privileged work into a job that
runs no repository build and no test makes SC-7 and SC-8 true _by construction_
rather than by care, and costs one `actions/download-artifact` step.

Three properties carry the design, and each answers a hazard named upstream:

- **Immutable, attempt-scoped refs.** Every run _attempt_ writes a ref only it
  names (`visual-diffs/pr-<N>/run-<run_id>-attempt-<run_attempt>`) and never
  overwrites one. The attempt is part of the name because `GITHUB_RUN_ID` is
  stable across a re-run while `GITHUB_RUN_ATTEMPT` increments — see the push
  contract below. There is no
  read-modify-write cycle anywhere, so there is no lost-update race to lose —
  concurrency is handled by not sharing state, not by serializing access to it.
- **URLs pin the commit SHA, never a ref name.** A published comment keeps
  working regardless of what later runs do to the refs, and slashes in the ref
  name never have to survive a URL.
- **Retention is a rule, not a cleanup task.** Reachability is what keeps the
  images alive, so the retention rule _is_ the storage design, and it is stated
  below with the invariant it preserves.

## Components

### `visual` job (existing, in `rialto-web-e2e.yml`)

- Responsibility: unchanged — decide whether the rialto-web visual suite
  passes, and upload `rialto-web-visual-diffs`.
- Change: its `playwright test` invocation gains `--reporter=github,json` with
  `PLAYWRIGHT_JSON_OUTPUT_FILE` pointing **outside** `e2e/test-results/`, plus
  one `continue-on-error: true` upload step for that report as a separate small
  artifact. Writing the report outside `test-results/` is deliberate: it keeps
  the `rialto-web-visual-diffs` artifact byte-identical in name _and_ contents
  (SC-8), and `continue-on-error` keeps a broken upload from changing the job's
  conclusion (SC-7).
- Collaborators: none new. It does not know the publisher exists.

### `publish-visual-diffs` job (new, in `rialto-web-e2e.yml`)

- Responsibility: own the entire delivery path — decide whether to act, obtain
  the images, publish them, and leave the PR carrying exactly one correct
  comment.
- Guards, in order, each a no-op-with-summary-note rather than a failure:
  `github.event_name == 'pull_request'` (answers the push-to-main case — a push
  run has no PR and the job never starts);
  `github.event.pull_request.head.repo.full_name == github.repository` (answers
  the fork case — a fork's token cannot be granted `contents: write`, so the
  job declines rather than failing on a 403 it could have predicted);
  and the presence of a readable JSON report.
- Permissions: `contents: write` + `pull-requests: write` **at job level**,
  additive over the workflow's `contents: read`. This mirrors `ci.yml`'s
  `ci-gate` job, which adds `statuses: write` the same way, and stays inside a
  posture the repo already takes — `auto-merge.yml` and `merge-queue.yml`
  already grant `contents: write` on `pull_request`.
- `needs: [visual]`, `if: always() && ...` so it sees both outcomes: a failing
  `visual` publishes, a passing `visual` clears (SC-5).
- Residual risk, stated rather than hidden: the job checks out the repository to
  obtain `scripts/`, so a pull request that edits those scripts edits what runs
  under a `contents: write` token. Accepted, because pinning the publisher to
  `main`'s scripts would mean a PR touching the publisher could never exercise
  it, and because the mitigation that matters is already in place — the job runs
  no `pnpm install`, no build, and no test, so nothing in the PR's dependency
  tree executes. `scripts/` and `.github/` changes are visible in the diff.
- Collaborators: `visual` (via two artifacts), `publish-visual-diffs.mjs`.

### `scripts/visual-diff-report.mjs` (pure)

- Responsibility: turn one Playwright JSON report into the list of snapshots
  that actually changed, with each one's pixel count and the in-artifact paths
  of its three images — and read the pixel budget out of the Playwright config
  file that same report names. Knows Playwright's report _and_ config formats;
  knows nothing about comments, git, or GitHub.
- The budget lives here rather than in the comment module for the reason the
  split already draws: the budget's location and spelling are facts about
  Playwright, and the comment module is the one that must not learn any.
- Deletion test: survives. Without it, retry selection, ANSI tolerance, the
  pixel-count extraction, the comment-stripping budget parse, and the
  `-expected` path substitution below would be re-derived — wrongly — at three
  call sites.
- Collaborators: none (inputs are an already-parsed object and a string).

### `scripts/visual-diff-comment.mjs` (pure)

- Responsibility: own everything about the comment as an artifact — ordering,
  the display cap, the markdown body, the marker, and the decision of what this
  run may do to the standing comment: post it, patch it, delete it, or nothing.
- Split from the report module because the two change for different reasons:
  one tracks Playwright's output format, the other tracks a comment shape the
  PRD expects Verify to tune.
- Collaborators: none.

### `scripts/visual-diff-refs.mjs` (pure + thin `main()`)

- Responsibility: own the ref namespace — construct a ref name, parse one back,
  and decide which refs may be deleted. Its `main()` is the retention sweep,
  shelling to `git`/`gh` with `execFileSync` argv arrays.
- Shaped after `scripts/branch-cleanup.mjs`, which is the closest precedent:
  pure exported predicates, one impure `main()`, unit tests over the predicates
  only.
- Collaborators: `visual-diff-ref-sweep.yml`, `publish-visual-diffs.mjs`.

### `scripts/publish-visual-diffs.mjs` (thin caller)

- Responsibility: I/O and sequencing only, no decisions. Read the report and
  the config file it names, call the two pure modules, write the git objects,
  push, execute the comment verb the comment module returns, write the job
  summary.
- Deletion test: it forwards, and a forwarder is not a module — but it is the
  _only_ impure edge, which is the thing being isolated. It holds no rule that
  a test would want to reach.
- Collaborators: all three modules above, `git`, `gh`.

### `visual-diff-ref-sweep.yml` (new workflow)

- Responsibility: run the retention rule on a schedule. Thin caller over
  `visual-diff-refs.mjs`.
- Separate from `branch-cleanup.yml` for a measured reason: that workflow's
  `DRY_RUN` is hard-wired to `'true'` for every non-`workflow_dispatch` event,
  so a sweep added to it would never delete anything on schedule.

## Data model

There is no database. Three shapes carry state, and each is chosen from the
access pattern that reads it.

**The published commit.** One orphan commit (no parents), one flat tree:

```
visual-diffs/pr-<N>/run-<run_id>-attempt-<run_attempt>   # refs/heads/…, force never used
└── <snapshot>-{expected,actual,diff}.png   # only for displayed snapshots
```

Access pattern: _"given a standing comment, fetch the image it names."_ One
unauthenticated GET by immutable commit SHA — no ref resolution, no listing, no
consistency requirement beyond "the object still exists". This is why the tree
is flat and the commit is orphan: nothing ever reads it as a history.

Invariant, owned by the retention rule: **a commit referenced by a standing
comment is always reachable.** Nothing else enforces it, and nothing else may.

**The sticky comment.** First line is a machine marker, invisible when
rendered:

```html
<!-- visual-diffs-in-pr run=<run_id> attempt=<run_attempt> -->
```

Access patterns: _"is there already one of MINE on this PR?"_ (a scan of
`GET /repos/{repo}/issues/{n}/comments` matching the marker prefix **and** the
comment's author against this job's own identity) and _"is the standing one
newer than me?"_
(parse `run=` and `attempt=` and compare). The marker carries the full run
ordinal precisely so the second question has an answer without a second API
call — and it is the _only_ record of it, which is why a delete that removes
the marker is a state change the rule below has to account for.

**The parsed snapshot record**, the report module's output — `{ name, pixels,
reason, expectedPath, actualPath, diffPath }`. `pixels` is `null` when the
count is genuinely unavailable (see the contract below); `reason` distinguishes
`pixel-diff` / `size-mismatch` / `missing-baseline` so the comment can say
something true in each case instead of printing `null px`.

## Interfaces & contracts

### Playwright JSON report → `parseVisualReport(report)`

- Input: the object written by Playwright's built-in `json` reporter (v1.62.1),
  obtained via `--reporter=github,json` and `PLAYWRIGHT_JSON_OUTPUT_FILE`
  (`resolveOutputFile("JSON", …)`, `playwright/lib/runner/index.js:1520`).
  `--reporter` is documented comma-separated (`program.js:119`); listing
  `github` first preserves the annotations CI shows today.
- Output: `{ total, changed[], unchanged, failedWithoutDiff }`. `total` is the
  count of specs in the report (49 today) — derived, never hardcoded, so SC-2's
  denominator cannot go stale.
- **Three buckets, not two.** _Corrected 2026-08-25 after review; the original
  contract was `{ total, changed[] }` alone, which forced the comment to compute
  `unchanged = total - changed.length`._ A spec that fails without producing an
  `-actual` attachment — a `net::ERR_CONNECTION_REFUSED`, a 30 s timeout, a
  suite-level error — is absent from `changed[]` because there is nothing to
  show, and it is emphatically not unchanged. The subtraction counted it as a
  pass, so the comment told the autonomous reader this feature exists for that a
  hard-failing spec was fine. `unchanged` is therefore the real pass count
  (`ok !== false`), `failedWithoutDiff` is the third bucket, and the three sum to
  `total` by construction.
- **Where the pixel count comes from, verified rather than assumed.** It exists
  in exactly one place: the free-text matcher message
  `` `${count} pixels (ratio ${ratio} of all image pixels) are different.` ``
  built in `playwright-core/lib/coreBundle.js:7564` and surfaced as
  `results[].errors[].message`. It is _not_ exposed structurally anywhere —
  not in `attachments[]`, not in the PNG filenames, not in the matcher result.
  The contract is therefore: identity and image paths come from the structured
  `attachments[]`; the count comes from a regex over the message; **an
  unparsable message yields `pixels: null`, never a thrown error and never a
  guessed number.** Strip ANSI defensively before matching — the JSON reporter
  formats through `nonTerminalScreen`, whose `colors` are inherited from the
  terminal screen and are therefore environment-dependent.
- **The `-expected` trap.** `attachments[]`'s `-expected` entry has
  `path` pointing at the _committed baseline_
  (`e2e/screenshots/<name>.png` — `expectedPath`, `expect.js:12412`, attached
  at `12504`), which is not inside the uploaded artifact. The identical bytes
  are also written into the output directory as `<base>-expected.png`
  (`legacyExpectedPath`, `expect.js:12415`). The in-artifact baseline path is
  therefore derived by suffix
  substitution on the **`-actual`** attachment's path, never from the
  `-expected` attachment's path. Getting this backwards produces a comment
  whose baseline column 404s, and nothing before Verify would catch it.
- **Retries.** The config sets `retries: 1` in CI, so a spec has up to two
  entries in `results[]`. Only specs with `ok === false` count as changed, and
  only the entry with the highest `retry` is read — a snapshot that failed then
  passed is a flake, not a regression, and must not appear.
- Failure modes: report missing or unparsable → the caller no-ops with a job
  summary note. A `visual` failure with zero changed snapshots (webServer
  timeout, suite-level error) → also a no-op, with the summary saying the
  failure was not a snapshot diff; the comment must never claim "0 of 49
  changed" as though that were the finding.
- Pure, in-process. No timeout, no retry semantics.

### Playwright config → `parseMaxDiffPixels(configSource)`

_Added in the 2026-08-25 revision — the draft named a `300` the design had no
way to obtain._

- Input: the **text** of the Playwright config file this run loaded, located
  from the report's own `config.configFile` — verified present and absolute
  (`…/apps/rialto-web/playwright.config.ts`) in a real 1.62.1 JSON report.
  Taking the path from the report rather than hardcoding it is the point:
  the budget then comes from the same config that produced the counts, on a PR
  that may have edited either. Both jobs run at `GITHUB_WORKSPACE`, so the
  publisher re-roots it as `path.relative(GITHUB_WORKSPACE, configFile)`; a
  `configFile` that is absent, escapes the workspace, or names a file not in
  the checkout yields `null`, never a fallback number.
- Output: `number | null` — the suite-wide
  `expect.toHaveScreenshot.maxDiffPixels`.
- **Why text and not `import()`.** The publisher job deliberately runs no
  `pnpm install` — that absence is what keeps the PR's dependency tree from
  executing under a `contents: write` token — so `defineConfig` from
  `@playwright/test` is unresolvable and importing the config would throw. A
  textual read is the only source that preserves the job's defining property.
- **Strip comments before matching. This is a measured trap, not hygiene.**
  `apps/rialto-web/playwright.config.ts` today carries a commented-out
  `maxDiffPixelRatio: 0.01` on line 23 (prose explaining #4450), and
  `maxDiffPixels: 300` on line 28 as the only live setting. A comment-blind
  parse reads a ratio that is not configured and degrades every comment
  forever.
- Returns `null` — never a number — when no `maxDiffPixels` is found, when more
  than one is found, or when a **live** `maxDiffPixelRatio` sits alongside it.
  The last is not pedantry: the enforced budget is
  `min(maxDiffPixels, w × h × maxDiffPixelRatio)` (`coreBundle.js:7556-7562`),
  which is per-image and therefore not a single number a comment could name.
  Verified that no spec overrides it today — `visual.spec.ts`'s four
  `toHaveScreenshot` calls pass only `timeout` — so the config value is the
  effective budget for every snapshot in the suite.
- **Why not a constant with a drift test** (Decompose's candidate (c)): the
  drift test would have to read this same file to compare against, so once the
  read exists the constant is a redundant second copy whose only guarantee is
  that a red CI run forces someone to edit it — on the very PR that
  legitimately changes the budget. Reading it directly has one copy and costs
  no red run. Candidate (a) — budget as a `renderComment` parameter — is
  adopted, but it only says _how the number arrives_; this contract is the
  missing half that says where it comes from.
- Pure.

### `selectDisplayed(changed, cap)` / `renderComment(...)`

- Input: the changed list, **the displayed records and the published blob
  names** (both produced by the caller's single `planComment` call — see below),
  the unchanged and failed-without-diff counts, **the budget (`number | null`)**,
  the pushed commit SHA, the repo slug. The budget is an input and never a literal
  in this module: a comment that confidently asserts a budget it did not read
  would reproduce this run's own motivating incident (#4496 silently changed
  `maxDiffPixelRatio: 0.01` to `maxDiffPixels: 300`) inside the fix for it.
- Ordering: **descending pixel count; `pixels: null` first; ties broken by
  snapshot name** so the output is deterministic. Nulls lead because a size
  mismatch or a missing baseline is both the most alarming outcome and the
  least self-explanatory. Spec order was the alternative and loses: the cap
  means some snapshots are dropped, and dropping the largest mover to keep an
  alphabetically earlier three-pixel drift inverts the comment's whole purpose.
- **One derivation of the displayed set, at the push site.** _Corrected
  2026-08-25 after review; `renderComment` originally re-ran `selectDisplayed`
  with a `cap` parameter of its own._ The publisher's `planComment({ changed,
artifactDir })` returns `{ displayed, files, publishedBlobs }` in one call:
  the records shown, the blobs pushed for them, and the names the comment may
  address. `renderComment` consumes `displayed` and `publishedBlobs` and selects
  nothing — a cap chosen in the comment module and a cap chosen at the push site
  are two derivations of one fact, and every way they can disagree (a different
  cap on either side, an image the artifact did not carry) renders `<img>` tags
  for blobs that were never published. An image cell whose blob is outside
  `publishedBlobs` renders `—`, the same as an image the run never wrote.
- **The existence guard is a parameter, not an afterthought.**
  `plannedImageFiles(displayed, artifactDir, exists = existsSync)` drops an
  image the report names but the downloaded artifact does not carry. It used to
  be a `.filter()` applied in `main()` after the function returned, which put it
  outside every test.
- Cap: `MAX_IMAGE_ROWS = 6`, an exported constant in the module (the shape
  `branch-cleanup.mjs` uses for `AGE_FLOOR_DAYS`), not an env var. Six rows at
  `width=250` is roughly two screens, and six of 49 is a large enough sample to
  separate "everything shifted a pixel" from "one component broke". The PRD
  parks image sizing and legibility for Verify to settle empirically; a named
  constant is the one-line edit that settles it.
- Output: the full comment body — marker, `## 🖼 Visual regression — X of 49
changed`, up to six `### name (N px over <budget> budget)` sections each with
  the three-column table — `<budget>` is the value the caller passed, `300`
  today, never a literal in this module — then a complete plain-text list of
  the remaining changed snapshots with their names and counts, then the
  `<sub>` footer naming the
  unchanged count and `rialto-web-visual-diffs`. When `failedWithoutDiff` is
  non-zero the footer says so out loud — the three counts do not add up to
  `total` otherwise, and silently dropping the difference is what let a
  hard-failing spec read as a pass. The cap bounds images; the
  text is exhaustive (SC-2 and SC-6 together — see frontmatter assumption).
- **When the budget is `null`**, every heading and every overflow line drops
  the budget clause — `### name (N px changed)` — and the footer states that
  the budget could not be read from the run's Playwright config. The module
  never substitutes a default. This is the rule already governing
  `pixels: null`, applied to the other number: say less, never guess. SC-2's
  "against the budget" is satisfied whenever the budget is readable, which is
  every state the repo is actually in; the degraded form exists so that an
  unreadable config yields a truthful comment instead of a false one.
- Pure.

### `decideCommentAction({ existingBody, runOrdinal, visualFailed })`

_Replaces the draft's `shouldReplaceComment(existingBody, runOrdinal)` in the
2026-08-25 revision. Renamed because the guard now covers the delete path too,
and a predicate consulted by both branches must not be named after one of them._

- Input: the standing comment's body (or `null` when the PR carries none), this
  run's ordinal `[run_id, run_attempt]`, and whether the `visual` job failed.
- Output: one verb — `"post" | "patch" | "delete" | "skip"` — which the thin
  caller executes without deciding anything. A boolean cannot carry this: the
  caller would have to distinguish "no comment to clear" from "a newer run owns
  the comment", and that is policy landing in the one module that holds none.
- Why the guard exists at all: `rialto-web-e2e.yml` declares no `concurrency:`
  group, so two runs for one PR can overlap and the older one can finish last.
  Refs are immune by construction (each run writes its own); the comment is the
  one shared cell — so the guard lives exactly there, and it must cover _every_
  write to that cell, deletion included. An unguarded delete lets an older
  passing run remove a newer failing run's comment, leaving a live visual
  failure with no comment at all: the same interleaving, the same feature
  broken, in the opposite direction and with no symptom.
- **The ordinal rule — one comparison, both branches.** Ordinals compare
  lexicographically on `[run_id, run_attempt]`. A run may act on the standing
  comment iff its own ordinal is **≥** the standing marker's; it declines only
  when the marker records a **strictly newer** ordinal. `≥` rather than `>` so
  a re-executed publisher step within one attempt can still correct its own
  comment. There is no second candidate ordinal for the delete path: a delete
  is not "remove the comment my run wrote", it is "this run's verdict is the
  latest word about this PR" — the same question the patch asks.

| standing comment                   | `visual` failed | `visual` passed           |
| ---------------------------------- | --------------- | ------------------------- |
| absent                             | `post`          | `skip` — nothing to clear |
| ordinal ≤ ours                     | `patch`         | `delete`                  |
| ordinal strictly newer             | `skip`          | `skip`                    |
| marker present, ordinal unparsable | `patch`         | `skip`                    |

- **Every `skip` is noted, never silent.** The caller writes a job-summary line
  naming this run's ordinal and the standing comment's, so "the comment on this
  PR belongs to a newer run" is readable without archaeology. Silence is what
  made the delete path's version of this bug invisible in the first place, and
  a note costs one line in a job nothing depends on.
- **The one asymmetry, and why it is not a symmetry failure.** An unparsable
  marker means the standing comment's age is unknowable, and the two branches'
  wrong answers are not equally bad: a wrong `patch` leaves stale failure
  content on the PR — visible, and repaired by the next run of either outcome —
  while a wrong `delete` leaves a live failure with no comment, the exact state
  this feature exists to eliminate and one nothing announces. The
  readable-ordinal rule is fully symmetric; only the unreadable case resolves
  toward the recoverable outcome.
- **Residual, stated rather than hidden.** A successful `delete` removes the
  only record of an ordinal on the PR, so a slower _older_ run finishing
  afterwards with a failure sees `absent` and posts. Bounded and self-healing —
  the next run of either outcome corrects it — and the alternative (leaving a
  marker-only tombstone comment instead of deleting) reintroduces exactly the
  permanent "no visual changes" comment the delete decision already rejected.
- Assumes GitHub allocates run ids in increasing order. If that ever fails, the
  effect is a stale comment standing until the next run replaces it — strictly
  no worse than today's behaviour, so the guard fails safe.
- Pure.

### Artifact handoff, `visual` → publisher

- Input: two artifact names from the same workflow run —
  `rialto-web-visual-diffs` (already produced today, read-only to this feature)
  and the small JSON-report artifact.
- Output: `test-results/**` on the publisher's disk, containing every
  `-expected` / `-actual` / `-diff` PNG the report names.
- Failure modes: either artifact absent (the `visual` job died before writing,
  or the `continue-on-error` report upload failed) → the publisher no-ops with a
  job summary note. Never a hard failure: an absent artifact means there is
  nothing to say, not that something is wrong.
- Timeout / retry: owned by `actions/download-artifact`, which retries
  internally; same-run artifacts need no extra token scope.

### `git push origin <commit>:refs/heads/visual-diffs/pr-<N>/run-<id>-attempt-<n>`

- Input: an orphan commit built with plumbing (`hash-object` → a temporary
  `GIT_INDEX_FILE` → `write-tree` → `commit-tree`) so the runner's working tree
  and index are never touched. Credentials come from the publisher job's own
  `actions/checkout` (this repo does not set `persist-credentials: false` on
  the e2e workflow's checkouts).
- Output: the commit SHA, which is the only thing the comment needs.
- Failure modes: a push failure fails the **publisher** job only. `CI Gate`'s
  `needs` list contains only `ci.yml` jobs — measured, `ci.yml:750-766` — so no
  required check moves, and the `visual` job has already concluded (SC-7).
- Timeout: set one explicitly on the step; `git` has no default and a hung push
  would otherwise burn the job's full budget.
- Retry: **safe, but only because the name carries the run _attempt_.**
  _Corrected 2026-08-25 after review; the original claim — that the run id
  alone made a retry a no-op or a fast-forward — is false for a re-run._
  GitHub keeps `GITHUB_RUN_ID` stable across "Re-run failed jobs" and
  increments `GITHUB_RUN_ATTEMPT`, and the second attempt builds a **different**
  commit even from a byte-identical tree, because `commit-tree` stamps the
  committer timestamp. A name built from the run id alone therefore makes
  attempt 2's push a non-fast-forward rejection — unfixable without `--force`,
  which is banned — so the publisher exits 1 and the comment keeps attempt 1's
  images, defeating SC-4. With the attempt in the name, each attempt owns its
  own ref: a re-executed publisher _step_ within one attempt re-pushes its own
  commit (a no-op), and a genuine re-run writes somewhere new. `--force` is
  never used and must not be introduced; force-pushing reintroduces exactly the
  lost-update hazard this naming scheme removes.

### GitHub comment upsert / delete

- Input: PR number, rendered body (or the instruction to clear).
- Output: one comment on the PR, or none.
- Both outcomes take the same two steps: find by marker **and author**, then
  execute whatever verb `decideCommentAction` returns. The caller never branches
  on the marker itself.
- **The author clause is an authorization check, added 2026-08-25 after review;
  the marker prefix alone is not one.** `preview-deploy.yml`'s sticky-comment
  idiom — which this design originally cited as precedent — selects on body text
  only. That is safe for a body nobody gains anything by forging; it is not safe
  here. This repo is public, so any account that can comment can post
  `<!-- visual-diffs-in-pr run=99999999999999 attempt=99 -->`, and an
  author-blind lookup adopts it: `decideCommentAction` then reads an ordinal no
  real run can exceed and returns `skip` for every later run, failing and
  passing alike, leaving one skip note inside a green job as the only trace. The
  decision lives in the pure, unit-tested `isStandingComment(comment)` rather
  than inside a `jq` `select`, because a `jq` expression is not reachable from a
  test.
- On `visual` **failure**: PATCH the standing comment, POST when there is none,
  or skip with a job-summary note when a newer run owns it (SC-4).
- On `visual` **success**: DELETE the standing comment, or skip with a
  job-summary note when there is none to clear or a newer run owns it (SC-5).
  Deleting beats replacing with a green note: a passing suite has nothing to
  say, and a permanent "no visual changes" comment is the noise this feature
  exists to avoid.
- Failure modes / retry: the read and the PATCH are idempotent and may be
  retried. **The POST must not be retried** — a failed POST that actually
  landed would double-post, and two walls of images is a worse outcome than
  none; the next run's marker lookup repairs it.
- Timeout: `gh`'s default is acceptable here; a hung call fails the publisher
  job and nothing else.

### Retention: `selectRefsToDelete({ refs, openPrNumbers, now, minAgeHours })`

The rule, in three clauses, each with the thing it protects:

1. **Keep** the newest ref of each _open_ PR — it is what that PR's standing
   comment points at. "Newest" is the tuple `[run_id, run_attempt]`, the same
   ordering `decideCommentAction` uses: a re-run keeps the run id and moves only
   the attempt, so a run-id-only comparison cannot tell a re-run's live ref from
   its superseded one. A ref whose ordinal is not a pair of integers does not
   parse at all, and an unparsable name is never selected (clause 3's
   fail-safe) — the earlier permissive `run-([0-9A-Za-z._-]+)` let `Number()`
   produce `NaN`, and `NaN === NaN` being false deleted the only ref of an open
   PR.
2. **Keep** any ref younger than `minAgeHours` (24) — its run may still be
   in flight, with its comment not yet written.
3. **Delete** everything else — superseded runs on open PRs, and every ref of
   every closed or merged PR.

Consequences, stated so they can be checked: growth is bounded by _(open PRs +
one day of churn)_; a closed PR reclaims within a day; and no ref a standing
comment depends on is ever deleted, which is the invariant the data model
names. A flat age floor was the alternative and loses on correctness — a PR
open longer than the floor would have its own images deleted out from under a
live comment, breaking SC-3.

Caller runs daily. Deleting an already-absent ref is treated as success, so the
sweep is idempotent and safe to re-run.

**The verdict is rendered from outcomes, and a failed deletion reds the job.**
_Corrected 2026-08-25 after review._ The runner used to render its summary from
the **plan**, before and independently of the delete loop, so a remote that
rejected every `git push --delete` still produced a summary claiming a clean
sweep and an exit code of 0 — the same defect class as the epoch bug above, in
the reporting layer instead of the rule. `formatSweepSummary(plan, dryRun,
outcomes)` now takes what actually happened, reports a planned deletion with no
outcome as `NOT ATTEMPTED` rather than omitting it, and `sweepExitCode` returns
non-zero when any deletion failed. A sweep that cannot delete is precisely the
unbounded growth this rule exists to prevent, and a green job reporting it is
worse than no job at all, because nothing would look again.

## Trigger hygiene and anti-recursion

The push must not start CI runs, and must not touch `CI Gate`. Measured over
every file in `.github/workflows/`: **every `push:` trigger in this repo is
scoped to `branches: [main]`**, and there are no `create:` or tag triggers at
all. A ref named `visual-diffs/pr-<N>/run-<id>-attempt-<n>` cannot match any
of them.

That is a fact about the repo today, not a property of the design, so it gets a
guard in the shape this repo already uses for exactly this class
(`ci-node-matrix.test.mjs`, `drift-fix-workflow.test.mjs`): a unit test that
reads every workflow file and fails if any `push:` branch filter could match
the `visual-diffs/` prefix. Without it, a later `push: branches: ['**']` would
silently turn every failing visual run into a CI storm.

**The guard normalises every shape `on:` can take, and fails closed on the rest.**
_Corrected 2026-08-25 after review._ The first version recognised `push:` only
as a block key at exactly two spaces of indentation under an empty-valued `on:`,
which is one of at least five legal spellings — a flow sequence
(`on: [push, pull_request]`), a bare scalar (`on: push`), a block sequence
(`on:` / `- push`), a per-trigger flow mapping (`push: { branches: ['**'] }`) and
any other indentation all returned **no violations**, i.e. the guard passed the
exact hazard it exists for. It now normalises `on:` to a `name -> config` map
across all of those, reads branch filters from block lists, flow lists and
scalars alike, and treats a shape it cannot read — a YAML alias, a top-level
flow mapping, an unrecognised line — as a **violation rather than an absence**.
Two non-vacuity tests keep the repo-wide scan honest: zero workflows may parse
as unreadable, and the scan must find `push:` triggers in more than five of
them, so an empty violation list cannot mean "parsed nothing".

The normalisation is textual, not `js-yaml`. `@mbe/scripts` declares no YAML
dependency, and `pnpm-lock.yaml` is a turbo `globalDependencies` entry — adding
one cache-busts every task in the monorepo (gotchas.md § CI) for a parser this
guard can do without. The cost of that choice is that the normaliser must be
exhaustive about spellings and pessimistic about the rest, which is what the
fail-closed rule and the two non-vacuity tests buy.

The documented `GITHUB_TOKEN` anti-recursion behaviour (gotchas.md § CI) is a
second, independent reason a `GITHUB_TOKEN`-authored push here fires nothing.
It is noted as reinforcement, not relied on — the ref namespace and the guard
test are the actual defence.

## Stack & dependencies

- **GitHub Actions + Playwright 1.62.1 + Node 22** — fixed by the brief. No new
  service, no new secret; the only credential is the workflow's own
  `GITHUB_TOKEN`.
- **Playwright's built-in `json` reporter** — the only machine-readable view of
  a run this repo can get without writing a custom reporter. Cost is its
  interface, and the interface is narrow: two modules read it, behind one pure
  parse function, so a future Playwright format change lands in one file.
- **`raw.githubusercontent.com`** — verified, not assumed: a plain commit SHA
  and a commit reachable only from a non-`main` branch both return `200` with
  `content-type: image/png`, unauthenticated (checked against this repo, with
  `dig @1.1.1.1` cross-checked against the local resolver per the documented LAN
  sinkhole trap). This is what makes SC-3 satisfiable at all.
- **`actions/download-artifact`** — already used and SHA-pinned in
  `preview-deploy.yml`; reuse that pin. All third-party actions stay pinned by
  full commit SHA.
- **`git` plumbing over the Git Data API** — the images are already on the
  runner's disk; plumbing avoids base64-encoding them through ~15 REST calls.
- No new runtime dependency of any kind. `pngjs` is not needed: the pixel count
  comes from Playwright, and computing it ourselves would be a second,
  divergent source of truth for the number the comment asserts.

Every `run:` block whose exit code is the point opens with `set -o pipefail`
(`preview-deploy.yml:111` is the in-repo reference) — GitHub's default shell is
`bash -e` with no pipefail, and the marker-lookup step pipes through `head`.

## Decisions & alternatives

- **Separate publisher job** over doing the work in the `visual` job — the
  latter needs `contents: write` on a job executing PR-authored build and test
  code, and puts new failure modes on the conclusion SC-7 freezes.
- **Immutable per-run refs** over one force-pushed ref — force-push orphans the
  commit an already-standing comment points at, so the interleaving
  _push B, push A, comment B_ leaves a live comment whose images have been made
  unreachable. Immutable naming removes the race instead of surviving it.
- **URLs by commit SHA** over URLs by ref name — a SHA is immutable and
  unambiguous, and a ref name containing `/` cannot be told apart from the path
  in a `raw.githubusercontent.com` URL.
- **Push all three images** over linking the baseline at `github.sha` — the
  baseline is already public and already committed, but linking it needs a
  second URL scheme and depends on `raw` serving a pull-request _merge_ commit,
  which is unverified. One uniform scheme, at a bounded 18 files per run.
- **Cap image rows, enumerate every changed snapshot in text** over capping
  both — capping the text would make SC-2 unsatisfiable exactly when it matters
  most. Text is nearly free; images are not.
- **Order by descending pixel count** over spec order — with a cap in play,
  the dropped snapshots should be the ones nobody needs to look at.
- **Budget read at publish time from the config the run loaded** over a
  constant in the comment module, with or without a drift test — the number the
  comment asserts is then the number the run enforced, from the same file, so a
  #4496-style tolerance change moves the comment automatically instead of
  leaving it confidently wrong about the one value this whole run exists
  because nobody noticed. Verified that neither the JSON report nor the matcher
  message carries it, so the config file is the only non-duplicating source.
- **One staleness guard over post, patch and delete** over guarding only the
  write paths — an unguarded delete lets an older _passing_ run remove a newer
  _failing_ run's comment, leaving a live visual failure with no comment: the
  same interleaving `shouldReplaceComment` was introduced for, arriving on the
  other branch and failing silently instead of visibly.
- **Scheduled sweep in its own workflow** over extending `branch-cleanup.yml` —
  that workflow's scheduled runs are hard-wired to `DRY_RUN=true`, so a sweep
  added there would never actually delete anything.
- **`--reporter=github,json` on the CLI** over adding the reporter to
  `playwright.config.ts` — the config is shared with the `functional` job and
  the `test:a11y` script; the flag scopes the change to one invocation. Note
  that `rialto-web-e2e.yml`'s header comment currently asserts the `visual`
  job's "invocation and artifact are unchanged from before"; the invocation
  half stops being true and the comment needs updating with the change.
- **Refs under `refs/heads/visual-diffs/…`** over a custom namespace such as
  `refs/visual-diffs/…` — a custom namespace could not match a `branches:`
  filter by construction and would stay out of the branch list, but its
  pushability under `GITHUB_TOKEN` is unverified, whereas `refs/heads/` is
  certain and its trigger-safety here is measured. The ref path is a single
  constant in `visual-diff-refs.mjs`; probing the custom namespace during
  Implement is a cheap, contained improvement.
- **Fork PRs no-op with a job-summary note** over any fallback delivery —
  measured: no fork PRs in the last 50. Recorded as an assumption above.

## ADRs

None — no decision met the bar. The load-bearing choices here are each cheap to
reverse (the ref namespace is one constant; the cap is one constant; the
publisher job is additive and deletable), confined to one workflow and four
scripts, and surprising only in ways the inline notes above already explain.
`docs/adr/` is reserved for decisions that constrain the whole repo, which none
of these do.
