---
stage: operate
run: maintenance:tier-gate-pr-head-code
date: 2026-11-22
users-observed: 1
signal-source: "the Owner alone: of 839 PRs created since the merge (2026-11-04), 750 are authored by the Owner's account (agent branches included), 74 by github-actions, 16 by dependabot, 0 are cross-repository (gh pr list --search created:>=2026-11-04). No other person has used the gate."
assumptions:
  - "release.md records `outcome: released` (released-at 2026-11-04, pending-merge #8183, squash commit be5751245), so the soft gate is satisfied. The brief says `operate: skip`; this retro was requested explicitly after the fact, 18 days after release, which is long enough to have real traffic."
  - "users-observed is 1, not 0: the Owner is the only person whose PRs pass through the gate, and the people the fix defends against (a writer or a fork author who lowers a tier on purpose) have not been observed. So every claim about adversarial behaviour is `unobserved`; claims about what the gate does on ordinary traffic are `measured`."
  - "Run counts come from `gh api repos/.../actions/workflows/tier-classifier.yml/runs?created=>=2026-11-04T03:46:25Z` (the merge instant is `mergedAt` in release.md). The `conclusion` query parameter is ignored by that endpoint; counts by outcome use `status=` instead."
  - "Issues #8398 and #9063 (and PR #9170) are read as post-release feedback about the gate, not the run's own debt: each was created after the merge and none cites this run's review.md or verification.md (grep of #8398's body for 8183, pr-head, review.md, verification.md, pull_request_target, tier-gate returned nothing)."
  - "The review's deferred minors have no tracker issue that I could find (title/body searches for scanner, head-execution, denylist, allowlist, numstat since 2026-11-04 returned only unrelated issues). The brief said Tracker: none, so that is expected; it means the debt lives only in review.md."
  - "I did not re-read the 41 tier-less merged PRs one by one. Their authors are counted; the reason each has no label is inferred from the repo's gotcha that GITHUB_TOKEN-authored PRs never fire the classifier, not verified per PR."
---

# Retro: tier gate executes only base-branch code (`maintenance:tier-gate-pr-head-code`)

## Outcomes vs. intent

Population: one person, the Owner. The fix is CI plumbing, so "use" here means PRs passing through it. That traffic is large (1,354 classifier runs in 18 days) but every PR is the Owner's, a bot's or an agent's; the adversary the fix exists for (a writer steering the gate, a fork author) has not appeared. So the verdicts below separate "the gate behaves" (measured) from "the defect cannot be exploited" (unobserved).

### Intended outcome: the tier gate runs only base-branch code; the PR head is data (`defect.md` "Desired shape")

- What happened: since `mergedAt` 2026-11-04T03:46:25Z the classifier has had 1,354 runs: 1,187 `pull_request_target`, 167 `workflow_dispatch`, and 0 on the old `pull_request` trigger. A fresh run (45040671979, 2026-11-22, PR #9390) shows `Checkout (base only)` doing `git checkout -B main refs/remotes/origin/main`, then `Fetch PR head as data` (`git fetch … refs/pull/9390/head`) and a `git diff --no-renames --no-ext-diff --no-textconv -z` over it; no step checks out the head. `git grep -n "tier-classifier.yml --ref" origin/main -- .github/workflows` prints nothing, so no producer pins a non-default ref any more.
- Signal strength: measured (run counts and one re-read log). The 2026-11-04 log read in `release.md` check (c) and today's log agree.

### Intended outcome: a PR can no longer lower its own tier (the defect itself)

- What happened: no recurrence found. Queries: (1) PRs that touched a gate file since the merge (`git log origin/main --since=… -- tier-classifier.yml resolve-pr-metadata.mjs merge-queue-eligibility.mjs auto-merge.yml merge-queue.yml tier-escalation.mjs`) are #8414, #9107 and #9170; all three carry `tier:critical`, as the new T4 rules require. (2) Issue and PR searches for the PR-head-execution class since 2026-11-02 return nothing about it. (3) Among 839 PRs, tiers are critical 35, sensitive 136, standard 415, trivial 206, none 47 (labels counted across PRs, so a PR with two tier labels would count twice; none checked).
- Signal strength: anecdote for "not recurred" (three gate-file PRs, no adversary present, absence of reports is not evidence of absence). The exploit itself stays unobserved in the wild; Verify's reproductions (`verification.md` C2, C10) are the only exploit evidence.

### Intended outcome: fail closed when the resolver or fetch breaks (`verification.md` C5)

- What happened: 1 `failure` and 15 `startup_failure` runs out of 1,354 (1.2%); the failure run 42673964368 and the startup runs I opened (42669556891) show zero jobs, so no step ran and I cannot say why. The two Owner PRs whose creation times match two of those runs to the second, #8595 (17:32:45Z vs run 42665666881 at 17:32:50Z) and #8601 (18:25:48Z vs run 42673964368 at 18:25:52Z), have no tier label; so do dependabot PRs #8591, #8592, #8593 (11-09 17:17Z) and #8970, #8971, #8973 (11-16), which line up with runs on those dates. Fail-closed behaviour (no label rather than a wrong label) is what the run designed for. 137 further runs (10%) were `cancelled`, consistent with the per-PR cancel-in-progress concurrency `review.md` described.
- Signal strength: pattern for "failures leave a PR unlabelled", from 8 PRs on two dates. The cause of `startup_failure` is not established: both dates are a Monday and the failures cluster in 16:26Z to 18:25Z, but I did not open the runs further. Whether those PRs merged through a different path than the tier label is not verified.

### Intended outcome: no fork-PR regression (`release.md` check (e), fork half)

- What happened: still NOT OBSERVED. 0 of 839 PRs since the merge are cross-repository (`isCrossRepository`), so `refs/pull/N/head` has never been fetched with the job token for a fork head.
- Signal strength: unobserved.

### Side finding from the post-release checks: a policy gap the run recorded and left

- What happened: `release.md` check (b) saw `.spec.ts` unmatched by the T1 test-only rule while `docs/change-tiers.md` says "test-only additions" are T1. #8414 (merged 2026-11-06) left `apps/*/e2e/**` unmatched and "`.test.mjs` still not in T1 test rule" by its own text. No issue about `.spec.ts` was found.
- Signal strength: anecdote (one sample file).

## Did the pipeline miss something?

For a maintenance run the retro asks whether a regression test, review finding or design constraint was missed. Three answers, with evidence.

1. **Regression test: partly.** `defect.md` listed four structural pins (a)-(d). Review then found two majors the run's own tests had not covered: renames and C-quoted paths vanished from the diff list (T1 for a move out of an auth path), and the text-pin tests stayed green with a head-executing step added. Both were fixed before ship (review re-run, "No critical and no major finding is unfixed"). The pipeline caught them, at Review, not at Implement.
2. **Review finding or design constraint: one adjacent miss.** `defect.md` gap 1 says an edit to `scripts/resolve-pr-metadata.mjs` "falls to the 'unmatched paths default to T2' branch". Two days after release the weekly routine filed #8398: that default only fires when every file in a PR is unmatched, so one markdown file beside unmatched code gave `tier:trivial` (live example: PR #8393). That is a different flaw from the PR-head one, but it is the same gate and the same default the run leaned on; `review.md` found no issue in the aggregation (its correctness pass names only the empty-diff case as "same as main"), and the T4 rules the run added made the four gate files immune because they match by name. Fixed by #8414 (`classifyPaths`, per-file default). Signal: anecdote (one issue).
3. **Release verification sample: judgement miss.** Post-release check (b) confirmed labels on #8227 (one file) and #8228 (one file). A single-file PR cannot exercise the aggregation, which is where #8398 lived.

Recurrence of the original defect: none found (see Outcomes). Seeds below carry what to watch.

## Open debt

The run's own deferrals, from `review.md` (six minors) and `release.md` (unobserved fork half). Never counted as feedback.

- Scanner is a denylist with demonstrated bypasses: `git -C pr checkout`, `git reset --hard FETCH_HEAD`, `git show FETCH_HEAD:x` then `node x`, `uses: Actions/Checkout@…` with a head `ref`, job-level reusable workflows (`review.md` minor 1, "deferred to the Owner"). `pull-request-target-no-head-execution.test.mjs` has no commit since the merge (`git log origin/main --since=2026-11-04 -- <path>` is empty), so it is still unfixed.
- `tier-classifier.yml` `existsSync` fallback on `/tmp/numstat.txt` would silently turn the size rule off if the file were renamed (`review.md` minor 2).
- Stale-label window between `synchronize` and reclassification: auto-merge can read the old `tier:trivial` while the classifier is still running (`review.md` carried minor).
- `auto-merge.yml` iterates `$LABELS` unquoted and prints `$REASON` in a `::warning::`; arming workflows do not restrict to default-base PRs (`review.md` carried minor).
- Classifier comment embeds path text; backticks and `@mentions` in a filename reach the bot comment (`review.md` carried minor).
- Fork half of release check (e): open until the first fork PR (`release.md` Post-release checks).
- Out of scope by the brief, still true: gate files in agent-core `GATE_PATHS`, required code-owner review, the 4 deferred minors of the tier-escalation review.
- No tracker issue exists for any of the above (see assumptions).

Post-release items counted as feedback, not debt: issue #8398 (fail-open aggregation, fixed by PR #8414), issue #9063 (deleted generated files escalate to T4, fixed by PR #9107) and PR #9170 (daily ACMM `metrics.json` mis-tiered; a fix PR with no separate issue). All three concern the classifier's rules, not the trust boundary this run fixed.

## Run retrospective

- Keep: Verify's regression method. It ran the branch's four test files against `origin/main` (42 of 185 fail there, 185/185 pass on the branch) and, separately, reproduced the exploit with the real step bodies (forged `base_ref` gives T1 on old, T4 on new). It also showed the new scanner goes RED on a mutated copy of all four workflows. That is evidence a later reader can re-run.
- Keep: Review's re-run after the fix loop. Both majors were closed with named tests; the 18-case probe of the scanner turned a vague "tests are text pins" worry into a listed set of bypasses.
- Keep: `release.md`'s post-release checks quoted run logs and labelled the fork half NOT OBSERVED instead of rounding it up to a pass. That honesty is why this retro can still say the fork half is open.
- Change: both majors reached Review. A change to a gate that parses `git diff` output should carry an adversarial-input table (renames, quoted names, newlines, binary) at Architect or Decompose, not after Review. `defect.md`'s regression-test seed listed only four structural pins; Milestone 4 in `breakdown.md` exists because Review added the rest.
- Change: when a design leans on a fallback ("defaults to T2"), test the fallback with a mixed input, not only a lone file. `verification.md` C8 and the near-miss cases used single-file inputs.
- Change: put deferred minors somewhere that outlives the PR. The scanner hardening is the one `review.md` called cheap, was left for the Owner, and 18 days later nothing tracks it.
- Stop: nothing proposed. The `operate: skip` default was reasonable on 2026-11-02 (nothing to observe on day one); it is the run staying open that made this retro possible, and it cost nothing.

## Environment

The run's recorded mistakes (`review.md` findings, `verification.md` Failures is "none") and one found afterwards.

| Mistake                                                                                                                    | Evidence                                                                                       | Class      | Proposed carrier                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Renames and quoted paths dropped from the changed-file list, so a move out of `services/users/src/auth/` classified T1     | `review.md` §Prior Major 1; `verification.md` C10 (scenario B)                                 | mechanical | `scripts/__tests__/tier-classifier-workflow.test.mjs` "changed-file list covers every touched path, unquoted" (added in the fix loop). Already the carrier; a diff-forms fixture table there is the place to add any new path shape. |
| Text-pin tests on `auto-merge.yml` and `merge-queue.yml` stayed green when a head-executing step was added                 | `review.md` §Prior Major 2; `breakdown.md` Milestone 4 evidence (101 passed with the mutation) | mechanical | `scripts/__tests__/pull-request-target-no-head-execution.test.mjs` (added; RED on all four workflows in `verification.md` C14).                                                                                                      |
| That scanner is a denylist; a later edit using `git -C`, `git reset --hard FETCH_HEAD`, or `Actions/Checkout` passes it    | `review.md` minor 1 (18-case probe); test file unchanged since merge                           | mechanical | The same test, moved to an allowlist (a Review "fix direction", not done).                                                                                                                                                           |
| The "unmatched paths default to T2" safety net was treated as a guard; it fails open when one rule-matched file is present | `defect.md` gap 1; #8398; PR #8393 labelled `tier:trivial` for 173 lines of automation code    | mechanical | `scripts/tier-escalation.mjs` `classifyPaths` and its tests from #8414 (mixed md + unmatched code now pinned). Carrier exists after the fact; nothing before it caught the mixed case.                                               |
| Post-release sample was two single-file PRs, which cannot show aggregation behaviour                                       | `release.md` check (b), #8227 and #8228                                                        | judgement  | The post-release check list in the ship stage's `release.md` template: for a gate change, require one sample PR that mixes a T1 file with an unmatched code file. A reader's choice, so a checklist line rather than a detector.     |
| Run was built against pinned protocol 0.12.2 while its assignment named sections that exist only in 0.24.0                 | `release.md` assumptions (protocol sections absent from the pinned 0.12.2)                     | mechanical | `idea-to-prod:doctor`, which diagnoses the install read-only; whether it compares the pinned version to the sections a run cites was not checked.                                                                                    |
| Review's deferred-minor count was written as 5 in Pre-flight and 6 in the Verdict                                          | `release.md` Pre-flight (last two bullets)                                                     | judgement  | None proposed: noted in `release.md` itself, no consequence found.                                                                                                                                                                   |

No row asks for a prose rule; the one judgement row with consequence is a checklist line, and the rest already have, or name, a deterministic check.

## Idea seeds

- Harden the `pull_request_target` head-execution scanner from a denylist to an allowlist: case-fold `actions/checkout`, flag `git -C`, `reset --hard FETCH_HEAD`, `git show FETCH_HEAD:x` then execute, any `uses:` not on a pinned allowlist, and job-level reusable workflows (review.md minor 1, no issue exists).
- Observe the first fork PR through the gate and record whether `refs/pull/N/head` fetches and a label lands (release.md check (e) fork half; 0 of 839 PRs since 2026-11-04 are cross-repo).
- Find why 15 `startup_failure` and 1 `failure` tier-classifier runs (of 1,354) started no job, clustered 2026-11-09 and 2026-11-16, and whether a PR left without a tier label is surfaced to anyone.
- Audit which merges skip the tier gate: 47 of 839 PRs since 2026-11-04 carry no tier label (38 github-actions, 7 dependabot, 2 Owner) and 41 of those merged (mostly `chore: version packages`), so confirm no required check relies on the label for those.
- Decide whether `.spec.ts`, `.test.mjs` and `apps/*/e2e/**` count as test-only T1 (`docs/change-tiers.md` says "test-only additions"; the executable rule matches `.test.[tj]sx?` only).
- Close the stale-label window between `synchronize` and reclassification so auto-merge cannot read a previous `tier:trivial` (review.md carried minor).
- Drop the `existsSync` fallback on `/tmp/numstat.txt` and escape markdown and mentions in the classifier comment (review.md minors 2 and 6, hardening only).

## Run complete

Closed 2026-11-22. Population: 1 (the Owner); gate behaviour measured, adversarial behaviour unobserved. The seeds above are the input to the next Idea-stage run; the two worth taking first are the scanner allowlist and the first-fork-PR observation, because each closes something the run itself left open.
