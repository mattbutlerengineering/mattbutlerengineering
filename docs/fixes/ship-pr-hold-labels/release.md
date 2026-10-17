---
stage: ship
run: maintenance:ship-pr-hold-labels
date: 2026-10-17
assumptions:
  - "'Production' for a repo-local project skill is `.claude/skills/ship-pr/SKILL.md` on `main`: Claude Code sessions load it from a checkout of `main`, so the merge of PR #7014 is the release. No deploy, tag, version or publish exists for it, so none is cut (brief: 'No deploy, tag or publish exists for a skill file')."
  - "The merge is executed by the orchestrator through the repo's implement-queue gate after this stage, not here (stage instruction). The Release log therefore records the exact step and its preconditions, and the Post-release checks are listed as pending rather than reported as done."
  - "Ship depth follows the protocol's Run scale for a maintenance run with one markdown file in the diff. The full local-ci-precheck still ran (CLAUDE.md § Pipeline Stage Hooks), with lint and typecheck lanes sequential rather than parallel per the stage instruction (parallel lanes race on packages/rialto/dist)."
  - "PR #7014's body has no `## Merge danger` heading, so the protocol's 'release.md and the PR body make the same call' cannot be checked against it. This artifact makes the call below; the PR body was not edited, because the stage instruction does not authorize PR edits. Flagged for the orchestrator."
  - "The `CI Gate` recorded here is green on `eef473d59`. Committing this file moves the PR head, so the merge precondition is a green `CI Gate` on the new head, re-classified at merge time."
---

# Release: /ship-pr honours hold labels (PR #7014)

## Pre-flight

All run against the worktree head `eef473d59a9875f9f9a51556d5fafed43dd858e7`
(= `origin/fix/ship-pr-hold-labels` = PR #7014 `headRefOid`), 0 commits
behind `origin/main` `4a2981e9a`. Node `v22.22.3`, `.nvmrc` `22`.

- [x] **Review soft gate.** `review.md`: `unfixed-critical: 0`,
      `unfixed-major: 0`, verdict "Ready to ship". R1 and R2 fixed in
      `67c9178d1`; R3 and R4 deferred (Follow-ups).
- [x] **Verification green.** `verification.md`: "8 of 8 criteria PASS, 0
      FAIL", § Failures "None", and § Re-check after Review fix re-ran the
      drift checks on `67c9178d1`, all exit 0.
- [x] **No secrets in the diff.** `git diff origin/main...HEAD` added lines
      grepped for `sk_live_|pk_live_|rk_live_|AKIA…|BEGIN … PRIVATE KEY|eyJ…`
      → `0` hits. **No target config needed**: the skill is markdown read by
      an agent; it needs only the `gh` auth its commands already use.
- [x] **Migrations/data:** none. The diff is `.claude/skills/ship-pr/SKILL.md`
      plus this run's artifacts; `docs/adr/`, `migrations/`, `schema.prisma`
      paths in the diff → `0`.
- [x] **ADRs:** none added by this run, so no number to confirm.
- [x] **Rollback plan concrete** (below).
- [x] **local-ci-precheck** (`.claude/skills/local-ci-precheck/SKILL.md`,
      steps executed directly, lanes sequential):

  | Step                                                                                     | Result                                                                                                                  |
  | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
  | 1 `pnpm install --frozen-lockfile`                                                       | exit 0, `Done in 4s`                                                                                                    |
  | 2 `pnpm lint`                                                                            | exit 0, `Tasks:    52 successful, 52 total`                                                                             |
  | 3 `pnpm typecheck`                                                                       | exit 0, `Tasks:    52 successful, 52 total`                                                                             |
  | 4 `@mbe/cli` build + `check-adr` + `check-deps`                                          | exit 0, `✅ No architectural violations detected.` / `✅ All external dependencies are consistent across the monorepo.` |
  | 5 drift: `pnpm graph`, `pnpm generate:dep-graph`, `git diff --exit-code`, `pack --check` | exit 0, dep-graph diff empty, `pack --check clean on 27 dirs`; `git status --short` empty afterwards                    |

- [x] **Run-specific drift checks** (brief § Constraints):
  - `node scripts/check-skill-references.mjs` → exit 0, `PASS: Every
/slash-command named in an instruction file resolves to a skill or is
declared with a reason.` / `PASS: No repo-local skill shares a plugin
skill's name without a declared reason.`
  - `node scripts/check-claude-md-table-drift.mjs` → exit 0, `PASS: CLAUDE.md
tables (CLI commands, skills, subagents) match the repo tree.`
  - `node scripts/detect-instruction-rot.mjs` → exit 0, `✓ No instruction rot
detected.`
- [x] **CI Gate on PR #7014** (15:02Z):
      `node scripts/ci-gate-status.mjs check --pr 7014` →
      `{"state":"green","reason":"CI Gate succeeded"}`. Cross-checked on the
      head SHA: check run `CI Gate completed success 2026-10-17T15:00:17Z`,
      commit status `CI Gate success`; `gh pr checks 7014` → 20 pass, 18
      skipping, 0 fail. PR state `OPEN`, not draft, labels `[tier:trivial]`
      (no `hold_labels` label), base `main`.

## Rollback plan

Door: two-way — the change is prose in one repo-local skill file plus run
artifacts; a revert PR restores the previous text exactly, and nothing
outside the repo consumes it.

Blast radius: only sessions that invoke `/ship-pr` (no routine or workflow
calls it). If the call is wrong, `/ship-pr` either stops too eagerly (reports
`held — <label>` on a PR a human meant to release) or a hold path is still
missed; no runtime code, deploy, package or data is affected.

```
# 1. Find the squash commit the merge produced
gh pr view 7014 --json mergeCommit -q .mergeCommit.oid      # -> <merge-sha>

# 2. Revert it on a fresh branch from main, in a worktree (never the main checkout)
git fetch origin
git worktree add -b revert/ship-pr-hold-labels <worktree-path> origin/main
git -C <worktree-path> revert --no-edit <merge-sha>
git -C <worktree-path> push -u origin revert/ship-pr-hold-labels

# 3. Open the revert PR and merge it through CI Gate like any other change
gh pr create --base main --head revert/ship-pr-hold-labels \
  --title "revert: fix(ship-pr): stop on hold labels before review and merge (#7014)" \
  --body "Reverts #7014. Reason: <observed failure>."
gh pr merge <revert-PR> --auto --squash --delete-branch \
  --subject "revert: fix(ship-pr): stop on hold labels before review and merge (#<revert-PR>)"
```

A revert reintroduces review Major 1 (`/ship-pr` merging past a
`needs-review` hold), so prefer a fix-forward PR to the skill unless the new
text itself causes harm.

## Release log

1. Pre-flight above → all green on `eef473d59`.
2. Commit this `release.md` (`docs(ship-pr-hold-labels): release record`) and
   push → the PR head moves; CI re-runs on the new head.
3. **Release step (orchestrator, not executed in this stage):** once
   `node scripts/ci-gate-status.mjs check --pr 7014` reports `green` on the
   new head, the PR still carries no `hold_labels` label, and the repo's
   implement-queue gate passes (fast path if the classifier allows it,
   otherwise the universal reviewer plus any diff-matched specialist):

   ```
   gh pr merge 7014 --auto --squash --delete-branch \
     --subject "fix(ship-pr): stop on hold labels before review and merge (#7014)"
   ```

   If GitHub reports the PR `CLEAN` and refuses `--auto`, merge directly with
   the same command minus `--auto`. The explicit `--subject` follows gotchas
   § CI (a squash takes the PR title as cached, not as last edited).

## Post-release checks

Pending — to run after the merge in step 3:

- Skill on `main` matches the branch:
  `git fetch origin && git diff <final-PR-head-sha> origin/main -- .claude/skills/ship-pr/SKILL.md`
  → empty (the branch is deleted on merge, so compare by the head SHA, not
  the branch name).
- Merge subject landed as passed: `git log -1 --format=%s <merge-sha>`.
- Drift checks on `main` (in a detached worktree of `origin/main`):
  `node scripts/check-skill-references.mjs`,
  `node scripts/check-claude-md-table-drift.mjs`,
  `node scripts/detect-instruction-rot.mjs` → all exit 0.
- Push CI on the merge SHA: `gh run list --branch main --limit 5`, keyed on
  `headSha` == `<merge-sha>`, `CI Gate` job conclusion `success` (the
  workflow-level rollup is not enough, per gotchas § CI).
- No tracker intake (`defect.md` has no `intake:`), so no issue to close.

## Follow-ups

Proposed `docs/backlog.md` lines, in text only; `docs/backlog.md` was not
edited.

- `- Pin /ship-pr's merge to the reviewed head: add --match-head-commit <headRefOid> to .claude/implement-queue.md § merge-command and have /ship-pr pass step 1's headRefOid, so a push during review cannot merge unreviewed commits (CI Gate still gates them today) — review R3 (from: maintenance:ship-pr-hold-labels)`
- `- Name gh api REST equivalents for /ship-pr's GraphQL-backed label reads (repos/{owner}/{repo}/pulls/<N>, /issues/<M>) so steps 1 and 5 work in Claude Code Remote, where gh pr view / gh issue view return HTTP 403 GraphQL-unavailable (fails closed today) — needed only if /ship-pr is ever scheduled — review R4 (from: maintenance:ship-pr-hold-labels)`
- `- Record one node invocation for reviewersForDiff / qualifiesForLowRiskFastPath / matchesGatePath in the implement-queue profile that fails closed on an import error; /ship-pr points to it and names matchesGatePath instead of GATE_PATHS — ship-pr review Minor 2 (from: feature:ship-pr)`
- `- Record the first real /ship-pr run on a green PR (reviewer dispatch, --auto or CLEAN-direct merge, [Merge Without Review] stop, and now the held — <label> stop) as end-to-end evidence; its review-and-merge half has never run — ship-pr review Minor 5 (from: feature:ship-pr)`
- `- Fix the implement-queue profile § ci-status sentence calling the ci.yml commit-status fix for gate-unattributed "not-yet-implemented"; it landed in #4025 and was confirmed live 2026-08-24 — ship-pr review Minor 6 (from: feature:ship-pr)`
- `- Stop local-ci-precheck's lint, typecheck and drift lanes racing on parallel turbo builds of packages/rialto/dist (ENOENT useThemeState.d.ts, 2026-10-17): build shared deps once before fanning out, or run the lanes sequentially (from: feature:ship-pr)`

## Outcome

Ready to release, not yet released. Pre-flight is green on `eef473d59` and
`CI Gate` was `green` there. The release is the orchestrator's squash merge
of PR #7014 through the implement-queue gate, after `CI Gate` is green on the
head this commit creates. Post-release checks run after that merge.
