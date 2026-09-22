---
date: 2026-09-22
session: pr-issue-drain
action: Ran the diff-matched `reviewer` subagent at the worker→train boundary on every agent-authored PR before `gh pr merge`, even when CI Gate was already green
context: Four agent-authored PRs merged in one session (#5667, #5668, #5670, #5679). CI Gate was green on all four before review. The reviewer still flagged two of them with defects CI is structurally incapable of seeing, and both would have shipped.
pattern: CI proves the code compiles and that the tests it was given pass. It cannot check that the change does what the issue asked, nor that prose shipped to operators is true. Keep the review gate before the merge, never after it.
---

## What the gate caught that CI could not

**1. A negated closing keyword that would have closed a live security issue (#5668).**
The worker correctly self-amended its `Closes #5369` trailer to `Refs #5369`, then wrote
in the commit body: `"so this does not close #5369 — it closes one item on that issue's
blocker list"`. GitHub's keyword parser is a regex with no negation awareness, so
`close #5369` matched. `squash_merge_commit_message` is `COMMIT_MESSAGES` (verified via
`gh api repos/{owner}/{repo}`), so that body would have landed on `main` verbatim and
closed a security tracking issue with **6 of its 7 blockers still open**. Nothing in
lint, typecheck, or the test suite can see a commit message.

**2. A false causal claim shipped in an operator-facing error string (#5667).**
The PR's `::error::` text blamed `ci.yml`'s `paths-ignore: [docs/**, **.md]` for a
commit having no CI run. Measured: `ci.yml`'s `paths-ignore` is only
`*.png`, `.gitignore`, `LICENSE`, and the file carries an explicit comment saying
`docs/**` and `**.md` are deliberately NOT ignored (#4787/#4664). The real cause is the
`GITHUB_TOKEN` anti-recursion rule — the commit cited by the issue had **zero push-event
runs of any workflow** and its PR was `mergedBy: app/github-actions`. On a PR whose whole
deliverable is "fail fast _with the real reason_", the wrong reason degrades the
deliverable itself. The stale claim had propagated from `.claude/rules/gotchas.md` into
the issue and then into shipped output; all three were corrected.

## Why this is worth reinforcing rather than assuming

Both defects were in **prose**, not logic — a commit message and an error string. Every
mechanical gate in this repo is blind to both by construction, and both PRs were green.
The failure mode is not "the agent wrote bad code"; it is "the agent wrote a true-sounding
sentence that was false, in a place that matters."

The second one also shows the cheaper check that was available and not used: GitHub
computes the linked-issue set itself, and `gh pr view <N> --json closingIssuesReferences`
returns it. That is ground truth, and it is free. It is now recorded in memory as a
mechanical pre-merge step — see [[feedback-squash-commit-closes-beats-pr-body]].

## How to apply

- Run the `reviewer` subagent on agent-authored diffs **before** `gh pr merge`, not after,
  and treat green CI as a precondition for review rather than a substitute for it.
- Give each concurrent reviewer a unique scratch path (`scratchpad/pr<N>-review`) — they
  collide on a shared clone.
- Immediately before merging any PR that must NOT close its issue, run
  `gh pr view <N> --json closingIssuesReferences --jq '.closingIssuesReferences'` and
  require `[]`.
