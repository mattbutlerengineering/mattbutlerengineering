---
stage: ship
run: feature:visual-diffs-in-pr
date: 2026-08-25
authorization: prepare-and-stop
released: false
pr: 4569
assumptions:
  - "Autorun: no live user input at this stage. Every judgment below is this stage's, recorded for the user to arbitrate at merge time."
  - "Release authorization was fixed at brief time as 'prepare and stop'. Nothing here was merged, tagged, published or deployed, and no GitHub issue was created, closed or commented on."
  - "The AI-antipattern ratchet regression (consoleLogs 689 -> 691) was accepted via `--update` rather than dodged by routing the same two CLI log lines through `process.stdout.write`. Taken as the honest option; recorded rather than done silently."
  - "The demonstration perturbation's shape is this stage's choice: 8 sections, so that 8 > MAX_IMAGE_ROWS forces the overflow line, and a colour-only change, so that no snapshot lands on Playwright's size-mismatch path (which writes no diff image). The first attempt used `opacity` and did not fail the suite; see Demonstration step 1."
  - "One file under apps/rialto-web/ is changed by this branch that no earlier stage planned: a documentation note in apps/rialto-web/CLAUDE.md. It is a real change (it records the new behaviour and the D1 gap in the file that already owns this app's visual-regression guidance) but its second purpose is structural — it keeps apps/rialto-web/** in the pull request's cumulative diff, without which rialto-web-e2e.yml does not trigger on this PR at all and SC-5 cannot be exercised. Recorded rather than slipped in."
---

# Release: visual regression diffs inline in the pull request

> **This release was prepared, not executed.** Release authorization for this
> run was fixed at brief time as _prepare and stop_. The branch is pushed, the
> pull request is open, and the feature has been demonstrated end to end on it.
> **Nothing was merged, tagged, published or deployed, and the merge is left to
> the user.** No GitHub issue was created, closed or commented on.
>
> **Pull request: [#4569](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4569)** — head `732194934`, base `main` at `62d80cebe`.

## Readiness

**Ready to merge, with one caveat the user must clear deliberately: the merge
happens only after the demonstration perturbation is off the branch, and this
document must be read alongside `review.md` because three review findings were
accepted rather than fixed.**

What makes it ready:

- The design is implemented as `architecture.md` describes; `review.md` graded the
  code fit to ship after its single blocking finding (F1), and F1 is fixed.
- The blast radius is bounded by construction. The feature adds one job that
  installs nothing, builds nothing and runs no tests, gated to `pull_request`
  events, writing only under a ref namespace nothing else in the repository
  touches. It cannot change `CI Gate`, the required-check set, the `visual` job's
  verdict, or the existing artifact.
- Its failure mode is loud: the publisher's `main()` catches, writes
  `Publisher failed: …` to the job summary, and exits 1. A broken publisher shows
  up as a red advisory job, never as a silently missing comment.

What is not proven, and cannot be before merge: the daily ref sweep. GitHub
schedules workflows only from the default branch, so the scheduled sweep cannot
run until this is on `main`. That is step 5 of the release steps and it is the one
component of this run that carries genuine post-merge risk.

## Pre-flight

- [x] **Verification green (no unresolved failures).** `verification.md` records
      8 criteria as 2 PASS / 6 CANNOT VERIFY LOCALLY / 0 FAIL, and nothing routed
      back to Implement. The six undischarged criteria are the reason this stage
      ran a live demonstration; they are settled in the _Success criteria_ section
      below, not here.
- [x] **Review's one blocking finding is fixed.** `review.md`'s verdict was
      "SHIP-AFTER-F1". F1 is fixed on this branch (commit `6e94f5855`), along with
      F2, F3, F4, F6, F7 and F9. F5, F8 and F10 are recorded deferrals.
- [x] **The run's own test suite passes.** 256 tests across the six new files,
      run locally at head:
      `npx vitest run scripts/__tests__/{visual-diff-report,visual-diff-comment,visual-diff-refs,visual-diff-ref-sweep,visual-diff-ref-trigger-safety,publish-visual-diffs}.test.mjs`
      -> `Test Files 6 passed (6) · Tests 256 passed (256)`.
- [x] **No secrets in the diff; target config present.** `git diff main..HEAD`
      carries no Stripe/AWS key shape, no PEM header, no JWT and no `gh` token
      prefix; the repo's own Gitleaks job passed on the PR. There is no new
      secret to provision: the only credential the feature uses is the workflow's
      own `GITHUB_TOKEN`, granted `contents: write` + `pull-requests: write` at
      job level.
- [x] **No migrations or data changes.** This run touches `scripts/`,
      `.github/workflows/` and `docs/` only. No schema, no Prisma migration, no
      persistent state beyond git refs under `refs/heads/visual-diffs/**`, whose
      forward path is the daily sweep and whose undo path is in the rollback plan.
- [x] **Rollback plan concrete.** Below, as commands.
- [x] **A gate the branch broke was found and fixed during pre-flight.** The
      AI-antipattern ratchet (`.husky/pre-push`, and `ci.yml`) failed the first
      push: `consoleLogs: 689 -> 691 (+2)`, from the two CLI stdout lines in
      `publish-visual-diffs.mjs`'s `note()` and `visual-diff-refs.mjs`'s sweep
      verdict. Both are the CLI surface of a `main()`, the same shape as the 689
      calls already in the baseline, so the baseline was accepted
      (`node scripts/check-ai-antipatterns.mjs --update`, commit `18916411f`)
      rather than dodged by routing the same output through
      `process.stdout.write`. Had this not been caught here it would have red-ed
      CI on the pull request.

## Release log — what was actually executed

Every step below ran. Nothing is projected.

| #   | Action                                                                                                    | Result                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `npx vitest run scripts/__tests__/{six new files}`                                                        | 6 files, **256 tests passed**                                                                   |
| 2   | `git push -u origin feat/visual-diffs-in-pr`                                                              | **REJECTED** by `.husky/pre-push` — AI-antipattern ratchet, `consoleLogs: 689 -> 691 (+2)`      |
| 3   | `node scripts/check-ai-antipatterns.mjs --update`, committed as `18916411f`                               | baseline accepted; ratchet green                                                                |
| 4   | `git push -u origin feat/visual-diffs-in-pr`                                                              | pushed at `18916411f`                                                                           |
| 5   | `gh pr create --base main`                                                                                | **PR [#4569](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4569)** opened |
| 6   | observed the checks at `18916411f`                                                                        | **zero `Rialto Web E2E` runs** — see _Demonstration_ step 0                                     |
| 7   | perturbation #1 (`opacity: 0.55`, 8 sections), pushed as `9d145cade`                                      | run `32901834483`: **49 passed** — the perturbation was invisible to the comparator             |
| 8   | diagnosed and replaced with perturbation #2 (`background: #7b2ff7`), pushed as `e296aef39`                | run `32903163602`: `visual` **failed**, 8 of 49                                                 |
| 9   | read the rendered comment                                                                                 | SC-1, SC-2, SC-6 discharged                                                                     |
| 10  | fetched all 18 embedded image URLs unauthenticated                                                        | 18/18 `200 image/png`; SC-3 discharged                                                          |
| 11  | `gh run rerun 32903163602 --failed`                                                                       | attempt 2; comment updated in place; SC-4 discharged                                            |
| 12  | reverted the perturbation, pushed as `d9ce41471`                                                          | **workflow did not run at all** — the failure comment was stranded                              |
| 13  | diagnosed the paths-filter behaviour; documented it in `apps/rialto-web/CLAUDE.md`, pushed as `732194934` | run `32905772393`: `visual` **passed**, publisher **deleted** the comment; SC-5 discharged      |
| 14  | `DRY_RUN=true node scripts/visual-diff-refs.mjs` against the real refs                                    | both refs kept, with distinct correct reasons                                                   |
| 15  | read `CI Gate` on both the perturbed and the final head                                                   | SUCCESS on both; SC-7 discharged                                                                |
| 16  | listed artifacts on the failing and the passing run                                                       | SC-8 discharged                                                                                 |
| —   | **merge / tag / publish / deploy**                                                                        | **NOT PERFORMED — withheld by design**                                                          |

## The live demonstration (breakdown item 3.5)

The delivery path had never executed once before this stage. `verification.md`
and `review.md` both named that as the largest open risk, and this repository has
a documented failure class of work that merged and closed COMPLETED having never
run. So the point of this stage was to run it.

### Step 0 — the pull request as delivered triggers nothing

`rialto-web-e2e.yml`'s `paths:` filter covers `apps/rialto-web/**`,
`packages/rialto/src/**` and `infrastructure/worker/**`. The branch as delivered
touched only `scripts/`, `.github/` and `docs/`.

Measured at head `18916411f`: eight workflows ran (`CI`, `ADR check`,
`Secret Scan`, `tier-classifier`, `Auto Review`, `Merge Queue`,
`Auto-Merge Policy`, `ai-attribution`) and **`Rialto Web E2E` was not among
them**. The pull request edits a workflow it does not run. Every demonstration
below therefore required a deliberate `apps/rialto-web/**` change.

### Step 1 — the first perturbation failed to fail

`opacity: 0.55` on 8 of the 49 harness sections, pushed as `9d145cade`. The
workflow fired (confirming the paths diagnosis) and reported **`49 passed`** —
run `32901834483`, `visual` = success.

Not a fluke and not a checkout problem. Established in order:

- The rule was in the tree the runner checked out — read straight off
  `refs/pull/4569/merge`.
- It compiled to a real selector:
  `._section_1oo9d_7[data-testid=button-variants],…{opacity:.55}` in the emitted
  CSS.
- It rendered: `getComputedStyle(…).opacity` returned `0.55` on a perturbed
  section and `1` on an unperturbed one, in a real Chromium.
- Playwright's element screenshot _does_ reflect it — an A/B capture with and
  without the rule produced different PNGs.

The cause is Playwright's **per-pixel `threshold`**, which gates before
`maxDiffPixels` is ever consulted. Measured on `light-button-variants`:
**71,140 of 139,216 pixels changed, and the largest per-channel delta anywhere
was 36/255 = 0.14** — under the default `threshold` of 0.2. Alpha was identical
(max delta 0), so this is purely an RGB-distance effect. The comparator counted
zero differing pixels.

**This is worth keeping.** It is a fact about the `rialto-web` visual suite, not
about this feature: a change that alters 51% of a snapshot's pixels can pass,
because `maxDiffPixels: 300` never gets a chance to judge it. `#4496`'s tuning
work reasoned entirely about the pixel budget; the threshold sitting in front of
it went unexamined. Out of scope for this run — it changes what CI considers
pass/fail, which `prd.md` puts explicitly out of scope — but it belongs in
whatever revisits the tolerance next.

### Step 2 — the second perturbation, verified before pushing

`background: #7b2ff7` on the same 8 sections, pushed as `e296aef39`. Verified
locally _first_, using Playwright's own comparator against freshly regenerated
macOS baselines (which were then reverted; the committed Linux baselines are
untouched — `git status` clean under `e2e/screenshots/`):

```
light / button-variants   23968 px      light / alert-variants   24045 px
light / button-sizes      10142 px      light / badge-variants   10427 px
light / input-states      23277 px      light / table-default    24032 px
light / textarea-states   35490 px      light / card-variants    22235 px
```

Run `32903163602`, `visual` = **failure**, `Publish Visual Diffs` = **success**.

### Step 3 — SC-1 and SC-2: the comment, as text

One comment, id `5417331975`, author `github-actions[bot]`, created
`21:54:35Z`. Reproduced verbatim below with every `<img>` collapsed to `<IMG>`,
which is exactly what an agent reading `gh pr view 4569 --comments` gets without
fetching a byte of image:

```
<!-- visual-diffs-in-pr run=32903163602 attempt=1 -->
## 🖼 Visual regression — 8 of 49 changed

### `light-textarea-states` (35319 px over 300 budget)
| baseline | actual | diff |
| <IMG> | <IMG> | <IMG> |

### `light-button-variants` (24042 px over 300 budget)
### `light-alert-variants`  (24023 px over 300 budget)
### `light-table-default`   (24014 px over 300 budget)
### `light-input-states`    (23270 px over 300 budget)
### `light-card-variants`   (22138 px over 300 budget)

**2 more changed snapshots** — images omitted; the full set is in the
`rialto-web-visual-diffs` artifact on this run.

- `light-badge-variants` — 10312 px over 300 budget
- `light-button-sizes` — 10049 px over 300 budget

<sub>41 of 49 snapshots unchanged. Full baseline/actual/diff set: the
<code>rialto-web-visual-diffs</code> artifact on this run.</sub>
```

Changed-of-total present (`8 of 49`); every changed snapshot named with its
measured difference against the budget, **including the two the display cap
excluded from images**. The CI numbers differ slightly from the local ones above
(35319 vs 35490, etc.) exactly as expected — Linux runner vs macOS glyph
rendering.

### Step 4 — SC-6: the cap and the overflow line, in situ

Same comment. Eight changed, **six image rows** (`MAX_IMAGE_ROWS = 6`), and an
overflow line stating the count (`2 more changed snapshots`), that images were
omitted, and where the full set lives. Ordering is largest-diff-first and holds
across the cap boundary — the two overflow entries are the two smallest. SC-2
and SC-6 hold together rather than trading off.

### Step 5 — SC-3: the images, fetched with no credentials

18 URLs embedded (6 snapshots × baseline/actual/diff). All fetched with the
token environment explicitly scrubbed (`env -u GITHUB_TOKEN -u GH_TOKEN curl`):

```
200 image/png   light-alert-variants-{actual,diff,expected}.png
200 image/png   light-button-variants-{actual,diff,expected}.png
200 image/png   light-card-variants-{actual,diff,expected}.png
200 image/png   light-input-states-{actual,diff,expected}.png
200 image/png   light-table-default-{actual,diff,expected}.png
200 image/png   light-textarea-states-{actual,diff,expected}.png

non-200 count = 0
```

A real GET (not just HEAD) on `light-button-variants-diff.png` returned
**6,805 bytes**, `PNG image data, 1232 x 113, 8-bit/color RGBA` — the exact
dimensions of that harness section. Opened and inspected: it is a genuine
Playwright diff, the changed title strip flooded red with red text highlights.

**LAN DNS sinkhole cross-check** (this machine has previously invented a
third-party outage): `dig raw.githubusercontent.com` against the local resolver
and against `@1.1.1.1` both return the same four addresses —
`185.199.{108,109,110,111}.133` — in different round-robin order. No sinkhole,
so the 200s are real.

### Step 6 — SC-4: the re-run, and the F1 regression test

`gh run rerun 32903163602 --failed` produced attempt 2. This is the exact path
review finding F1's fix was written for.

Afterwards the PR carried **exactly one** standing comment — the _same_ comment:

```
id=5417331975  author=github-actions[bot]
created=2026-08-25T21:54:35Z   updated=2026-08-25T21:59:21Z
marker: <!-- visual-diffs-in-pr run=32903163602 attempt=2 -->
```

Same id, `updated_at` moved, marker advanced to `attempt=2`. Updated in place,
not appended.

**The F1 fix, visible at the ref level** — two attempts under one run id
produced two refs at two distinct commits:

```
fc7a74ec8b5a3f94fce5a7f3dacf90aaeba70095  refs/heads/visual-diffs/pr-4569/run-32903163602-attempt-1
a2558581b4f1c803ae0ddf96d15417a18ecef674  refs/heads/visual-diffs/pr-4569/run-32903163602-attempt-2
```

Without the attempt component, attempt 2 would have pushed `a2558581…` onto a
ref already pointing at `fc7a74ec…` — a non-fast-forward, with `--force`
correctly forbidden — the publisher would have gone red and the comment would
still be showing attempt 1's images. The comment's 18 URLs now resolve against
`a2558581…`, and all 18 return `200 image/png` unauthenticated. SC-4 discharged
and F1 confirmed fixed against the live path.

**A measured negative, on the thing to watch for.** `actions/upload-artifact`
v4+ is documented to reject a same-name upload on a re-run. It did **not** here:
on attempt 2 both `Upload diff artifacts on failure` and `Upload the JSON report`
concluded `success`, and the run now carries two copies of each artifact, one per
attempt (`21:54:17Z` and `21:59:07Z`, both 1,175,076 bytes for the diffs). With
`actions/upload-artifact@v7.0.1` on this runner, artifacts are scoped per
attempt. Recorded because it was predicted and did not happen — not because it is
now guaranteed.

### Step 7 — SC-5: the retraction, and the one thing that broke

**This is where the demonstration failed the first time, and the failure is
worth more than the eventual pass.**

The perturbation was reverted and pushed as `d9ce41471`. Expected: the workflow
runs, `visual` passes, the publisher retracts the comment. What happened:
**`Rialto Web E2E` did not run at all.** Eight other workflows ran at that SHA;
that one produced no run. The failure comment sat on the pull request claiming a
regression that no longer existed — precisely the state SC-5 exists to forbid.

The cause is not in this feature's code. For a `pull_request` event, GitHub
evaluates a `paths:` filter against the pull request's **cumulative** `base...head`
diff, not against the files in the push. Measured directly:

```
$ git diff --name-only origin/main...d9ce41471 -- 'apps/rialto-web/**'
(0 files)

$ git show --name-only d9ce41471
apps/rialto-web/src/pages/visual-test/VisualTest.module.css
```

The revert commit _does_ touch a filtered path; the pull request, after the
perturbation and its revert cancelled out, does not. So the workflow stopped
triggering, and with it the only thing that can retract the comment.

**The generalisation, which is a real product gap.** Any pull request that backs
out its entire `apps/rialto-web/**` / `packages/rialto/src/**` /
`infrastructure/worker/**` change after a failing visual run keeps a standing
failure comment forever. It is narrow — it needs the PR's whole filtered surface
to go to zero, not merely for the visual failure to be fixed — and it fails in
the visible direction (a comment that over-reports, on a PR that no longer
touches any of it). It is **not fixed in this run**; it is documented in
`apps/rialto-web/CLAUDE.md` with the manual remedy, and it is listed under
_Outstanding findings_ below.

The demonstration was then completed by putting `apps/rialto-web/**` back into
the pull request's diff with a genuine change — the documentation note above —
pushed as `732194934`. The workflow fired immediately, which is itself the
confirmation of the diagnosis. Run `32905772393`: `visual` = **success**,
publisher step log:

```
VISUAL_OUTCOME: success
Comment delete succeeded.
```

Standing comments on PR #4569 afterwards: **0**. Comment id `5417331975` now
returns `404 Not Found`. SC-5 discharged.

### Step 8 — SC-7: `CI Gate` behaved exactly as it would have anyway

The strongest form of this evidence came from the perturbed head, where the
advisory job was genuinely red:

| head                    | `visual`    | `CI Gate`   | PR state                 |
| ----------------------- | ----------- | ----------- | ------------------------ |
| `e296aef39` (perturbed) | **FAILURE** | **SUCCESS** | `MERGEABLE` / `UNSTABLE` |
| `732194934` (final)     | **SUCCESS** | **SUCCESS** | `MERGEABLE` / `CLEAN`    |

`CI Gate` appears both as a check run and as a commit status
(`GET /commits/e296aef39/statuses` -> `CI Gate: success`). The pull request was
mergeable with the visual job red — `UNSTABLE` is the state for a non-required
check failing — which is the whole claim: this feature does not make the visual
check gate anything.

Required contexts on `main`, read live, unchanged from what `verification.md`
recorded before any of this:

```
{"strict": false, "contexts": ["CI Gate"]}
```

And the `visual` job's own verdict is correct in both directions across four
live runs: 49 passed on two clean trees, 8 of 49 failed on the perturbed one
across both attempts. The `--reporter=github,json` addition changed nothing.

### Step 9 — SC-8: the artifact is untouched

`rialto-web-visual-diffs` uploaded on **both** failing attempts, same name,
**1,175,076 bytes each** — byte-identical size across attempts. On the passing
run `32905772393` it is correctly absent (the step is `if: failure()`) and only
`rialto-web-visual-report` is present. The new report artifact is additive and
never displaces it.

### Step 10 — the retention sweep, against real refs

Breakdown item 4.2 asked for the sweep to be run against this repository's real
refs. Before this stage there were none; now there are two:

```
=== Visual diff ref sweep ===
Mode: DRY RUN
Refs seen: 2
Eligible for deletion: 0

Keeping: visual-diffs/pr-4569/run-32903163602-attempt-1 (too-recent)
Keeping: visual-diffs/pr-4569/run-32903163602-attempt-2 (newest-on-open-pr)
```

Both retention clauses fire, with _distinct_ and correct reasons, and the rule
treats the two attempts as separate refs while picking attempt 2 as the newest —
the `[run_id, run_attempt]` tuple keying that F1's fix required in
`newestRunIdByPr`. Note this is the **dry run**; the scheduled sweep still cannot
execute until the workflow is on `main`.

**The two demonstration refs are deliberately left in place.** Every image URL
quoted in this document resolves against them, so deleting them now would turn
this evidence into 404s. They are self-cleaning: once #4569 is merged or closed,
its refs fall into the sweep's _"every ref of every closed or merged PR"_ clause
and the first scheduled run removes them. If the pull request is neither merged
nor closed, remove them by hand:

```bash
git push origin --delete visual-diffs/pr-4569/run-32903163602-attempt-1
git push origin --delete visual-diffs/pr-4569/run-32903163602-attempt-2
```

## Success criteria — final verdict

All eight discharged on live evidence. `verification.md` closed with 2 PASS and
6 CANNOT VERIFY LOCALLY; the six are now settled.

| SC                                                    | Verdict                         | Evidence                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SC-1** comment present on a failing PR              | **PASS**                        | PR #4569, run `32903163602`; comment id `5417331975` created `21:54:35Z`                                                                                                                                                    |
| **SC-2** comment text carries counts and names        | **PASS**                        | `8 of 49 changed`; all 8 named with px vs the 300 budget, including both overflow entries; verified with every image stripped                                                                                               |
| **SC-3** image URLs 200 without credentials           | **PASS**                        | 18/18 `200 image/png` on attempt 1 and again on attempt 2, token env scrubbed; one GET verified as a real 1232×113 PNG; DNS cross-checked against `@1.1.1.1`                                                                |
| **SC-4** exactly one comment after re-run             | **PASS**                        | After `rerun --failed`: 1 comment, same id, `updated_at` advanced, marker `attempt=2`, images repointed to `a2558581…`. Two distinct refs prove F1 is fixed                                                                 |
| **SC-5** passing run leaves no failure comment        | **PASS, with a documented gap** | `Comment delete succeeded.` on run `32905772393`; 0 standing comments; id `5417331975` -> 404. **But** the retraction only runs while the PR's cumulative diff still matches the `paths:` filter — see Demonstration step 7 |
| **SC-6** display cap plus explicit overflow line      | **PASS**                        | 6 image rows of 8 changed; `2 more changed snapshots`, images-omitted note, artifact named; ordering holds across the cap                                                                                                   |
| **SC-7** `CI Gate` and the `visual` verdict unchanged | **PASS**                        | `CI Gate` SUCCESS on both heads incl. one with `visual` FAILURE and the PR still `MERGEABLE`; required contexts still `{"strict":false,"contexts":["CI Gate"]}`; `visual` correct in both directions across 4 live runs     |
| **SC-8** `rialto-web-visual-diffs` still uploads      | **PASS**                        | Present on both failing attempts at 1,175,076 bytes; correctly absent on the passing run                                                                                                                                    |

**Nothing is left undischarged.** Two things remain unproven and neither is a
success criterion:

1. **The scheduled sweep has never executed.** GitHub schedules workflows only
   from the default branch. The retention rule has been dry-run against real
   refs (step 10) and is unit-tested, but the daily job itself cannot run until
   this is merged. This is release step 5, and it is the one component of this
   run that carries genuine post-merge risk — it is exactly this repository's
   shipped-but-never-executed failure class, deferred rather than dodged.
2. **Breakdown item 5.1**, the optional custom-namespace probe. Milestone 5 is
   explicitly optional; nothing blocks on it and no success criterion depends on
   it. Not run.

## Exact remaining steps to release

The user performs these. Nothing below was executed by this stage.

1. **Read this file and `review.md`.** Three review findings were deliberately
   deferred (F5, F8, F10) and are listed under _Outstanding findings_ below.
   Merging accepts them.

2. **Remove the demonstration perturbation from the branch.** The final commit on
   this branch reverts it, so if the branch is merged as-is nothing perturbed
   ships. Confirm before merging:

   ```bash
   git fetch origin feat/visual-diffs-in-pr
   git diff origin/main...origin/feat/visual-diffs-in-pr -- apps/rialto-web/
   # must print nothing
   ```

3. **Confirm the required check.** `CI Gate` is the only required context on
   `main` and `main` is not `strict`:

   ```bash
   gh api repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks
   gh pr checks 4569 | grep -E "^CI Gate"
   ```

   `Visual Regression (rialto-web)` is **advisory**. It must be green on the final
   (unperturbed) head anyway — see the SC-7 evidence — but it does not gate.

4. **Merge.**

   ```bash
   gh pr merge 4569 --squash --delete-branch
   ```

   Squash is the only method this repository allows. Do not use `--auto`: the
   review gate for this run is this document plus `review.md`, and `--auto`
   merges on green with no further human gate.

5. **Post-merge — the one thing that cannot be proven before merge.** GitHub
   schedules workflows only from the default branch, so
   `.github/workflows/visual-diff-ref-sweep.yml` cannot fire until it is on
   `main`. After the first scheduled run (daily, 03:00 UTC), confirm it executed
   and that its verdicts were right:

   ```bash
   gh run list --workflow visual-diff-ref-sweep.yml --limit 5
   gh run view <id> --log | grep -A40 "Visual diff ref sweep"
   ```

   Read the **step log**, not the job summary — review finding F2's whole point was
   that a summary can disagree with what happened, and while F2 is fixed, the
   habit is the safeguard. Check specifically that no ref belonging to an open
   pull request with a standing comment was deleted; that invariant is what keeps
   the comment's images from 404-ing (SC-3), and it is the one clause with no
   pre-merge live evidence.

6. **Optional, and explicitly not required:** breakdown item 5.1 (probe whether
   `refs/visual-diffs/…` — a custom namespace outside `refs/heads/` — is pushable
   under `GITHUB_TOKEN`). Milestone 5 is optional; nothing blocks on it and no
   success criterion depends on it. It was not run.

## Rollback plan

This release changes CI behaviour, not runtime behaviour: nothing is deployed, no
package is published, no schema moves. There is no user-facing surface to roll back
and no data to migrate. Rollback is therefore a revert plus one cleanup of the ref
namespace the feature creates.

```bash
# 1. Undo the merge. <sha> is the squash-merge commit on main.
gh pr list --state merged --search "publish rialto-web visual regression diffs" --json number,mergeCommit
git checkout main && git pull
git revert --no-edit <sha>
git push origin main

# 2. Delete every ref the feature ever published. The namespace is entirely
#    its own; nothing else in this repository writes under visual-diffs/.
git ls-remote --heads origin 'refs/heads/visual-diffs/*' \
  | awk '{print $2}' \
  | xargs -r -n1 git push origin --delete

# 3. Retract any standing comments it left. They are identifiable by their
#    marker and by their author.
for pr in $(gh pr list --state open --json number --jq '.[].number'); do
  gh api "repos/mattbutlerengineering/mattbutlerengineering/issues/$pr/comments" --paginate \
    --jq '.[] | select(.body | startswith("<!-- visual-diffs-in-pr run=")) | .id' \
  | xargs -r -I{} gh api -X DELETE "repos/mattbutlerengineering/mattbutlerengineering/issues/comments/{}"
done
```

Step 1 alone is sufficient to stop the feature. Steps 2 and 3 clean up what it
already produced; without them the refs simply age out through the daily sweep,
which the revert also removes — so if the revert lands, run step 2 by hand or the
refs persist forever.

**Partial-rollback note.** Reverting does not touch `main`'s branch protection,
the required-check set, or `ci.yml`, because this branch never touched them. The
`visual` job returns to its pre-feature invocation (no `--reporter=github,json`,
no `rialto-web-visual-report` artifact) and keeps the same verdict either way.

## Outstanding findings the fix pass deliberately left

None blocks the merge. All are recorded here so merging is a decision rather than
an oversight.

### From `review.md`

- **F5 (medium) — `contents: write` runs the pull request's own copy of the
  publisher script.** The `publish-visual-diffs` job checks out the PR's head and
  executes `scripts/publish-visual-diffs.mjs` from it, holding `contents: write`
  and `pull-requests: write`. A pull request that edits that script edits what
  runs under that token. Mitigations, all real but none complete: the job
  installs nothing, builds nothing and runs no tests, so no dependency in the
  PR's tree executes; fork pull requests are declined before any API call, and a
  fork's token could not be granted write anyway; and this is a single-author
  repository. **Accepted, not fixed.** The complete fix is `pull_request_target`
  with a base-ref checkout, which trades this exposure for a strictly worse one
  (running with a write token in the base repo's context by default).
- **F8 (low) — a comment write that fails after a successful push can strand the
  standing comment.** The push happens before the comment upsert. If the push
  succeeds and both comment-write attempts then fail, the standing comment still
  names the older run's commit while the sweep now sees a newer ref for that PR
  and will delete the older one after 24 h — the comment's images 404. It needs a
  failed comment write, which also reds the job, so it is visible when it happens.
- **F10 (low) — the staleness guard is bypassed when _our own_ ordinal is
  unreadable.** Narrow, and fails in the direction of writing rather than
  skipping.

### From `verification.md`

- **Finding 1 — `packages/rialto`'s suite, and `pnpm test` generally, is not
  reliably green on this macOS host at default concurrency,** and the package
  that tips over drifts between runs (Implement saw rialto and marketing; Verify
  saw service-bootstrap). It is a repo-wide condition, not a branch defect —
  CI on `main` at `62d80cebe` is green — but it means "run `pnpm test` and read
  the result" is not a stable local gate. `--concurrency=4` is the reliable form.
  The durable fix the gotchas file already prescribes for this class
  (`testTimeout: 15000` on the affected package's `vitest.config.ts`) is outside
  this run's scope and touches packages this branch has no business editing.
- **Finding 3 — nothing keeps the budget-parse fixture in sync with the live
  Playwright config.** `visual-diff-report.test.mjs` reads its `CONFIG_SOURCE`
  from a fixture while its comment makes a claim about
  `apps/rialto-web/playwright.config.ts`. They agree today (confirmed
  byte-identical, both parsing to `300`). If the live config later gains a
  project-level override or reinstates a live ratio, `parseMaxDiffPixels` would
  return `null` in production while the fixture test stayed green asserting
  `300` forever. The degradation direction is safe — `null` drops the budget
  clause and says so, it never prints a wrong number — which is why this is a
  finding and not a defect.

### Structural, pre-existing, flagged not fixed

- **`scripts/` is outside every lint gate.** `eslint.config.js` says so in its own
  comment, and `pnpm lint` is `turbo run lint` over workspace packages, which
  `scripts/` is not one of. All four modules this run adds —
  `visual-diff-report.mjs`, `visual-diff-comment.mjs`, `visual-diff-refs.mjs`,
  `publish-visual-diffs.mjs` — are unlinted. They are heavily unit-tested (256
  tests across six files) and prettier-formatted by the commit hook, so this is a
  missing lint gate rather than unchecked code, but an orphaned import or an
  unused variable in them would be caught by nothing. Pre-existing and repo-wide;
  fixing it means bringing `scripts/` into a workspace package, which is a
  separate change.
- **The `js-yaml` question.** The trigger-hygiene guard
  (`visual-diff-ref-trigger-safety.test.mjs`) normalises workflow `on:` blocks
  _textually_ rather than parsing them with `js-yaml`. That is deliberate:
  `@mbe/scripts` declares no YAML dependency, and `pnpm-lock.yaml` is a turbo
  `globalDependencies` entry, so adding one cache-busts every task in the
  monorepo (gotchas.md § CI) for a parser this guard can do without. The cost is
  that the normaliser has to be exhaustive about spellings and pessimistic about
  everything else — which is what the fail-closed rule (an unreadable shape is a
  _violation_, never an absence) and the two non-vacuity tests buy. Worth
  revisiting only if a YAML dependency arrives in this workspace for some other
  reason; adding one for this guard alone is not worth the cache-bust.

### Discovered during this stage (new — not in `review.md` or `verification.md`)

- **D1 (medium) — a pull request that backs out its whole filtered surface
  strands the failure comment.** `rialto-web-e2e.yml` triggers on a `paths:`
  filter that GitHub evaluates against the pull request's cumulative
  `base...head` diff. If a PR's diff under `apps/rialto-web/**`,
  `packages/rialto/src/**` and `infrastructure/worker/**` goes to zero after a
  failing visual run, the workflow stops running entirely and nothing can
  retract the comment. Observed live on this pull request at `d9ce41471`
  (Demonstration step 7). **Not fixed here** — the shapes of a fix (a
  `workflow_dispatch:` trigger, a scheduled reconciler, or widening the filter)
  all touch trigger configuration this run's PRD puts out of scope, and the
  failure direction is visible rather than silent. Documented with its manual
  remedy in `apps/rialto-web/CLAUDE.md`.
- **D2 (informational, out of scope) — Playwright's per-pixel `threshold` gates
  before `maxDiffPixels`, and the `rialto-web` suite is far less sensitive than
  the budget suggests.** A change altering 71,140 of 139,216 pixels in
  `light-button-variants` passed all 49 snapshots, because no pixel exceeded the
  default `threshold: 0.2` (largest per-channel delta measured: 36/255 = 0.14).
  `#4496` tuned `maxDiffPixels` from a ratio to an absolute 300 without
  examining the threshold sitting in front of it. Changing either alters what CI
  considers pass/fail, which `prd.md` puts explicitly out of scope for this run —
  recorded for whoever revisits the tolerance next.
- **D3 (resolved during pre-flight) — the branch broke the AI-antipattern
  ratchet.** `consoleLogs: 689 -> 691`. Fixed by accepting the baseline
  (`18916411f`); see Pre-flight.
- **D4 (measured negative, no action) — `actions/upload-artifact` v7.0.1 did not
  reject the same-name upload on a re-run.** Predicted as a risk for the SC-4
  step; both uploads succeeded on attempt 2 and the run carries one copy per
  attempt. Recorded so a future failure here is recognised as a change in
  behaviour rather than a new bug.

## Post-release checks

There is no deployed surface to smoke-test and no package to install — this
release's "production" is CI behaviour on pull requests, and it was exercised
directly on PR #4569 rather than inferred. The evidence is the Demonstration
section above: a comment posted, updated in place on re-run, its images fetched
unauthenticated, and retracted on a passing run, with `CI Gate` unmoved
throughout.

What must still be checked **after** the merge, because it cannot be checked
before it:

- [ ] The first scheduled run of `.github/workflows/visual-diff-ref-sweep.yml`
      (daily, 03:00 UTC) executed, and its per-ref verdicts were correct. Read
      the **step log**, not the job summary. Release step 5 has the commands.
- [ ] The two demonstration refs
      (`visual-diffs/pr-4569/run-32903163602-attempt-{1,2}`) were removed by that
      sweep once #4569 closed — or removed by hand if it did not.

## Outcome

**Prepared, demonstrated, and deliberately not released.**

The branch is pushed, PR [#4569](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4569)
is open against `main` and reports `MERGEABLE` / `CLEAN` with `CI Gate` green,
and the feature has now executed end to end on a real pull request across four
live CI runs and five pushes. All eight success criteria are discharged on live
evidence; before this stage six of them had never been reachable.

The demonstration did not go cleanly, and both hiccups are recorded above rather
than smoothed over: the first perturbation failed to fail (Playwright's per-pixel
threshold, D2), and the revert that was supposed to prove SC-5 instead stranded
the failure comment by switching the workflow off entirely (D1). The second is a
genuine product gap found only because the path was actually walked — which is
the argument for item 3.5 existing at all.

**The merge is the user's call and was not made.** No merge, no auto-merge, no
tag, no registry publish, no deploy, no push to `main`, and no GitHub issue
created, closed or commented on. The only writes to the repository outside the
branch are the ones the feature itself performs: two refs under
`refs/heads/visual-diffs/`, and a PR comment that it has already deleted again.

## Next stage

Operate, writing `docs/features/visual-diffs-in-pr/retro.md` — after the user
merges, and after the post-release checks above have been read.
