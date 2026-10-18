---
stage: ship
run: feature:dependabot-auto-merge
date: 2026-10-18
outcome: released
released-at: 2026-10-15
released-commits:
  - 3e336927a38b56432274a7fd6c5a39cb75a62fd1 (squash of PR #6680, head 0c990d0ee, merged 2026-10-15T05:52:32Z by mattbutlerengineering)
preflight-head: 332cfd044 (branch docs/dependabot-auto-merge-close, cut from origin/main; contains 3e336927a)
assumptions:
  - "This Ship stage records a release that already happened (brief § Resume 2026-10-18). The Conductor merged #6680 to main on 2026-10-15. No release action was taken here: no merge, deploy, tag, publish, push, PR, issue, label or workflow dispatch."
  - "The repo's Ship pre-flight hook (`local-ci-precheck`) ran on this branch's head, 332cfd044, not on 3e336927a. The worktree is cut from origin/main, and the hook is defined against the final branch head. #6680's own gate is recorded from CI (Release log 1-2)."
  - "Versioning and tagging: this release is a Dependabot config, a workflow and a script under `scripts/`. They take effect on the default branch at merge. No published package changes, so no changeset, version or tag applies. This is the repo's convention; no default was needed."
  - "Rollback default: a whole-commit `git revert` of 3e336927a, restoring this run's `breakdown.md` from HEAD. This stage chose it without live Owner input, because it applied cleanly when tested (see Rollback plan)."
  - "Minor m4 is listed among the seeds as the instruction asked. The Owner folded it into the pending M1 fix ('Fix now + m4'), so it is a seed only if that fix PR drops it."
  - "Follow-ups are listed as seed-grammar text in this artifact only. This stage writes no `docs/backlog.md` line; Operate appends seeds at run close."
---

# Release: auto-merge official-action and @types Dependabot bumps on green CI (#6650 via PR #6680)

The release already happened. The Conductor squash-merged #6680 to `main` at
2026-10-15T05:52:32Z as `3e336927a` ("ci(deps): auto-merge official-action
and @types Dependabot bumps via a pure policy (#6680)"). The change ships as
config and workflow on the default branch. `.github/dependabot.yml` gains an
`official-actions` group (`actions/*`, `github/*`) and a `types` group
(`@types/*` with no dependency-type restriction). `dependabot-auto-merge.yml`
now asks the pure policy `scripts/dependabot-auto-merge-policy.mjs` whether to
arm `gh pr merge --auto --squash` or to comment for manual review. Both took
effect at merge. Dependabot ran both ecosystems against the new groups within
seconds (Release log 3). This artifact records the pre-flight, the evidence
that it took effect, the rollback plan and the open defects. This stage
released nothing.

## Pre-flight

- [x] **Verification green.** `verification.md` (`33ed4e520`) reports 8 PASS,
      0 FAIL and 1 NOT SHOWN. C9 is the NOT SHOWN: a live in-policy auto-merge
      and its p90, which needs in-policy Dependabot PRs (n=0 so far). It is an
      evidence gap, not a failure. `review.md` (`7020754c3`) reports **no
      critical** finding, two majors and four minors. The Owner decided both
      majors live on 2026-10-18 (brief § Review decisions). M1 is a fix now,
      with its PR pending outside this run. M2 is deferred to a seed. Nothing
      routes back to Implement.
- [x] **No secrets in the diff; target config present.** `Secret Scan` push
      run 38689165967 on `3e336927a`: job `Gitleaks Secret Scan` success.
      #6680's head check `Gitleaks Secret Scan` was also success. The workflow
      uses only `secrets.GITHUB_TOKEN` with `contents: write` and
      `pull-requests: write` (review § Passes). It needs no new secret,
      variable or repository setting. `allow_auto_merge: true` is already on
      (gotchas § CI).
- [x] **Migrations/data changes have a tested forward path.** None exist. The
      diff touches `.github/dependabot.yml`,
      `.github/workflows/dependabot-auto-merge.yml`, `scripts/` (a policy and
      two tests) and this run's `breakdown.md`.
- [x] **ADRs.** The run added none. The reserved ADR-98..100 are unused, as
      `architecture.md` records: both decisions are two-way doors that follow
      the `merge-queue-eligibility.mjs` pattern.
- [x] **Rollback plan concrete.** See below. Tested 2026-10-18, it applies
      cleanly.
- [x] **Launch brief hook.**
      `python3 <ship skill>/../../launch_demo.py config` printed `NONE` and
      `launch-demo: 0 problem(s)`, exit 0. The repo has no launch-demo config,
      so nothing was run or written.
- [x] **Repo Ship pre-flight hook (`local-ci-precheck`) on the final head,
      332cfd044.** The steps in `.claude/skills/local-ci-precheck/SKILL.md`
      were run directly on Node v22.22.3 (`.nvmrc`: 22). Every lane exited 0.
      See Release log 5. The hook ran after the release, so it confirms that
      today's `main` (plus this run's docs) is clean. The merge did not pass
      through it as a gate.

## Rollback plan

Door: two-way. The release is a Dependabot config, one workflow and one pure
script with its tests. It adds no schema, data, published package or public
interface. A revert PR restores the previous grouping and workflow. Dependabot
reads `dependabot.yml` from the default branch on its next run.

Blast radius: Dependabot PRs on this repo only. If the call is wrong (the
release, or its revert), official-action and `@types/*` patch/minor bumps
either merge themselves on a green `CI Gate` or wait for a hand merge again,
which is the pre-release state. Nothing that users get is touched: no app,
service, deploy or data. One caveat: anything this workflow already merged
stays merged. A revert stops future arming but does not unmerge a past
Dependabot PR.

**Measured 2026-10-18 on 332cfd044.** `git revert --no-commit 3e336927a` in
this worktree exited 0 with no conflicts. It staged
`M .github/dependabot.yml`, `M .github/workflows/dependabot-auto-merge.yml`,
`M docs/features/dependabot-auto-merge/breakdown.md`, and
`D` on the policy and its two test files. Then `git revert --abort` exited 0,
`git status --porcelain` printed nothing, and HEAD was still `332cfd044`.
`git log 3e336927a..origin/main` (tip `af0d8d546`) on those six paths printed
nothing, so the revert still applies to today's `main`. **When the M1 fix PR
merges, it rewrites `dependabot-auto-merge.yml`.** After that, a whole revert
of `3e336927a` will conflict there, so revert the M1 fix first (newest first).

Deploys and merges go through GitHub only. There is no runtime to roll back.

```
# Preferred: whole-commit revert, keeping this run's docs
git fetch origin main
git switch -c revert/dependabot-auto-merge origin/main
git revert --no-commit 3e336927a        # if the M1 fix has merged: revert it first
git checkout HEAD -- docs/features/dependabot-auto-merge/breakdown.md
pnpm --dir scripts lint && pnpm --dir scripts test
git commit -m "revert: restore manual Dependabot merges for actions and @types (reverts #6680)"
#   push, open a PR, merge on a green CI Gate

# Immediate stop while the revert PR is in review: disarm any open armed PR
gh api "repos/mattbutlerengineering/mattbutlerengineering/pulls?state=open&per_page=100" \
  --jq '.[] | select(.user.login=="dependabot[bot]" and .auto_merge != null) | .number' \
  | while read -r n; do gh pr merge "$n" --disable-auto; done
#   Or disable the workflow outright:
#   gh workflow disable dependabot-auto-merge.yml

# Verify after the revert merges
gh api repos/mattbutlerengineering/mattbutlerengineering/contents/.github/dependabot.yml \
  --jq .content | base64 -d | grep -c official-actions        # expect 0
#   The next Dependabot "github_actions ... Update" run's job definition should
#   show "dependency-groups":[] for github_actions.
```

## Release log

1. **Merge.** #6680 head `0c990d0ee` was squash-merged by
   `mattbutlerengineering` (the Conductor's merge turn) at
   2026-10-15T05:52:32Z as `3e336927a`. #6650 closed at 05:52:34Z. PR-head
   checks, read from `gh api repos/…/commits/0c990d0ee…/check-runs`:
   **`CI Gate` success** (05:49:05Z). `Build`, `Test (Node 22)`, `Lint`,
   `Typecheck`, `Integrity`, `Architecture Audit`, `Gitleaks Secret Scan`,
   `CodeQL` and `ADR compliance` were all success. `codecov/patch` was
   **failure**. It is advisory, not a required context (gotchas § CI: the only
   required check is `CI Gate`).

2. **CI on the merge SHA.** Push runs on `3e336927a`, found with
   `gh api …/actions/runs?head_sha=3e336927a…`:
   - `CI` run 38689165879: **cancelled**, `jobs: []` (superseded on `main`).
     The commit status on `3e336927a` is `pending` with no contexts.
     `Release` run 38689165941 was cancelled with no jobs.
     `Post-Merge Reconciliation` run 38689165887 was cancelled
     (`Regenerate Generated Files: cancelled`).
   - `ADR check` run 38689165885: job `ADR compliance` success.
     `Secret Scan` run 38689165967: job `Gitleaks Secret Scan` success.
   - The next `main` commit, `61330001f` (#6682), is `3e336927a`'s direct
     child (`git rev-parse 61330001f^` = `3e336927a…`). Its `CI` run
     38689178585 has these job conclusions: **`CI Gate` success**, `Build`
     success, `Test (Node 22)` success, `Lint` success, `Typecheck` success,
     `Integrity` success, `Architecture Audit` success, `Dockerfile Lint`
     success. Commit status `combined=success`
     (`CI Gate:success`, `codecov/patch:success`).
   - Hiccup, for the next release: `3e336927a` never got a `main`-push CI
     verdict of its own. Its tree was gated by the PR CI (row 1) and by its
     child's `main` CI.

3. **Took effect: Dependabot read the new groups at merge.** The merge
   triggered two Dependabot update runs on `3e336927a` (event `dynamic`):
   - `github_actions in /. - Update #1628909388`, run 38689173144, success.
     The job definition in its log carries
     `"dependency-groups":[{"name":"official-actions","rules":{"patterns":["actions/*","github/*"]}}]`.
     The log shows `Starting update group for 'official-actions'`, then
     `No update needed` for every official action (`actions/checkout 7.0.1`,
     `actions/setup-node 7.1.0`, `github/codeql-action/upload-sarif 4.38.3`
     and the rest), and also for the third-party `hadolint/hadolint-action`,
     `dorny/paths-filter` and `grafana/k6-action`. No PR was opened.
   - `npm_and_yarn in /. - Update #1628909382`, run 38689172954, success.
     Its groups are `production-deps`, `types` and `dev-deps`. The log shows
     `Checking specificity for @types/<x> in group 'types'` for six `@types`
     packages, then `Starting update group for 'types'` and
     `No update needed` for each of them (`@types/node 26.6.5` and the rest).
     The `production-deps` group opened **#6685**.

4. **First `dependabot-auto-merge.yml` runs after the merge.** All runs created
   since 05:52:32Z, paginated from
   `gh api …/actions/workflows/dependabot-auto-merge.yml/runs?created=>=2026-10-15T05:52:32Z`:
   **370 runs**, 369 `skipped` and 1 `success`.
   - The 369 skips are non-Dependabot PRs (actor `mattbutlerengineering`).
     The job-level `if: github.actor == 'dependabot[bot]'` gate skipped each
     one, as designed.
   - **Run 38689740212** (2026-10-15T05:58:50Z, `pull_request_target`, actor
     `dependabot[bot]`, head `2891cb9d5`, PR #6685) is the earliest run in the
     window and the only one that ran. Its job `auto-merge` was success. Steps:
     `Checkout base repo (policy script only)` success,
     `Fetch Dependabot metadata` success, `Decide` success, `Auto-merge`
     **skipped**, `Comment on PRs needing manual review` success.
     Verification (C2) read its log: the checkout fetched base `61330001f`,
     which contains `3e336927a`, so #6680's policy ran. It decided manual for
     a `production-deps` patch, which is correct. #6685 was merged by hand at
     11:17:09Z, with `auto_merge: null`.
   - Open Dependabot PRs at 2026-10-18: none (`[]`).

5. **Ship pre-flight hook (`local-ci-precheck`) on 332cfd044.** Run on Node
   v22.22.3. Logs are in the session scratchpad (`dep-ship/*.log`).
   - `pnpm install --frozen-lockfile` exit 0.
   - `pnpm lint` exit 0 (52/52 tasks; `@mbe/hospitality` has 145 warnings and
     0 errors).
   - `pnpm typecheck` exit 0 (52/52 tasks). No unrelated package build was
     missing.
   - arch-audit (`@mbe/cli` build, `check-adr`, `check-deps`) exit 0.
     It reported "No architectural violations detected" and "All external
     dependencies are consistent across the monorepo".
   - The drift lane exited 0. `pnpm graph` and `pnpm generate:dep-graph` left
     `git diff --exit-code` clean, and `mbe pack <dir> --check` reported
     "is in sync" 27 times with 0 stale.
   - `git status --porcelain` printed nothing afterwards.

6. **Launch brief.** `launch_demo.py config` printed `NONE` and
   `launch-demo: 0 problem(s)`, exit 0. Nothing ran.

## Post-release checks

- **Config is live on the default branch.** Dependabot's own job definitions
  on `3e336927a` carry `official-actions` (github_actions) and `types`
  (npm). See Release log 3.
- **The workflow runs #6680's policy, from the base.** Run 38689740212 checked
  out base `61330001f` and decided manual for an out-of-policy PR, which is
  correct. See Release log 4.
- **The security gate holds.** 369 non-Dependabot `pull_request_target` runs
  were skipped at job level. No out-of-policy PR auto-merged (verification
  C8).
- **Pending evidence, not yet observable:**
  - The next scheduled Dependabot run. Both ecosystems are `weekly` on
    `monday`, so the next is **Monday 2026-10-19**. It is the first chance
    for an in-policy (`official-actions` or `types`) PR to arm and complete
    auto-merge on a green `CI Gate`. What happens there is not predicted here.
  - Verification C9 stays NOT SHOWN: a live in-policy auto-merge, and the
    in-policy p90 against the ~24 h baseline. It is Operate's minimum signal:
    at least 10 post-#6680 Dependabot PRs, with the in-policy p90 open→merge
    measured.
- **Intake issue to close:** none. This is a feature run. #6650 closed at
  merge (05:52:34Z).

## Open known defects

- **M1 (security, review Major): armed auto-merge is never revoked.** Once
  `gh pr merge --auto` is armed, a later push by anyone else is not
  re-evaluated (the actor gate skips it), and a later Dependabot push that the
  policy rejects only comments. So the PR merges whatever head exists when
  `CI Gate` goes green. This was observed on #6577 with the pre-#6680
  workflow, and #6680 extends it to `official-actions` and `types`.
  - **Owner decision (2026-10-18, live): "Fix now + m4."** A separate fix PR,
    **outside this run**, makes the workflow re-evaluate on every
    `synchronize` and run `gh pr merge --disable-auto` unless the head commit
    is still authored by `dependabot[bot]` and the policy still decides
    `merge`. It also adds the
    `github.event.pull_request.user.login == 'dependabot[bot]'` gate (m4). It
    is written RED-test-first, and the Owner merges it.
  - **Status: fix PR open, awaiting the Owner's merge: #7087** (`0cb0ad6ed`,
    branch `fix/dependabot-disarm-on-foreign-push`). It includes m4.
  - Exposure until it lands: no Dependabot PR is open or armed today (Release
    log 4). The first in-policy PRs can arrive Monday 2026-10-19. Until the
    fix merges, do not push non-Dependabot commits onto an armed Dependabot PR
    without first running `gh pr merge <N> --disable-auto`.
- **M2 (design, review Major): merges completed with `GITHUB_TOKEN` fire no
  `push` workflows.** `main` CI, Release and Post-Merge Reconciliation skip
  those merge commits, and `main` is not `strict`. Owner decision: "Defer to
  seed" (see Follow-ups). Not fixed in this release.
- **Verification C9 NOT SHOWN:** live in-policy auto-merge and its p90. This
  is not a defect. It is evidence that does not exist yet (n=0 in-policy). It
  is Operate's minimum signal.

## Follow-ups

None were filed. These are proposed seeds in the `docs/backlog.md` line format.
Operate appends them at run close.

1. **M2 (Owner: "Defer to seed").** It needs an Owner-minted secret, tied to
   the existing `AUTOMATION_PAT` gap in `docs/SECRETS.md`.
   `- Arm Dependabot auto-merge with a GitHub App or PAT token instead of GITHUB_TOKEN so merges it completes fire main's push workflows (CI, Release, Post-Merge Reconciliation); blocked on the Owner minting the AUTOMATION_PAT/App secret (docs/SECRETS.md) (from: feature:dependabot-auto-merge)`
2. **m1 (deferred).**
   `- Give decideDependabotMerge's dev-deps branch the same per-name prefix check official-actions and types have, mirroring dependabot.yml's dev-deps patterns, so widening those patterns cannot silently widen auto-merge (from: feature:dependabot-auto-merge)`
3. **m2 (deferred; a policy change for the Owner, best done with m1).**
   `- Route scoped lint tooling (@eslint/*, @eslint-react/*, typescript-eslint) out of production-deps in dependabot.yml, and stop the manual-review comment calling dev tooling a production dependency (from: feature:dependabot-auto-merge)`
4. **m3 (deferred).**
   `- Harden dependabot-auto-merge.yml to decide on fetch-metadata's updated-dependencies-json and require every entry to carry a non-empty, non-major updateType, so a typeless group member cannot drop out of the highest-bump check (from: feature:dependabot-auto-merge)`
5. **m4 (folded into the pending M1 fix; a seed only if that PR drops it).**
   `- Add github.event.pull_request.user.login == 'dependabot[bot]' to dependabot-auto-merge.yml's job gate so it no longer rests on fetch-metadata's skip-verification default (from: feature:dependabot-auto-merge)`
6. **Observation, not a seed:** the merge SHA's `main` CI was cancelled by
   concurrency and its child's CI carried it (Release log 2). This is normal
   for the train and noted for the next record.

## For human review

- **The M1 fix PR is the one open item.** It is security-relevant. Merge it
  before, or soon after, Monday 2026-10-19's Dependabot run, which is the
  first chance for an in-policy PR to arm. Once it merges, the rollback
  becomes "revert the M1 fix, then `3e336927a`".
- **M2 needs a secret only you can mint.** Until then, Dependabot merges
  completed by this workflow skip `main`'s push CI and Release.
- **No in-policy PR has auto-merged yet.** Everything proven live so far is
  the manual path (#6685), the actor gate (369 skips) and Dependabot reading
  the new groups. Check Monday's run for the first `official-actions` or
  `types` PR: whether the policy armed it, and whether it merged on
  `CI Gate`.

## Outcome

Shipped with hiccups on 2026-10-15. #6680 passed `CI Gate` on its head and
squash-merged as `3e336927a`. The config took effect at merge: Dependabot's
update runs 38689173144 and 38689172954 used the new `official-actions` and
`types` groups, and the first workflow run, 38689740212, applied the new
policy correctly to #6685. The hiccups: the merge SHA's own `CI`, `Release`
and `Post-Merge Reconciliation` push runs were cancelled (its child
`61330001f` passed `CI Gate`), and `codecov/patch` was red on the PR head
(advisory). One security major, M1, is open with an Owner-chosen fix pending
outside this run. M2 is deferred to a seed. The in-policy live path is
unproven until Dependabot's Monday 2026-10-19 run. Next stage: Operate.
