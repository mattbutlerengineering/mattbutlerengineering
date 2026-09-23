---
stage: review
run: maintenance:key-gated-workflows-visible-skip
date: 2026-09-23
reviewed-range: "origin/main...a210bf151 (4 commits: 660b3048f, 514d558e5, 4e88834eb, a210bf151)"
fix-commits:
  - "3ce70799e test(ci): pin claude.yml's gate conditions as whole lines"
verdict: ready-to-ship
unfixed-critical: 0
assumptions:
  - "Maintenance run with re-entry: implement. Review is scaled to a two-workflow change. Verify's evidence (regression tests red on origin/main and green on the branch, live dispatch 35898464853) is the floor and is not re-run beyond the affected tests."
  - "Severity scale follows the orchestrator's request (critical/high/medium/low) rather than the template's critical/major/minor. Medium is treated as major: fix it or defer it with a reason."
  - "Least-privilege narrowing of preflight's token (finding L1) is deferred rather than fixed. The skill offers no default for this, and the preflight job executes no untrusted code, so the extra scope cannot be reached by an attacker. Narrowing it risks the collaborator lookup failing silently (L2), which could not be observed before merge in this stage."
---

# Review: key-gated agent workflows skip visibly instead of passing silently

## Scope

Examined `git diff origin/main...HEAD` at `a210bf151`, which touches 8 files:

- `.github/workflows/claude.yml` (+80/−9): new `preflight` job, gated `dispatch`, `Build CLI`, `node tools/cli/dist/index.js`, `exit 1` on agent failure
- `.github/workflows/scheduled-issue-completion.yml` (+46/−11): new `preflight` job, gated `routine`, in-step skip removed
- `scripts/__tests__/claude-workflow.test.mjs`, `scripts/__tests__/scheduled-issue-completion-workflow.test.mjs` (new)
- `.claude/rules/gotchas.md` (one line in § Build)
- run artifacts (`autorun-brief.md`, `defect.md`, `verification.md`)

Every file is inside the brief's scope. No out-of-scope file is touched: `docs-audit.yml` and `metrics-collectors.yml` are unchanged, no secret was added, and the adapter was not changed. Reference compared: `docs-audit.yml:56-81,222-227` and `scripts/__tests__/docs-audit-workflow.test.mjs`.

## Findings

| #   | Severity           | Location                                                                | Summary                                                                                                                                                                                                  | Disposition                    |
| --- | ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| M1  | medium             | `scripts/__tests__/claude-workflow.test.mjs:68-69,96-97` (at a210bf151) | The gate tests accepted `\|\|` in place of `&&`. That edit is an authorization bypass.                                                                                                                   | **Fixed** in 3ce70799e         |
| L1  | low                | `.github/workflows/claude.yml:23-26`                                    | `preflight` inherits workflow-level `contents: write` + `pull-requests: write`, but needs only a comment scope                                                                                           | Deferred                       |
| L2  | low (pre-existing) | `.github/workflows/claude.yml:65`                                       | `2>/dev/null \|\| echo "none"` turns any API error into "not a collaborator". The skip is then silent, with no comment.                                                                                  | Deferred (flag)                |
| L3  | low                | `.github/workflows/claude.yml:99-103`                                   | A collaborator's `@claude` in a review on a **fork** PR runs with a read-only token, so `Explain the skip` gets a 403 and `preflight` goes red                                                           | Deferred                       |
| L4  | low                | `verification.md:10`                                                    | Says claude.yml runs only from the default branch, so live proof has to wait for merge. `pull_request_review(_comment)` events run the PR merge ref's workflow, so live proof is available before merge. | Deferred to Ship (opportunity) |
| L5  | low                | `.github/workflows/claude.yml:139-140,167`                              | If the new `Build CLI` step fails, the outcome comment says "cancelled"                                                                                                                                  | Deferred                       |
| L6  | low                | `scripts/__tests__/claude-workflow.test.mjs:107-108`                    | The injection guard scans only `comment\|review`.`body\|user`, not other untrusted event fields                                                                                                          | Deferred                       |
| L7  | low (pre-existing) | `.github/workflows/claude.yml:28-30`                                    | Concurrency group + `cancel-in-progress: false`: a later comment on the same issue replaces a _pending_ `@claude` run                                                                                    | Deferred (flag)                |
| L8  | low (pre-existing) | `docs/acmm/SKELETON-AUDIT.md:24`, `docs/ai-tooling-audit.md:115,181`    | Stale claims about claude.yml ("active", "not present")                                                                                                                                                  | Deferred (flag)                |

### Medium M1: the gate tests could not see an `&&` → `||` edit (FIXED)

- Scenario: edit `claude.yml:109` to `if: needs.preflight.outputs.authorized == 'true' || needs.preflight.outputs.has_key == 'true'`. Once a key exists, a non-collaborator's `@claude` then reaches `dispatch`, and the agent runs with `contents: write` on their prompt. Edit `claude.yml:100` the same way and every keyless `@claude` from anyone gets a bot reply. **Measured:** with both mutations applied, `claude-workflow.test.mjs` reported `7 passed (7)`. Each condition was matched by two independent `/if:.*X/` regexes, so they could match any `if:` or comment line in the block and ignored the connective.
- Decision: **fixed** (3ce70799e). Both assertions now match the whole condition as one anchored line (`/^ {4}if: … && …$/m`, `/^\s+if: … && …$/m`). RED: each mutation now fails the test (`1 failed | 6 passed`, measured once per mutation). GREEN: the real file passes, `12 passed (12)` across both workflow tests. `actionlint` is clean on both workflows and prettier is clean. The workflow was restored byte-for-byte after each mutation (`git diff --stat .github` is empty).

### Low L1: preflight has broader token scope than it needs

- Scenario: `permissions:` is workflow-level (`claude.yml:23-26`), so `preflight` gets `contents: write`. It does no checkout and runs no untrusted code: only the permission lookup (`:65`) and one `gh issue comment` (`:103`). Anyone can trigger it on a public repo by commenting `@claude`, but no attacker-controlled input reaches a shell (see Security), so the excess scope cannot be exploited. The old single `dispatch` job ran the same auth step with the same scope, so this is not a regression.
- Decision: deferred. A job-level `permissions: { issues: write, pull-requests: write }` is the obvious fix. It changes the token the collaborator lookup uses, and because of L2 a scope mistake there would show up only as every collaborator silently becoming "unauthorized". Ship it as a separate change and verify it live (see L4). The docs-audit reference pattern does not scope its preflight either.

### Low L2 (pre-existing): an API error in the collaborator lookup looks like a non-collaborator

- Scenario: the GitHub API fails, is rate-limited, or the token lacks scope. `role` becomes `none` (`claude.yml:65`), so `authorized=false`, `dispatch` is SKIPPED, and `Explain the skip` does not run. The collaborator gets no reply. It fails closed, but silently, which is the same class of silence this run exists to remove. The line is unchanged from origin/main except for the added `set -euo pipefail`, and the `|| echo` keeps that from changing behaviour.
- Decision: deferred. The line is pre-existing and outside the brief's scope. A good backlog seed: distinguish "API said not a collaborator" from "API call failed" and fail the job on the latter.

### Low L3: fork-PR review mentions turn preflight red

- Scenario: the repo is public (`gh repo view` → `PUBLIC`). A collaborator writes `@claude` in a review on a PR from a fork. `pull_request_review` from a fork gets a read-only `GITHUB_TOKEN` and no secrets, so `authorized=true`, `has_key=false`, `gh issue comment` returns 403, and `preflight` fails. Before this change, `dispatch`'s `Acknowledge` step failed the same way, so the job was red then too. Not a regression, and it can never grant anything.
- Decision: deferred. This is an edge case with no security impact, and the fix (skip the comment when `github.event.pull_request.head.repo.fork`) is behaviour the brief did not ask for.

### Low L4: claude.yml can be proven live before merge

- Scenario: `verification.md:10` says claude.yml "runs from the default branch, so its live proof is post-merge only". That holds for `issue_comment`. For `pull_request_review` and `pull_request_review_comment`, GitHub runs the workflow file at the PR's merge commit (`refs/pull/N/merge`), so the branch's claude.yml is what runs. This comes from GitHub's documented event semantics and was not probed in this stage.
- Decision: deferred to Ship as an optional probe. After the PR opens, Matt (a collaborator) leaves a review comment containing `@claude` on it. Expected: `Preflight` = success, `dispatch` = skipped, and one "Skipped: no agent credential in CI (#3585)" comment. This does not change the verification verdict. It is extra evidence, not a missing criterion.

### Low L5: a `Build CLI` failure is reported as "cancelled"

- Scenario: `pnpm build --filter @mbe/cli...` fails (`claude.yml:140`). `Run agent` is skipped, `steps.agent.outputs.outcome` is empty, and `Report outcome` (`if: always()`, `:164-169`) posts "Agent run finished: cancelled". The job is still red and the comment links the run, so this is not a false success. The label is wrong. The `|| 'cancelled'` fallback is pre-existing and shared with `scheduled-issue-completion.yml`'s Summary step. This diff adds a new failure path that reaches it.
- Decision: deferred. The keyed path only, which CI cannot reach (keyless by design), and the job conclusion is correct.

### Low L6: the injection guard test is narrow

- Scenario: `claude-workflow.test.mjs:107-108` fails only when `github.event.(comment|review).(body|user)` is interpolated outside an env assignment. A future `run: echo "${{ github.event.issue.title }}"` would pass. There are none today: the only `${{ }}` inside `run:` blocks are `github.repository`, `github.server_url` and `github.run_id` (`claude.yml:65,103,151,169`), all trusted.
- Decision: deferred. The current file is clean and widening the regex is hardening beyond the brief.

### Low L7 (pre-existing): concurrency can drop a pending `@claude` run

- Scenario: `concurrency: claude-<n>`, `cancel-in-progress: false` (`claude.yml:28-30`). While one run is in progress, GitHub keeps one pending run and cancels any older pending one. So on a keyed repo, `@claude` followed by any other comment on the same issue, while an earlier run is still going, drops the `@claude` run. Keyless today, so the effect is inert.
- Decision: deferred (flag). Unchanged by this diff.

### Low L8 (pre-existing): stale docs about claude.yml

- Scenario: `docs/acmm/SKELETON-AUDIT.md:24` says claude.yml is "✅ Functional … exists and is active". `docs/ai-tooling-audit.md:115,181` say it is not present. Neither describes skip behaviour, and defect.md's notes already record them as out of scope.
- Decision: deferred (flag).

## Focus-area answers

1. **Security of claude.yml.** No untrusted `${{ github.event.* }}` text is interpolated into `run:`. `COMMENT_BODY` and `COMMENT_AUTHOR` enter only through `env:` (`:55,114`), and the mention filter is a `contains()` expression (`:44-47`). A non-collaborator **cannot reach `dispatch`**. It requires `authorized == 'true'` (`:109`), and only the `admin|maintain|write` branch writes that value (`:67-70`). A custom `if:` without a status function carries an implicit `success()`, so a failed or errored `preflight` skips `dispatch` (fails closed). A non-collaborator **cannot make the bot comment**: `Explain the skip` requires `authorized == 'true'` (`:100`). The M1 fix pins both conditions. `COMMENT_AUTHOR` is a GitHub-assigned login and cannot be spoofed. The bot's own comments contain no `@claude` and are posted with `GITHUB_TOKEN`, so they cannot retrigger the workflow. For forks and token scope, see L3 and L1.
2. **Keyed-path behaviour change.** The `exit 1` (`claude.yml:161`) is intended: defect.md work item 3 requires "the agent step records `outcome=failure` **and** fails the step (`exit 1`)". It matches the pre-existing `exit 1` in `scheduled-issue-completion.yml`'s agent step. `Report outcome` still posts. `if: always()` runs after a failed step, and `outcome=failure` is written to `$GITHUB_OUTPUT` before the `exit 1` (`:160-161`), so the comment reads "failure", not "cancelled". Adding `set -euo pipefail` does not break the `if node …; then` form, because errexit is suppressed inside an `if` condition.
3. **Faithful to #5458 and the brief.** The structure matches docs-audit: a `preflight` job with `outputs: has_key`, `set -euo pipefail`, true and false branches, a `$GITHUB_STEP_SUMMARY` note naming #3585, and a gated job with `needs: preflight` plus a job-level `if:`. claude.yml adds a second output (`authorized`) and the skip comment. Both were decided at capture (assumptions 1-3 in defect.md). There is no scope creep. The gotchas.md edit (`.claude/rules/gotchas.md:32`) is accurate: it keeps the general `pnpm exec mbe` gotcha and correctly puts claude.yml's share of it in the past tense, citing the `Build CLI` step, the `node tools/cli/dist/index.js agent run` call and the pinning test, all of which exist on the branch.
4. **Test quality.** The tests are string-structural, which is the house convention (`docs-audit-workflow.test.mjs` uses the same `jobBlock()` helper and the same `/if:.*…/` style at its line 53). Within that convention they pin the right things: job ordering (`build < run` index check), no `exit 0` or `outcome=skipped` in the gated jobs, and failure followed by `exit 1`. The one real hole was M1, where two independent regexes stood in for a boolean conjunction, and it is fixed. Residual fragility is cosmetic. A reflow of the `if:` onto a `|` block, or renaming a step, would fail the tests. That is the correct direction: a false red, never a false green. `scheduled-issue-completion-workflow.test.mjs` has only a single-operand `if:`, so it does not share M1.
5. **Pre-existing smells** are flagged, not fixed: L2, L7, L8, and the shared `|| 'cancelled'` fallback in L5.

## Passes with no findings

- **Correctness** of `scheduled-issue-completion.yml`: clean. The routine job keeps its `ANTHROPIC_API_KEY` env for the keyed path. Removing the in-step skip leaves `set -euo pipefail` plus the existing `if … then … else exit 1` form. Verify's live dispatch (35898464853) showed `routine` with zero steps.
- **Design**: clean apart from M1. The deviations from docs-audit (the `authorized` output and the skip comment) are documented in defect.md's assumptions.
- **Security**: no critical or high findings. There is no injection surface, the authorization boundary is intact and now pinned, and no secrets are in code.

## Verdict

**Ready to ship.** No critical or high findings. The one medium (M1) is fixed in 3ce70799e and verified by mutation. All lows are deferred with reasons, and L4 is handed to Ship as an optional live probe before merge. Next stage: Ship (prepare-and-stop per the brief).
