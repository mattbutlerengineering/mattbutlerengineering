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
7. Open one pull request per root cause against `main`. Its title ends with
   ` (<routine name>)`, for example
   `fix(scripts): skip closed PRs in the stale detector (mbe-auditor)`. The
   body states the root cause, the evidence and the fix. Verify the base is
   `main`.

If the gates cannot go green, open no pull request. Discard the branch and
treat the finding under section 4, with what you learned in the issue body.

## 3. Review, then hand off

1. Dispatch the `reviewer` subagent (Agent tool, `subagent_type: reviewer`)
   with the diff, the finding, its evidence and the gate output.
2. Post one PR comment whose first line is exactly
   `reviewer-verdict: <pass|flag> (score <N>, threshold 7)`, with the findings
   below it. The queueEfficiency sensor counts a PR as reviewed only from this
   line.
3. On a flag or a score below 7, fix what it found, re-run the gates and
   review once more. If it is still flagged, label the PR `needs-review` and
   move on.
4. On a pass with a score of 7 or higher, post a second PR comment whose
   first line is exactly
   `reviewed-merge: <head SHA, all 40 characters> PASS <score>/10`, then add
   the `reviewed` label. `reviewed-merge.yml` merges the PR once `CI Gate` is
   green on that SHA. Do not push to the branch after this comment, because
   the verdict names the head SHA.
5. Never call the merge endpoint yourself and never enable auto-merge. The
   cloud auto-mode classifier denies merges from routine sessions (#6125), and
   `reviewed-merge.yml` is the merge path.

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

**Exception (Owner, 2026-11-27, #10044).** A `mbe-dev-speed` PR whose
guardrail-path changes are confined to `.github/workflows/**` may take the
normal hand-off above, unless its diff touches the `ci-gate` job's `needs`,
a required-check name, a `permissions:` scope, secrets, a
`pull_request_target` or `workflow_run` trigger, or a merge workflow
(`reviewed-merge.yml`, `merge-queue.yml`, `auto-merge*.yml`). Those stay held.
Every other routine and every other guardrail path is unchanged.

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
- The fix is larger than the routine's per-fire cap allows.

Deduplicate first: search open and recently closed issues, and skip anything
labeled `vetoed`, `deferred` or `wontfix`. Write self-contained acceptance
criteria and include the evidence and any partial root cause you found, so the
next agent does not start from zero. Label it `ready` when an agent can fix
it, or `ready-for-human` when only the Owner can act.

## 5. Report

The routine's log entry, report or heartbeat note names each PR opened and
each issue filed, and says which findings were fixed and which were ticketed
and why.
