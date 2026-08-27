---
stage: ship
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
outcome: prepared-not-released
pr: 4613
head: 65db954503f754096715e01d91ba3b6398d802c3
assumptions:
  - "No live user input. Every interview answer came from `autorun-brief.md`; no question was put to a person at this stage."
  - "PREPARED, NOT RELEASED. `autorun-brief.md` § Decisions already made grants release authorization NONE — 'prepare and stop'. Nothing externally visible was executed: no `git push`, no `gh pr merge` in any form including `--auto`, no auto-merge enabled by label or API, no tag, publish, deploy, or release creation. Merging PR #4613 is the user's call alone."
  - "No tracker interaction. `defect.md` carries no `intake:` field (verified: `grep -n '^intake' defect.md` returns nothing), so the ship skill's step-5 issue-closing branch does not apply. No issue was created, closed, or commented on; no label was changed. `docs/backlog.md` line 55 stays `(claimed: maintenance:visual-tolerance-threshold)` — it is not marked done, because the PR has not merged."
  - "Pre-flight was measured against head SHA `65db954503f754096715e01d91ba3b6398d802c3`, which was both the PR head and local HEAD when the checks were read. This artifact's own commit moves local HEAD one commit ahead of the PR head, so the release steps below begin with a push and a re-check of CI on the NEW head SHA. A green gate on the SHA measured here is not a green gate on the SHA that would merge."
  - "Post-release checks are recorded as the checks that WOULD run, with the evidence each would produce. No post-release evidence is stated, because no release happened. Any reader treating this section as observed results is misreading it."
  - "The rollback plan is written but UNTESTED — there is no release to roll back. Its commands were derived from the repo's merge method (squash only) and read from `git`/`gh`, not executed."
  - "`TURBO_TOKEN` being unset in CI is taken from `review.md` § F-1's measurement (`Remote caching disabled` in a real job log), not re-measured here — a repository secret cannot be read from a checkout."
  - "N-4, Verify's accepted risk 1 and accepted risk 2 ship UNFIXED, by Review's and Verify's decisions respectively, not this stage's. They are named in § Deferred, not laundered into the pre-flight."
  - "F-1's residual ships unfixed and is recorded as a `docs/backlog.md` seed per `review.md` § F-1's recommended disposition. The `turbo.json` change itself is repo-wide and was not made here."
---

# Release: the rialto-web visual suite's measured sensitivity — PREPARED, NOT RELEASED

> **Status: prepared and stopped.** Every pre-flight check below was run and its
> real result recorded. **No release action was executed.** The exact commands
> that would ship this are written out in § Release steps and are marked, every
> one of them, as not run. PR **#4613** is open, unmerged, with auto-merge not
> enabled — and stays that way until a person decides otherwise.

## What actually ships

`apps/rialto-web/playwright.config.ts`'s `expect.toHaveScreenshot` gains an
explicit **`threshold: 0`** where none was set before (so Playwright's default
`0.2` no longer applies) and its budget moves **`maxDiffPixels: 300 → 674`**.
That is the whole behaviour change. The rest of the diff is the apparatus that
justifies it and keeps it honest: six baselines regenerated from one
authoritative Linux artifact, two new guards, a `workflow_dispatch` measurement
workflow, an extracted lexer, and a one-line correction to
`.claude/rules/gotchas.md`. Nothing here is runtime code — this change alters
what a CI job concludes and ships no deployed surface.

The order of the two values is the entire defect. `threshold` filters
per-pixel first; `maxDiffPixels` counts what survives. With `threshold` left at
`0.2`, the count reaching the budget was already zero, so #4496's tightening of
the budget from a ratio to an absolute 300 changed nothing about what the suite
could see.

**Measured before/after**, on the committed baseline `light-button-variants.png`
(1232 × 113 = **139,216 px**), a uniform per-channel RGB shift applied to
**100 % of the pixels in the image**, run through Playwright 1.62.1's own
comparator (`verification.md` § item 3.4; the same figure cross-validates from
the CI artifact by a different code path):

| uniform shift | before — `maxDiffPixels: 300`, `threshold` unset | after — `threshold: 0, maxDiffPixels: 674` |
| ------------- | ------------------------------------------------ | ------------------------------------------ |
| 1/255         | **PASS — 0 pixels counted as differing**         | FAIL — 136,632 px                          |
| 36/255        | **PASS — 0 pixels counted as differing**         | FAIL — 136,632 px                          |
| 52/255        | **PASS — 0 pixels counted as differing**         | FAIL — 136,632 px                          |
| 53/255        | FAIL — 94,942 px                                 | FAIL — 136,632 px                          |
| 80/255        | FAIL — 94,942 px                                 | FAIL — 136,632 px                          |

Every pixel in the image changed, and the live configuration reported **no
difference at all** — not "within budget", _zero differing pixels_ — for every
shift up to and including 52/255 (20.4 %). The shipped pair catches all of them,
down to a delta of 1.

The other half, which matters just as much, is that the suite does **not** now
red on rendering noise. Across two different Linux runners inside the same CI
run, the largest run-to-run difference anywhere in all 49 snapshots at
`threshold: 0` is **4 px**. The budget of 674 sits at the geometric mean of that
noise floor and the smallest reproduction signal (113,509 px) — 168× of headroom
on each side, and both values are the verbatim output of
`scripts/visual-tolerance-rule.mjs` over run `33107801311`, not a judgement call.

## Pre-flight

- [x] **Verification green (no unresolved failures)**
- [x] **CI green on the head SHA**
- [x] **No secrets in diff; target config present**
- [x] **Migrations/data changes have a tested forward path — N/A, none exist**
- [x] **Rollback plan concrete (commands below)**

### Verification green

`verification.md` § Summary: **PASS, with three findings and no failures.**
§ Failures reads, in full: _"**None.** No criterion failed. Nothing routes back
to Implement."_ Eight criteria checked (SC-1, SC-2, and milestone-3 items
3.1, 3.1b, 3.2, 3.3, 3.4, 3.5, 3.6), 8 PASS / 0 FAIL, 8 mutations run and all
restored.

`review.md` verdict: **`SHIP-AFTER-N1-N2`**, score 8/10, **0 critical**
findings. Both named blockers are closed on the head commit:

| Finding | Disposition                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| **N-1** | FIXED in `65db95450` — `scripts/vitest.config.mjs` `testTimeout` 15000 → 60000, with the coverage multiplier recorded |
| **N-2** | FIXED in `65db95450` — `breakdown.md` item 2.4's four diff-image reasons corrected to the measured luminance/offset   |
| **N-3** | FIXED in `65db95450` — `apps/rialto-web/playwright.config.ts` lines 37-44 now state what the guard actually enforces  |
| **N-4** | **Deferred, unfixed** — see § Deferred                                                                                |
| **N-5** | Resolved — `verification.md` and `review.md` are both on the branch and in the PR (33 files, was 30 at review time)   |

### CI green on the head SHA

Polled to completion at this stage rather than sampled — when Ship started,
`Build` and `Test (Node 22)` were still `in_progress` and **`CI Gate` did not yet
exist**, which is the state that must never be read as green (gotchas § CI,
#3969: `gate-missing` is a distinct rollup state, indistinguishable from
genuinely-green under a naive `0 failed, 0 pending` read). Waited for every check
to reach `completed`, then read the real outcome:

```
$ gh api "repos/.../commits/65db954503f754096715e01d91ba3b6398d802c3/check-runs?per_page=100" \
    --jq '[.check_runs[].conclusion] | group_by(.) | map({(.[0]//"null"): length}) | add'
{"skipped":4,"success":39}
```

**43 check runs, 39 `success`, 4 `skipped`, 0 `failure`, 0 `cancelled`.** The
four skips are `Accessibility AI Attribution`, `Cleanup Preview`,
`Report CI Health`, and one `auto-merge` leg — the same four Verify recorded.

The only **required** context is present and green, as both a check run and a
commit status (the #4025 mechanism):

```
CI Gate                          completed   success
$ gh api ".../commits/65db95450.../status"
{"state":"success","total_count":1,"statuses":[{"context":"CI Gate","state":"success"}]}
```

`codecov/patch` — advisory — also concluded `success` on this head, as did
`Visual Regression (rialto-web)`, which is the job this change exists to make
mean something. Fresh evidence from **this** head, not carried from Verify's
(job `98693789301`, run `33122849809`, completed 22:34:13Z):

```
Running 49 tests using 1 worker
  49 passed (1.4m)
```

**The N-1 fix was exercised for real.** All three of the run's new or re-pinned
test files executed inside the required `Test (Node 22)` job (`98694421199`,
`success`, 22:34:25Z → 22:43:05Z):

```
✓ e2e/noise-floor-coverage.test.ts (10 tests) 27ms
✓ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests) 21ms
✓ scripts/__tests__/visual-defect-reproduction.test.mjs (50 tests) 116381ms
  Test Files  139 passed (139)
```

116.4 s for the reproduction file — consistent with the 124.2 s Review measured,
and the reason the `testTimeout` raise was needed. Note the cap is **per test**,
not per file: the slowest single test was 7.63 s (Review's reading of the junit
artifact from run `33118011058`), so 60,000 ms is ~7.9× headroom where 15,000 ms
was 1.97×.

**PR state at the moment of this reading:**

```
{"state":"OPEN","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN",
 "autoMergeRequest":null,"headRefOid":"65db954503f754096715e01d91ba3b6398d802c3"}
```

Open, unmerged, mergeable, **auto-merge not enabled**. The branch is 6 commits
behind `origin/main` and 27 ahead, which does not block: branch protection
reports `"strict": false`, so a `BEHIND` PR is mergeable here.

### No secrets in diff; target config present

- `Gitleaks Secret Scan` — `completed / success` on the head SHA. `Trivy` —
  `completed / success`. `CodeQL` (`Analyze (actions)` and
  `Analyze (javascript-typescript)`) — both `completed / success`.
- Independently scanned the added lines of the whole non-binary diff for
  `sk_live` / `pk_live` / `rk_live` / `AKIA` / `ASIA` / PEM private-key headers /
  JWTs / assigned `password` / `api_key` / `secret` — **no matches**.
- **Target config: none required.** Read rather than assumed —
  `.github/workflows/visual-noise-floor.yml` declares `permissions: contents: read`
  at the top level with no job-level override, and `grep 'secrets\.'` over the
  file returns **nothing**: it references no secret at all, not even the default
  token. It triggers on `workflow_dispatch` and on `push` to `measure/**`, makes
  no network call, and pins every action to a full SHA. There is no environment
  variable, no repository secret, and no deployment target to provision before
  this merges.

### Migrations / data changes — N/A

`git diff origin/main...HEAD --name-only` returns 33 paths; filtering it for
`migrations?/` and `schema.prisma` returns **nothing**. The change touches no
database, no Prisma schema, and no persisted data. There is no forward path to
test because there is no migration.

## Rollback plan

This repo allows **squash merges only**, so merging #4613 puts exactly one
single-parent commit on `main`. Call it `<squash-sha>`; recover it with
`gh pr view 4613 --json mergeCommit --jq .mergeCommit.oid`.

### Lever 1 — do nothing, because the visual job is advisory

The cheapest correct response to a suspected false red is **not** a rollback.
`Visual Regression (rialto-web)` is not among `ci-gate`'s `needs`, and branch
protection on `main` requires exactly one context:

```
$ gh api repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks
{"strict":false,"contexts":["CI Gate"],"checks":[{"context":"CI Gate","app_id":null}]}
```

So a red visual job does not block a merge and does not break green-main. Take a
fresh measurement instead — that is the designed recovery, and it becomes
available the moment this merges:

```bash
gh workflow run visual-noise-floor.yml
# then re-run the decision rule over the new artifact and update BOTH the values
# and their `// noise-floor:` / `// noise-floor-values:` provenance lines together
```

**Consequence:** none, beyond a noisy advisory check until the re-measure lands.

### Lever 2 — targeted loosening (keeps the instrument and the baselines)

```bash
git fetch origin main
git checkout -b fix/visual-tolerance-loosen origin/main
# edit apps/rialto-web/playwright.config.ts: change the value AND the
# `// noise-floor-values: threshold=<t> maxDiffPixels=<n>` line in lockstep.
pnpm exec vitest run --config scripts/vitest.config.mjs \
  scripts/__tests__/visual-tolerance-guard.test.mjs \
  scripts/__tests__/visual-defect-reproduction.test.mjs
```

**The bounds a loosening must respect, measured by Verify's mutations:**

- Moving either value **without** its provenance line reds
  `visual-tolerance-guard.test.mjs` (Mutation A). Move both together.
- **Deleting `threshold: 0` reds all 49 reproduction tests** (Mutation C) and
  therefore reds `CI Gate`. "Just put it back the way it was" is deliberately not
  available without also editing the guard.
- `threshold` may rise to **0.1** with both guards still green; **≥ 0.15** reds
  the reproduction test with `infeasibleReason: "blind-to-defect"`.
- `maxDiffPixels` may rise up to roughly the smallest per-baseline reproduction
  count — **`R` = 113,840 px** is what the reproduction test binds against, and
  the measurement's smallest signal row is **113,509 px**
  (`dark-dark-badges.png`). Above that the reproduction test starts going blind
  baseline by baseline: Mutation G showed `674 → 200000` reds only 19 of the 49,
  because the 30 largest snapshots still produce more than 200,000 differing
  pixels. Any single failure still reds the job, so the guard holds — it just
  holds with less margin than the count suggests.

**Consequence:** proportional to how far you go. Any `threshold > 0` reopens some
of the blindness this run removed; the guards bound how much, they do not
prevent it.

### Lever 3 — full revert

```bash
git fetch origin main
git checkout -b revert/visual-tolerance-threshold origin/main
git revert --no-edit <squash-sha>          # single-parent squash commit; no -m needed
git push -u origin revert/visual-tolerance-threshold
gh pr create --base main \
  --title "revert: #4613 give the visual suite a measured sensitivity" \
  --body "Reverts the squash commit <squash-sha>. Reason: <state it>."
```

**Consequence, stated plainly — this is not a free undo:**

1. It **restores the false negative the run exists to fix**: `threshold` returns
   to Playwright's implicit `0.2`, at which a uniform shift of up to 52/255 across
   100 % of an image reads as zero differing pixels.
2. **The six regenerated baselines revert with it**, back to the pre-run bytes —
   including `light-button-variants.png`, whose committed baseline carries a grey
   scrim over the entire button row that current code no longer renders. The
   reverted state is self-consistent (a loose config against stale baselines stays
   green), which is exactly why the defect survived this long.
3. It removes both guards, the `visual-noise-floor.yml` instrument, and the
   `.claude/rules/gotchas.md` correction naming `visual-actuals-replica-a` as the
   baseline-regeneration source — so the next person regenerates from the
   on-failure-only artifact again.

Prefer lever 1, then lever 2. Lever 3 is for the case where the change itself is
wrong, not for the case where it is inconvenient.

## Release steps

**None of the following was executed.** They are recorded here as the exact
sequence a person would run, in order.

```bash
# ── NOT RUN ── 0. Sanity: repo root, on the run's branch, working tree clean.
#    Stage by explicit path only — the PostToolUse prettier hook leaves ~171
#    files permanently dirty; never `git add -A`.
git -C /Users/mbutler/github/mattbutlerengineering status --porcelain
git -C /Users/mbutler/github/mattbutlerengineering rev-parse --abbrev-ref HEAD   # fix/visual-tolerance-threshold
git -C /Users/mbutler/github/mattbutlerengineering log --oneline -1

# ── NOT RUN ── 1. Push. This Ship-stage commit is local-only; the orchestrator
#    owns this step. Do NOT read the exit code through a pipe (`git push | tail`
#    reports the pipe's status) — check the pushed SHA instead.
git push origin fix/visual-tolerance-threshold
git ls-remote origin refs/heads/fix/visual-tolerance-threshold

# ── NOT RUN ── 2. Re-check CI on the NEW head SHA. The gate measured in this
#    artifact was on 65db95450; the push creates a different head.
NEW_SHA=$(gh pr view 4613 --json headRefOid --jq .headRefOid)
gh api "repos/mattbutlerengineering/mattbutlerengineering/commits/$NEW_SHA/check-runs?per_page=100" \
  --jq '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"' | sort
#    REQUIRE: a check named exactly "CI Gate", status=completed, conclusion=success.
#    A MISSING "CI Gate" is a distinct state from a green one (gotchas § CI,
#    #3969) and must not be read as "nothing red, therefore fine". If it never
#    appears, dispatch CI explicitly and re-poll:
#        gh workflow run ci.yml --ref fix/visual-tolerance-threshold
#    codecov/patch and Hospitality E2E are advisory — do not gate on them.

# ── NOT RUN ── 3. Merge. THE USER'S CALL, AND NOBODY ELSE'S.
#    Squash is the repo's only permitted method. Plain --squash, never --auto:
#    --auto hands the decision to GitHub and there is no further human gate
#    after it.
gh pr merge 4613 --squash --delete-branch
```

**On auto-merge, for the record:** the repo's own
`Evaluate Auto-Merge Eligibility` job already declined this PR —
`{"eligible":false,"reason":"blocked by tier:standard — requires human approval per docs/change-tiers.md"}`
— and #4613 carries the `tier:standard` label. A human merge is the designed
path here regardless of this run's authorization, so nothing is being worked
around by stopping.

## Post-release checks

**Not performed — there is no release to check.** Written as the checks that
_would_ run, each paired with the evidence it _would_ produce. No result below is
observed; anything reading as a result is a specification.

1. **The PR actually merged.**
   `gh pr view 4613 --json state,mergedAt,mergeCommit`
   → would yield `state: MERGED`, a timestamp, and the `<squash-sha>` every
   rollback lever above needs.
2. **`main` is green after the merge.**
   `gh run list --branch main --limit 5` and the `CI Gate` conclusion on the
   squash commit → would yield a `success` gate on `main`, satisfying the
   green-main policy. This is the check that matters most: `CI Gate` on the PR
   ran against the PR's merge ref, not against `main`'s post-merge tree.
3. **The new tolerance holds on a runner that did not produce the baselines.**
   The `Visual Regression (rialto-web)` job on the next PR touching
   `apps/rialto-web/**` → would yield `49 passed`. On the PR itself this already
   read `49 passed (1.4m)` from a third live Linux runner, so a post-merge repeat
   is confirmation, not discovery.
4. **The instrument is reachable.**
   `gh workflow list | grep 'Visual Noise Floor'` and
   `gh workflow run visual-noise-floor.yml --ref main` → would confirm the
   `workflow_dispatch` path exists, which it cannot until the file is on the
   default branch. This is the recovery path for accepted risk 1, so its
   existence is worth confirming rather than assuming — the repo has a recorded
   habit of shipping machinery that never once executes.
5. **No deployed surface to probe.** This change ships no runtime code
   (`verification.md` § Not verified). There is no URL, package, or container to
   smoke-test, and no post-deploy check applies.

## Deferred / unfixed at ship time

Named, not laundered. Each of these ships as-is, by a decision recorded upstream.

- **N-4 (minor, Review deferred).**
  `scripts/__tests__/visual-tolerance.test.mjs:53` —
  `expect(LIVE_CONFIG).toContain("maxDiffPixelRatio")`. Verified still present.
  The only occurrence of that string in `apps/rialto-web/playwright.config.ts` is
  inside the #4450 explanatory comment, so a purely editorial tidy of that
  paragraph reds `@mbe/scripts` and therefore `CI Gate`, with a message saying
  only that a string is missing. Review's call: it fails loudly rather than
  silently and is a deliberate, documented pin — reconsider if that comment is
  ever edited.
- **Accepted risk 1 — `t = 0` has the least runner-image-bump headroom in the
  sweep.** 674 px is 0.064 % of the largest snapshot (1,047,200 px). No absolute
  budget survives a font-rasterization change in a new runner image, and when it
  fires it fires on **all 49 at once** — the cascading red streak the repo's own
  gotchas file describes. Bounded, not eliminated: the visual job is advisory and
  `CI Gate` is the only required context, so `main` stays green while the visual
  job reds. Recovery is lever 1 above.
- **Accepted risk 2 — `R` is a point check at a single amplitude (36/255).**
  Inert while `t = 0` is selected, because counting _any_ non-zero per-pixel delta
  is amplitude-independent by construction (the shipped pair fails a delta of 1
  exactly as decisively as a delta of 80). It becomes load-bearing only on the
  branch where a future measurement makes `t = 0` ineligible.
- **F-1's residual — the guards' CI soundness is incidental, not designed.**
  Shipped unfixed; filed as the backlog seed below.
- **F-2's uncovered band, `0 < t ≤ 0.1`.** The honest ceiling of a static check,
  characterized rather than closed. The shipped config comment now says so
  explicitly (that was N-3).
- **The `packages/rialto` Storybook visual suite has the identical blind spot**
  (`playwright.visual.config.ts`: `maxDiffPixelRatio: 0.01`, `threshold` unset).
  Held out of scope by `defect.md`, named by Verify, still defective after this
  ships.
- **`scripts/**` remains outside every ESLint gate**, so `pnpm lint`'s green says
  nothing about the four modules this run added. Already a `docs/backlog.md` seed
  from the prior run; not this run's job.

## Backlog seed filed

One line appended to `docs/backlog.md`, per `review.md` § F-1's recommended
disposition — declare the `test` / `test:coverage` tasks' true inputs in
`turbo.json`, so the two guards' reachability in CI stops depending on three
facts none of which is written down as a safety property.

The existing seed at line 55 — the one this run claims — is **left untouched**
and still reads `(claimed: maintenance:visual-tolerance-threshold)`. It stays
claimed, not done, until PR #4613 actually merges.

## Outcome

**Prepared and stopped — not released.**

Pre-flight is clean on every axis: verification carries no failures, review
carries no criticals and both of its named blockers (N-1, N-2) are closed on the
head commit, the head SHA's CI finished 39 `success` / 4 `skipped` / **0
`failure`** with `CI Gate` green as both a check run and a commit status, the
diff contains no secrets and needs no target configuration, and there are no
migrations. The rollback plan is written with real commands and honest
consequences. The release steps are written and **not run**.

The one thing worth saying about the pre-flight itself: `CI Gate` did not exist
when this stage began, and the absence of a red check is not the presence of a
green one. It was polled to completion before anything here was written down.

`autorun-brief.md` grants no release authorization, so this stage stops here by
design rather than by obstacle. **Merging PR #4613 is the user's call alone** —
nothing in this artifact, and nothing this run did, moves that decision.

## Hand-off

Next stage: **Operate** (`docs/fixes/visual-tolerance-threshold/retro.md`) — and
it should not run until the PR has actually merged and the post-release checks
above have real answers. A retro on an unreleased change would be retrospecting
on nothing.
