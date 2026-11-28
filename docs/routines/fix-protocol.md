# Routine fix protocol

Shared protocol for every `mbe-*` routine that finds problems. The routines
read this file from their own checkout, so an edit here takes effect on the
next fire with no change to the live triggers. Pinned by
`scripts/__tests__/routine-fix-protocol.test.mjs`.

**Rule (Owner, 2026-11-27, #9947): fix it, don't ticket it.** A routine that
finds a problem it can root-cause fixes that problem in a pull request. It
files an issue only when it cannot.

## 1. Is the finding in context?

A finding is in context when you can name all three of these from evidence
you gathered this fire:

- **What** is wrong: the failing check, the wrong output, the false claim.
- **Where** it is: the file and line, the workflow run, the metric row.
- **Why** it happens: the cause, not the symptom. "Test X times out" is a
  symptom. "Test X waits on a real network call that the runner blocks" is a
  cause.

Reproduce it or cite the exact evidence before you change anything. If you
cannot reach the cause this fire, the finding is not in context. Go to
section 4.

## 2. Fix it

1. Before you start, search open pull requests for one that already touches
   the same files or the same issue. If one exists, leave the finding to it.
   This search cannot see a competitor that merges while you work, so step 7
   checks again.
2. Branch off a fresh `origin/main` as `fix/<routine>-<slug>`. Run
   `pnpm install --frozen-lockfile` once per fire, in its own Bash call.
3. Use TDD. Write one failing test that encodes the fix and confirm it fails.
   Write the minimum change that makes it pass and confirm it passes. A
   docs-only fix needs no test, but verify every claim against the source.
4. Keep the scope surgical. Touch only what the root cause needs, match the
   surrounding style, and make no drive-by refactors.
5. Run the gates from inside each affected package directory: `pnpm lint`,
   `pnpm typecheck` and `pnpm test`. Vitest does not typecheck, so typecheck
   is mandatory. If you touched `package.json`, `pnpm-lock.yaml` or a
   generated artifact, run `pnpm build --filter @mbe/cli... && pnpm regen` and
   commit the output. A change to published rialto source under
   `packages/rialto/src` needs a `.changeset/*.md`.
6. Stage files by explicit path, never `git add -A`, and confirm with
   `git diff --cached --stat`. Use a Conventional Commits message. If an issue
   already tracks the finding, put `Closes #<N>` in the commit body.
7. Immediately before you open the pull request, check again for a competing
   pull request, open or merged (#10195). A pull request that merged while you
   worked is no longer open, so the search in step 1 misses it. Key the check
   on the paths your diff touches, not on issue numbers or titles: a
   competitor can close a different issue under an unrelated title.

   ```bash
   git diff --name-only origin/main...HEAD
   gh api 'repos/mattbutlerengineering/mattbutlerengineering/pulls?state=open&per_page=100' --jq '.[].number'
   gh api 'repos/mattbutlerengineering/mattbutlerengineering/pulls?state=closed&sort=updated&direction=desc&per_page=50' --jq '.[] | select(.merged_at != null) | "\(.number) \(.merged_at)"'
   gh api --paginate 'repos/mattbutlerengineering/mattbutlerengineering/pulls/<N>/files' --jq '.[].filename'
   ```

   Run the last call for every open pull request and for every pull request
   whose `merged_at` is within the last 6 hours, and compare its paths with
   yours.

   - An open pull request shares a path: read its diff. If it makes the same
     fix, open no pull request, discard your branch and leave the finding to
     it.
   - A merged pull request shares a path: run `git fetch origin main`, then
     `git rebase origin/main`, then `git diff --stat origin/main...HEAD`. If
     the diff is now empty or comments-only, the substance has already landed.
     Open no pull request, discard the branch and name the pull request that
     landed the fix in your report. If a real change remains, re-run the gates
     in step 5 on the rebased branch and continue.

8. Open one pull request per fire against `main`, holding every finding you
   fixed this fire (#10188: many small PRs saturate the CI queue). Each root
   cause is its own commit, with its own test and its own `Closes #<N>` where
   an issue tracks it. Keep the total diff under about 400 lines; findings
   beyond that go to section 4. The title summarises the batch and ends with
   ` (<routine name>)`, for example
   `fix(scripts): two stale-detector fixes (mbe-auditor)`. The body has one
   section per finding: its root cause, evidence and fix. Verify the base is
   `main`.
9. Never open a second pull request while your routine already has one open;
   finish or hand off the open one first. Open it as a draft (`--draft`;
   drafts skip CI) while you add commits, and mark it ready once, before the
   review in section 3. After that, push once per review round. Never push to
   a pull request whose CI is queued or running, because each push cancels
   that run. A non-draft PR opened while the CI queue is saturated is blocked
   by `scripts/pr-budget.mjs`.

Never bundle a finding that section 3 holds for the Owner (security, policy, or
a guardrail path) with fixes `reviewed-merge.yml` can merge: give it its own
`needs-review` pull request, which does not count against rule 8, or file it
under section 4.

If one finding's gates cannot go green, drop its commit and keep the rest.
If none can, open no pull request. Discard the branch and treat each finding
under section 4, with what you learned in the issue body.

## 3. Review, then hand off

1. Dispatch the `reviewer` subagent (Agent tool, `subagent_type: reviewer`)
   with the diff, the finding, its evidence and the gate output.
2. Post one PR comment whose first line is exactly
   `reviewer-verdict: <pass|flag> (score <N>, threshold 7)`, with the findings
   below it. The queueEfficiency sensor counts a PR as reviewed only from this
   line.
3. On a flag or a score below 7, fix what it found, re-run the gates and
   review once more. Before you push that fix, follow "Before every later
   push" below. If it is still flagged, label the PR `needs-review` and move
   on.
4. On a pass with a score of 7 or higher, post a second PR comment whose
   first line is exactly
   `reviewed-merge: <head SHA, all 40 characters> PASS <score>/10`, then add
   the `reviewed` label. `reviewed-merge.yml` merges the PR once `CI Gate` is
   green on that SHA. Do not push to the branch after this comment, because
   the verdict names the head SHA.
5. Never call the merge endpoint yourself and never enable auto-merge. The
   cloud auto-mode classifier denies merges from routine sessions (#6125), and
   `reviewed-merge.yml` is the merge path.

**Before every later push, confirm the PR is still open (#10184).** Someone
else can merge or close the PR while the review runs, and a merge deletes its
head branch. `git push` to a deleted branch does not fail. It recreates the
branch and prints `* [new branch]`, exactly as a first push does, so the
commit sits on a branch that no PR reads.

- Before the push, run
  `gh api 'repos/mattbutlerengineering/mattbutlerengineering/pulls/<N>' --jq '"\(.state) \(.merged)"'`.
  Push only when it prints `open false`.
- After the push, run the same call with `--jq '"\(.state) \(.head.sha)"'`. It
  must print `open` and the SHA that `git rev-parse HEAD` prints. If it does
  not, or if the push printed `* [new branch]` for a branch that already had a
  PR, the fix did not reach the PR.
- If the call prints `closed true`, the PR merged. Do not push to its branch.
  Run `git fetch origin main`, branch `fix/<routine>-<slug>-followup` off
  `origin/main`, apply the fix there, and open a follow-up pull request under
  section 2 that names the merged PR. Review it under this section.
- If the call prints `closed false`, the PR was closed without merging. Do not
  push and do not reopen it. Say so in your report.
- "Pushed to the branch" is not "reachable from `main`". Report a fix as
  shipped only when its PR's `.merged` is `true` and, after
  `git fetch origin main`,
  `git merge-base --is-ancestor <the PR's .merge_commit_sha> origin/main`
  exits 0. Merges here are squashed, so test the PR's merge commit, not the
  SHA you pushed.

**Hold these for the Owner.** Label the PR `needs-review` and do not add the
`reviewed` label when the PR does any of these:

- fixes a security problem;
- encodes a product or policy decision;
- changes the automation's own guardrails, meaning anything that instructs
  agents or decides whether a PR is reviewed or merged: `.github/**`,
  `.claude/**` (settings, hooks, rules, agents, skills), `docs/routines/**`,
  the root `CLAUDE.md` or `AGENTS.md`, `scripts/reviewed-merge.mjs`,
  `scripts/fast-path-decision.mjs`, `scripts/merge-queue-eligibility.mjs` or
  `packages/agent-core/src/pr-risk-classifier.ts`. A reviewer must never be
  the only check on an edit to its own rules.

`reviewed-merge.yml` already holds every PR that touches a gate path
(`docs/adr/**`, `docs/design/**`, any `prd.md` or `architecture.md`), so those
need no extra step.

Use the GitHub MCP tools for comments and labels when a `gh` subcommand
answers HTTP 403 (load them with ToolSearch). End every comment with the
hidden marker `<!-- mbe-automation -->` on its own last line.

## 4. File an issue only when you cannot fix it

File an issue only when one of these is true:

- You could not establish the root cause this fire.
- The fix needs a human: a credential, account access, spending money, or a
  product or policy decision.
- The gates could not go green. (A fix the reviewer flagged twice stays open
  as a `needs-review` PR, per section 3; do not also file an issue.)
- The fix is larger than the routine's per-fire cap allows, or would push
  the fire's one pull request past about 400 lines.

Deduplicate first: search open and recently closed issues, and skip anything
labeled `vetoed`, `deferred` or `wontfix`. Write self-contained acceptance
criteria and include the evidence and any partial root cause you found, so the
next agent does not start from zero. Label it `ready` when an agent can fix
it, or `ready-for-human` when only the Owner can act.

## 5. Report

The routine's log entry, report or heartbeat note names each PR opened and
each issue filed, and says which findings were fixed and which were ticketed
and why.
