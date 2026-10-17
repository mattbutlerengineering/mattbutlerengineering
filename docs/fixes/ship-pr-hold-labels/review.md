---
stage: review
run: maintenance:ship-pr-hold-labels
date: 2026-10-17
reviewed-head: 67c9178d1
unfixed-critical: 0
unfixed-major: 0
assumptions:
  - "R1 (`gh pr ready` before the hold check) is graded minor and fixed in this run, not deferred. The brief is silent on it. It is the same hold contract this run exists to fix, and the fix is a reorder inside one step, so it stays within the brief's one-file constraint."
  - "R2 (closing keywords) is fixed in this run without live input. Capture's assumption named only `Closes`/`Fixes` on one issue; GitHub links an issue through any closing keyword and a PR can link several, so the narrower scan missed a real hold path. Widening the scan is a superset of what Capture chose."
  - "R3 (no head-SHA pin on merge) and R4 (GraphQL-backed `gh` in Claude Code Remote) are minor and deferred without live input. The review skill lets minors be deferred freely; reasons are logged per finding."
  - "Capture's assumption to re-read labels immediately before the merge command is kept. The brief is silent; the reason is in § Capture assumption below."
  - "Review depth follows the protocol's Run scale for a maintenance run: one markdown file, no runtime code. Verify's eight criteria are not re-verified here; only the text changed by this review was re-checked."
---

# Review: /ship-pr honours hold labels

## Scope

`git diff origin/main...HEAD -- .claude/skills/ship-pr/SKILL.md` on
`fix/ship-pr-hold-labels` (PR #7014), from `79da06e4c` through this review's
fix `67c9178d1`, plus the run's artifacts. One markdown skill file. No runtime
code, no deploy surface.

Re-read for this review: `.claude/implement-queue.md` § merge-command, § No
tier hold and its `hold_labels` frontmatter; `verification.md` (8/8 PASS) and
its two observations; `defect.md`'s assumptions.

## Findings

### Minor (fixed): a held draft was marked ready for review before the hold stop (R1)

- Scenario: `/ship-pr 123 --ready` on a draft that carries `needs-review`.
  Old step 1 ran `gh pr ready 123` first and only then read the hold labels.
  So the PR left draft on GitHub and requested reviewers were notified, and
  only after that did the agent stop with `held — needs-review`. The hold
  contract says the label ends the gate; this skill changed the PR's state
  anyway. No review or merge followed, so this is not a bypass. It was a
  write the Owner's hold did not allow.
- Standard: none (`docs/standards.json` absent).
- Decision: fixed in `67c9178d1`. Step 1 now stops on a hold before anything
  is written ("nothing is written to the PR"), and `gh pr ready` runs only
  once holds clear. The Invocation section's `--ready` bullet says the same.

### Minor (fixed): the linked-issue hold scan missed `Resolves` and every issue after the first (R2)

- Scenario: a PR body with `Resolves #456`, or `Closes #455` followed by
  `Fixes #456`, where #456 carries `needs-review`. The old step 1 looked for
  "the one" `Closes`/`Fixes #M` line, so it skipped #456 and went on to review
  and merge. GitHub treats every closing keyword (close/fix/resolve, any tense
  or case) as a link, and a PR can link more than one issue.
- Standard: none.
- Decision: fixed in `67c9178d1`. Step 1 reads every issue a closing keyword
  names. Step 4's acceptance-criteria source and step 5's re-read now refer to
  "linked issues" in the plural.

### Minor (deferred): the merge is not pinned to the reviewed head SHA (R3)

- Scenario: a push lands on the PR branch while step 4's reviewers run. They
  pass the old head. Step 5 re-reads labels but not `headRefOid`, and
  `gh pr merge --auto` merges whatever head is current once CI Gate is green.
  So the new commits merge without review. CI Gate still gates them.
- Standard: none.
- Decision: deferred. The gap belongs to the profile, not to this run's
  change. § merge-command's command is the profile's, and the queue has the
  same exposure in principle, although its worker branches are rarely pushed
  mid-review. The skill must not grow a restated copy of the merge command, so
  the fix goes in the profile: add `--match-head-commit <headRefOid>` to
  § merge-command, and have `/ship-pr` pass step 1's `headRefOid`. That is a
  `.claude/implement-queue.md` edit, which the brief puts out of scope.
  Route it as a follow-up.

### Minor (deferred): steps 1 and 5 name only GraphQL-backed `gh` calls (R4)

- Scenario: `/ship-pr` run in a Claude Code Remote session. `gh pr view` and
  `gh issue view` return `HTTP 403: GitHub GraphQL is not available`
  (gotchas § Claude Code Remote, #5958). The skill stops at step 1. It fails
  closed: nothing is reviewed or merged.
- Standard: none.
- Decision: deferred. The step-1 `gh pr view` predates this run; this run
  only added `gh issue view` beside it. No routine or workflow invokes
  `/ship-pr` (defect.md § Blast radius), and the failure stops the run rather
  than bypassing a hold. Follow-up: name the `gh api repos/{owner}/{repo}/pulls/<N>`
  and `/issues/<M>` REST equivalents, if `/ship-pr` is ever scheduled.

## Capture assumption: re-read labels before the merge command

Kept. A review takes minutes, and a human adding `needs-review` during that
time is exactly the hold the label exists for. On a `CLEAN` PR the direct
merge leaves `merge-queue.yml`'s `--disable-auto` no window to undo it
(defect.md § Blast radius). The re-read costs one or two `gh` reads. Without
it, the step-1 check only covers labels present when the run started.

## Passes with no findings

- **Correctness**: R1-R3 above. Otherwise every path from step 1 to either
  merge command passes a hold stop. On the post-fix text: the step-1 stop
  precedes step 4's dispatch, and both merge commands sit after the step-5
  re-read, which the `CLEAN` path names explicitly.
- **Design**: clean. The skill points at `hold_labels`, § fast-path and
  § reviewers instead of restating them (`needs-review` appears 0 times), as
  its own no-restating rule requires. The gate-path hold is stated once, in
  step 5. No decision here passes the ADR test.
- **Security**: clean. No secrets or inputs. The change only removes merge
  paths; it adds none.
- **Complexity**: clean. The diff is net prose, and Minor 4 removed a
  duplicated rule. No `lean:` markers added.
- **ADR compliance**: `adr_status.py docs/adr` reports `{"adrs": []}`, so no
  ADR is live in the plugin's format. The repo's own `check-adr` ran in the
  pre-commit hook on `67c9178d1`: "1 active ADRs … No architectural
  violations detected."
- **Domain passes**: none selected (no payments, migrations or dependency
  paths).

## Verdict

Ready to ship. No critical or major finding. Two minors were fixed in this
run (`67c9178d1`) and re-checked (`verification.md` § Re-check after Review
fix). Two minors are deferred to follow-ups with reasons. Merging still needs
CI Gate `green` on the pushed head, per the brief.
