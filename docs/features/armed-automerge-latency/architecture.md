---
stage: architect
run: feature:armed-automerge-latency
date: 2026-10-15
ux: "skipped — CI/merge automation with no user-facing surface (prd.md ux-reason)"
assumptions:
  - "No ADR: every decision here is a two-way door following an existing in-repo pattern (evidence-first diagnosis per gotchas § CI, pure-function-plus-test per merge-queue-eligibility.mjs), so all three ADR-test legs fail and the reserved adr ids 101-103 go unused. One-line decisions recorded below."
  - "The architecture is a decision tree rather than a single mechanism design, because R1's evidence does not exist yet (this session has no GitHub credential). Each branch is designed to the depth Implement needs to execute it without re-planning; exactly one branch ships (PRD R2)."
---

# Architecture: diagnose the hold, then fix the one named mechanism

This run's design is an evidence procedure plus a pre-designed remedy per
outcome. The procedure runs first, in a credentialed session; its output
selects exactly one remedy branch.

## 1. Evidence procedure (WO-46; the issue's own verification commands)

Run in order, recording run IDs and timestamps verbatim:

```bash
# a. Full timeline — who armed, who labelled, who merged, when
gh api repos/mattbutlerengineering/mattbutlerengineering/issues/6577/timeline \
  --paginate --jq '.[] | [.event, .created_at, (.actor.login // "")] | @tsv'

# b. The merge actor and head SHA
gh api repos/mattbutlerengineering/mattbutlerengineering/pulls/6577 \
  --jq '{merged_by: .merged_by.login, merged_at: .merged_at, head: .head.sha, auto_merge: .auto_merge}'

# c. Check runs AND commit statuses on the final head SHA (both — #4025:
#    statuses feed the rollup; check runs alone can be invisible to it)
gh api repos/mattbutlerengineering/mattbutlerengineering/commits/<head>/check-runs --paginate
gh api repos/mattbutlerengineering/mattbutlerengineering/commits/<head>/statuses

# d. Workflow-run history across the hold window (22:10Z 10-13 → 22:20Z 10-14)
gh run list --workflow ci.yml --branch <pr-branch> --json databaseId,event,status,conclusion,createdAt
gh run list --workflow merge-queue.yml --json ... ; same for tier-classifier.yml, auto-merge.yml

# e. Classify with the repo's own vocabulary
node scripts/ci-gate-status.mjs 6577
```

Decisive questions, in order: **(1)** Was the merge performed by GitHub
auto-merge (`merged_by` = the arming actor, `auto_merge` consumed) or by a
human/routine? **(2)** When did `CI Gate` first conclude green _as seen by
the rollup_ (commit status, not just check run) on the final head SHA?
**(3)** Did any workflow run between arming and merging touch the PR's
auto-merge state or labels?

## 2. Classification table → remedy branch

| Evidence signature                                                                           | Mechanism                                                                                | Remedy (the one that ships)                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI Gate` green in rollup only shortly before merge; earlier runs parked `action_required`   | #3684 approval park on Dependabot-event runs                                             | Workflow fix in `ci.yml`/producer so Dependabot `pull_request` runs don't park — plus regression test reading the real YAML (pattern: `scripts/__tests__/ci-docs-format-gate.test.mjs`)                                     |
| Check run green early but no `CI Gate` commit status on head SHA until late                  | `gate-unattributed` (#4023) — status publisher didn't cover this event path              | Extend the #4025 commit-status publish to the missing event path; pin with a YAML-reading test                                                                                                                              |
| No CI runs at all on head SHA for hours                                                      | `gate-missing` (#3969) — event never delivered; one-off                                  | Rescue gap: no sweeper covers `dependabot/**` (rescue scope is `automation/*` + `auto-merge` label). Either extend `scripts/rescue-automation-prs.mjs` scope via a pure predicate + test, or gotchas-only if judged one-off |
| `merge-queue.yml` / `auto-merge.yml` run disabled or re-gated auto-merge on `tier:sensitive` | Eligibility regression (#5983/#6199 class)                                               | Fix `decideAutoMergeAction` call path in `scripts/merge-queue-eligibility.mjs` + unit test pinning the Dependabot/`tier:sensitive` case                                                                                     |
| `merged_by` is Matt or a routine; auto-merge never completed on its own                      | Hold real but completion was manual — combine with whichever row above explains the hold | That row's remedy; the manual merge is reported on #6651 as masking, not mechanism                                                                                                                                          |
| None of the above reproduces; timestamps show GitHub-side delay only                         | Intended/one-off GitHub behavior                                                         | Gotchas § CI entry carrying the discriminating signature (timestamps, run IDs, what to check next time); no code change                                                                                                     |

Constraint on every branch (PRD R3): no remedy may change what
`tier:sensitive` / `needs-review` block. A fix that works by lowering a gate
is rejected at review.

## 3. Shape rules for whichever fix ships

- Decision logic lives in a pure, dependency-free function with unit tests
  (`scripts/merge-queue-eligibility.mjs` pattern); workflows branch on its
  printed output, never on inline expression soup.
- Any workflow assertion is pinned by a test that reads the real YAML
  (in-repo precedent: `scripts/__tests__/merge-queue-tier-race.test.mjs`).
- Gates: `pnpm lint && pnpm typecheck && pnpm test` on affected packages;
  `set -o pipefail` in any new `run:` block whose exit code matters
  (gotchas § CI).

## Decisions (one-line records; no ADR per frontmatter)

- Evidence procedure precedes and selects the remedy; no fix is designed
  past the depth needed to execute its branch.
- Rollup truth is commit statuses + check runs together, never check runs
  alone (#4023/#4025) — the evidence step queries both unconditionally.
- The gotchas-only outcome is a first-class remedy, not a failure: a
  one-off with a recorded signature beats machinery without a mechanism.

## Risks / verification hooks

- Evidence older than 90 days of run retention is not at risk here (event
  is days old), but timeline pagination must be used — the arming event is
  near the start.
- The hold may have multiple contributing mechanisms; the table is applied
  top-down and every matching row is reported, but only the earliest-cause
  row's remedy ships in this run (others become backlog seeds).
