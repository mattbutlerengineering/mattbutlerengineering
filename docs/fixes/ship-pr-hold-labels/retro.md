---
stage: operate
run: maintenance:ship-pr-hold-labels
date: 2026-11-07
users-observed: 0
signal-source: "gh pr view 7014 --json state,mergedAt,mergeCommit,mergedBy,labels,closingIssuesReferences; git -C $W log origin/main -- .claude/skills/ship-pr/ (c4320513d); git diff 6ede6b9df origin/main -- .claude/skills/ship-pr/SKILL.md; gh pr list --state merged --label needs-review --search 'merged:>=2026-10-17' (100 PRs, mergedBy); gh search issues/prs 'ship-pr' created >=2026-10-17; gh issue list --search 'ship-pr needs-review hold' (0); archive prompt search '/ship-pr' across all projects (2 hits, neither an invocation); grep of .github/workflows, .husky, package.json, scripts/run-repo-audit.mjs for the drift checks. All read 2026-11-07. Sentry MCP not queried: the skill is markdown run in a Claude Code session and emits no Sentry events. No analytics or usage instrumentation exists for /ship-pr."
assumptions:
  - "Population is 0. The only person who could have invoked /ship-pr is the Owner (`mattbutlerengineering`). No record shows he did: archive prompt search for '/ship-pr' has no invocation, no PR or issue since 2026-10-17 reports a /ship-pr run, and the repo's merges are all attributed to his account whether done by hand, by merge-queue or by a session, so merger identity cannot separate a /ship-pr merge from any other."
  - "'Hold labels honored since release' is not answerable from the repo. A PR that carries a hold label and was not merged by the skill leaves no trace; a PR merged by the skill leaves none either. Reported as unobserved, not as 'honored'."
  - "Recurrence means: a recorded instance of /ship-pr reviewing or merging a PR carrying a `hold_labels` label. None recorded. Because no /ship-pr run is recorded at all, 'none recurred' carries no weight."
  - "Open debt counts only the two review deferrals (R3, R4) and the follow-ups proposed in release.md prose. The four `from: feature:ship-pr` follow-ups in release.md belong to the feature run and are left to its retro."
---

# Retro: /ship-pr honours hold labels

## Release state

`release.md` has no `outcome:` field and its own text ends "Ready to release, not yet released". The soft gate checked `gh` instead: PR #7014 is `MERGED`, `mergedAt` 2026-10-17T15:06:00Z, merge commit `6ede6b9dff9d1f08ae2ddb8861f21116efa138e2`, merged by `mattbutlerengineering`, labels `[tier:trivial]`, no closing-issue references. Release.md's pending post-release checks were not recorded anywhere after the merge, so they are not claimed here either.

## Did the defect recur?

No recorded recurrence, and no evidence either way.

- The defect (a hold label ending in a review and merge) was never observed on a real PR, before or after the fix (`defect.md` § Reproduction). Nothing in the window changes that.
- No `/ship-pr` invocation is recorded in the 21 days since the merge: no issue or PR names one, the archive has no typed `/ship-pr <N>` prompt in any project, and `defect.md` § Blast radius already said no routine or workflow calls it.
- 100 PRs carrying `needs-review` merged since 2026-10-17 (23 authored by `github-actions`, 77 by the Owner), all merged by the Owner account. A bypass by `/ship-pr` would look identical to a deliberate human merge, so these 100 cannot be read as bypasses or as honored holds. Counting them as either would be invented.
- The hold text is still on `main`. `.claude/skills/ship-pr/SKILL.md` step 1 (`:43`) and step 5 (`:108`) both name the profile's `hold_labels`; the literal `needs-review` appears 0 times in the skill. Later edits (`32e08b4cb` description trim, #8466 `c4320513d`, which routes step 2 through `scripts/fast-path-decision.mjs`) changed 16 lines added and 17 removed and left both hold stops in place. The recurrence question for the pipeline (regression test, review finding or design constraint) therefore does not arise: nothing recurred.

## Outcomes vs. intent

Population is 0, so every outcome is `unobserved`. Each records state, not use. Targets are `defect.md` work items and `autorun-brief.md`; the brief has no `operate:` section, so there is no minimum signal to report against.

### Step 1 stops with `held — <label>` before any review when the PR or a linked issue carries a `hold_labels` label

- What happened: merged and on `main` (`SKILL.md:36-47`), covering every closing keyword and every linked issue after Review R2. Never exercised by a real invocation. Verify exercised the read half only: the label intersection against merged PR #6870 (`needs-review`) and the issue-label read against #6781, with a trace rather than a run (`verification.md` § Not verified).
- Signal strength: unobserved

### Step 5 re-reads holds before both merge commands, including the `CLEAN` direct merge

- What happened: merged and on `main` (`:106-109`). A label added during review has never been tested live; `verification.md` verified it by trace only.
- Signal strength: unobserved

### Minors 1, 3, 4 folded in (queue-only review inputs mapped, step 2 dist wording, restated pre-check replaced by a pointer)

- What happened: merged. Minor 4's pointer has since been reinforced and then partly overtaken: #8466 added `scripts/fast-path-decision.mjs`, which implements the old ordering (freshness, label, gate paths, classifier) as code, and step 4's text now points at its `holdForHuman` and `fastPath` fields. That script restates the hold label as a constant (`NEEDS_REVIEW_LABEL = "needs-review"`, `:38-39`) and not as the profile's `hold_labels` list, so it is the narrower restatement Minor 4 removed from the skill, now in code. It only turns the fast path off; step 1 of the skill still stops the PR first, so nothing bypasses a hold today. It would diverge if `hold_labels` gained a second entry.
- Signal strength: unobserved

### Drift checks stay green

- What happened: `release.md` records all green at `eef473d59`. `detect-instruction-rot.mjs` runs in `.github/workflows/ci.yml:380`; `check-skill-references.mjs` runs in `scripts/run-repo-audit.mjs:126` (scheduled audit). Whether they have passed since was not read. No current-main run was fetched for this retro.
- Signal strength: unobserved

## Open debt

Review R3 and R4 and the release.md follow-ups were recorded only as prose in `review.md` and `release.md`. `gh issue list --search "ship-pr needs-review hold"` and `gh search issues "ship-pr"` (created >= 2026-10-17) returned no issue for either, and `docs/backlog.md` does not carry the two lines (grep for `match-head`, `REST equivalents`: 0). Both are still open in effect:

- R3 (Review, deferred): the merge is not pinned to the reviewed head, so a push during review merges unreviewed commits behind CI Gate alone. State on `main`: `grep match-head .claude/skills/ship-pr/SKILL.md` has 0 hits, so unfixed. No issue.
- R4 (Review, deferred): steps 1 and 5 use only GraphQL-backed `gh pr view` / `gh issue view`, which return HTTP 403 in Claude Code Remote (gotchas, #5958). `grep "gh api" SKILL.md` has 0 hits, so unfixed. It fails closed. No issue.
- `release.md` also lists feature-run follow-ups (Minor 2, 5, 6; rialto/dist race). Those are `feature:ship-pr`'s and are not repeated here. Minor 2 may be closed in substance by #8466 (the single CLI); that is for the feature retro.

Neither deferral counts toward a user count.

## Run retrospective

- Keep: capturing from a reviewed finding with an explicit "ruled out" list. It prevented closing the run on "the hold is reachable by reference".
- Keep: the pre-edit grep counts in `defect.md` § Implement log (`hold_labels` 0 mentions before, 2 after; restated pre-check 0 after). For a markdown skill they stand in for a failing test.
- Keep: Review found two real defects the work items missed (R1: a held draft was marked ready before the stop; R2: `Resolves` and second linked issues were skipped). Both were fixed in the run and re-checked.
- Change: Verify graded the hold on the text and a read-only walk; it never ran the skill. For a gate that exists to stop a merge, a fix whose positive case (a held PR) has never been exercised leaves the claim at "the text says so". The run should have scheduled one live dry invocation on a throwaway draft PR that carries `needs-review`, since 21 days later there is still no record of a run.
- Change: Review's two deferrals sat as prose and never became issues or backlog lines. Nothing in the pipeline reads them again at Operate except a retro that greps for them.
- Stop: nothing worth stopping. One file, scaled stages, proportionate.

## Environment

`verification.md` § Failures: "None". Rows are the Review findings and the Verify observation.

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| Held draft marked ready for review (`gh pr ready`) before the hold stop; the PR left draft and reviewers were notified. Also seen at Verify as an observation. | `review.md` § R1; `verification.md` § Observations | judgement | No deterministic check exists for the ordering of steps in a skill. Nearest existing: `scripts/detect-instruction-rot.mjs` (`ci.yml:380`), which checks references, not step order. Recorded as finding, no carrier. |
| Linked-issue hold scan matched only `Closes`/`Fixes` and the first issue; `Resolves` and later issues skipped. | `review.md` § R2; `defect.md` assumptions | judgement | `scripts/fast-path-decision.mjs`: it already fetches PR labels. Extending it to fetch closing-reference issues' labels (`gh pr view --json closingIssuesReferences`) would move the scan from prose to code and get GitHub's own keyword matching. Not present today (grep: 0 for `closingIssuesReferences`). |
| Merge not pinned to the reviewed head SHA (deferred R3). | `review.md` § R3 | mechanical | `.claude/implement-queue.md` § merge-command, adding `--match-head-commit`. The brief put the profile out of scope, so it was routed as a follow-up. |
| GraphQL-only `gh` calls in a skill that may run in Claude Code Remote (deferred R4). | `review.md` § R4; `verification.md` § Not verified | judgement | `.claude/rules/gotchas.md` § Claude Code Remote already documents the 403. No check flags a skill that names `gh pr view`/`gh issue view` without a REST fallback. Recorded as a finding. |
| The skill was never run, so "the hold stop works" rests on a read of its text. | `verification.md` § Not verified; `defect.md` § Reproduction | judgement | None. `check-skill-references.mjs` and `detect-instruction-rot.mjs` verify references, not behavior. |

Finding on the gate itself: of the three drift checks Ship ran, `check-claude-md-table-drift.mjs` runs under no CI job, no `.husky` hook and no `run-repo-audit.mjs` entry (only a `package.json` script and a `.claude/settings.json` permission), so nothing re-runs it after merge. `detect-instruction-rot.mjs` runs in CI (`ci.yml:380`) and `check-skill-references.mjs` runs in the scheduled `run-repo-audit.mjs` audit, not on PRs. `docs/standards.json` does not exist.

## Idea seeds

- Run /ship-pr once end to end on a throwaway draft PR carrying `needs-review` (and once with a hold label added mid-review) and record the transcript as evidence the held — <label> stop and the step-5 re-read fire; until then no count of honored holds exists (from: maintenance:ship-pr-hold-labels)
- Make `scripts/fast-path-decision.mjs` read `hold_labels` from the `.claude/implement-queue.md` frontmatter instead of the hard-coded `NEEDS_REVIEW_LABEL`, and fetch closing-reference issues' labels via `closingIssuesReferences`, so the hold list and the linked-issue scan live in one tested place (from: maintenance:ship-pr-hold-labels)
- Record every /ship-pr invocation in one log line (PR number, result: armed | merged | held — <label> | stopped) in `metrics/queue-telemetry.jsonl` or the improvement-loop log, so a later retro can count runs and holds instead of inferring from merged-by-Owner PRs (from: maintenance:ship-pr-hold-labels)
- Run `scripts/check-claude-md-table-drift.mjs` in a CI job or `run-repo-audit.mjs`, since it runs under no hook, CI job or audit today; measure how often it has failed on main since 2026-10-17 by running it on each `origin/main` merge (from: maintenance:ship-pr-hold-labels)
- Pin /ship-pr's merge to the reviewed head: add `--match-head-commit <headRefOid>` to `.claude/implement-queue.md` § merge-command and have /ship-pr pass step 1's `headRefOid`, so a push during review cannot merge unreviewed commits; measure by counting merged PRs whose merge SHA differs from the head SHA a review passed (from: maintenance:ship-pr-hold-labels)
- Name `gh api repos/{owner}/{repo}/pulls/<N>` and `/issues/<M>` REST equivalents for /ship-pr's GraphQL-backed label reads so steps 1 and 5 work in Claude Code Remote, needed only if /ship-pr is ever scheduled; measure by counting HTTP 403 GraphQL failures in sessions that invoke it (from: maintenance:ship-pr-hold-labels)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. `release.md` § Follow-ups proposed the R3 and R4 backlog lines but `docs/backlog.md` has neither (grep: 0), so they are seeded above.
