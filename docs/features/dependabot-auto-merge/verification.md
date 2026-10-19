---
stage: verify
run: feature:dependabot-auto-merge
date: 2026-10-18
assumptions:
  - "Affected packages for the `pnpm lint && pnpm typecheck && pnpm test` criterion = `scripts/` (breakdown.md § Notes: 'affected: `scripts/`'). `@mbe/scripts` declares no `typecheck` script (its scripts are `lint test test:coverage`; the code is plain `.mjs`), so the typecheck arm is recorded as not applicable rather than as a pass."
  - "The live replay window is PRs whose `created_at` is strictly after #6680's merge (2026-10-15T05:52:32Z), per the brief. To catch older Dependabot PRs re-evaluated by the new workflow on a later push, every `dependabot-auto-merge.yml` run with actor `dependabot[bot]` created since 2026-10-13 was also listed; only one run falls after the merge, and it belongs to the one in-window PR."
  - "The policy's unit tests were run through the package's own vitest config with the name filter `dependabot`, which also picks up the older `dependabot-secretless-jobs.test.mjs` (not part of #6680). It is quoted but not counted as evidence for any criterion. The full `scripts` suite was run as well."
  - "Live behaviour criteria with zero qualifying PRs are graded NOT SHOWN, not PASS — the skill's rule that a criterion that cannot be verified is a finding in itself."
---

# Verification: auto-merge official-action and @types Dependabot bumps on green CI

## Summary

Graded against `main` at `ef94849d2` (no commit after #6680 `3e336927a`
touches the policy, its tests, the workflow or `.github/dependabot.yml`).

**8 PASS, 0 FAIL, 1 NOT SHOWN.** Everything checkable offline passes:
the six acceptance cases, the security invariants, the grouping, `repo-audit`
(35/35), lint, and the full `scripts` suite (5666/5666). The live half
of the feature has not been tested yet. Since #6680 merged, Dependabot has
opened exactly **one** PR (#6685, a `production-deps` group). The policy
correctly sent it to manual review and nothing auto-merged. **No in-policy
PR (official action or `@types/*`) has been opened yet**, so neither "it
auto-merges on green CI" nor the p90 can be shown. n=0 in-policy. Both
Dependabot ecosystems run weekly on Monday (`.github/dependabot.yml`), and no
Monday has passed since the Thursday 2026-10-15 merge. **No out-of-policy PR
auto-merged, so there is no critical finding.**

## Criteria & evidence

### C1 — Unit tests pass for exactly the six acceptance cases (prd.md § Success criteria; WO-36)

- Check: `pnpm --dir scripts exec sh -c 'cd .. && vitest run --config scripts/vitest.config.mjs --reporter=verbose dependabot'`
- Evidence:
  ```
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: acceptance cases (#6650) > actions/setup-node minor -> merge 1ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: acceptance cases (#6650) > github/codeql-action/upload-sarif patch -> merge 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: acceptance cases (#6650) > hadolint/hadolint-action minor (ungrouped) -> manual, not called a production dependency 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: acceptance cases (#6650) > any semver-major -> manual, even in an auto-mergeable group 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: acceptance cases (#6650) > @types/node patch in the types group (production dependencies block) -> merge 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: acceptance cases (#6650) > production npm dep -> manual, described as a production dependency 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: acceptance cases (#6650) > dev-deps minor -> merge (existing behavior preserved) 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: fail closed > unknown or missing group -> manual 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: fail closed > empty or missing dependency names -> manual 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: fail closed > official-actions group containing a non-official name -> manual 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: fail closed > owner prefix must match exactly (actions-evil/x, not actions/) 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: fail closed > types group containing a non-@types name -> manual 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decideDependabotMerge: fail closed > missing update type -> manual 0ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decide CLI > prints the merge decision as JSON and exits 0 116ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decide CLI > prints manual (exit 0, not a red step) for an ungrouped update with empty group 104ms
   ✓ scripts/__tests__/dependabot-auto-merge-policy.test.mjs > decide CLI > splits comma-separated names 96ms

   Test Files  3 passed (3)
        Tests  33 passed (33)
  ```
- Result: **PASS** — all six named cases are present and green, plus the
  fail-closed and CLI cases WO-36 asked for.

### C2 — Workflow security invariants: `on: pull_request_target`, `if: github.actor == 'dependabot[bot]'`, never checks out PR head code (brief § Success criteria; prd R4; WO-38)

- Check: the workflow test (same run as C1) plus the live log of the only
  post-merge run (38689740212, PR #6685), to confirm what the checkout
  actually fetched.
- Evidence (test):
  ```
   ✓ scripts/__tests__/dependabot-auto-merge-workflow.test.mjs > dependabot-auto-merge.yml > keeps pull_request_target and the dependabot actor gate 5ms
   ✓ scripts/__tests__/dependabot-auto-merge-workflow.test.mjs > dependabot-auto-merge.yml > never checks out PR head code (no ref/repository on checkout) 1ms
   ✓ scripts/__tests__/dependabot-auto-merge-workflow.test.mjs > dependabot-auto-merge.yml > decides via the policy CLI with pipefail, metadata passed through env 1ms
   ✓ scripts/__tests__/dependabot-auto-merge-workflow.test.mjs > dependabot-auto-merge.yml > merges only on a merge decision and comments the policy reason otherwise 1ms
   ✓ scripts/__tests__/dependabot-auto-merge-workflow.test.mjs > dependabot-auto-merge.yml > no run: block interpolates expressions directly 0ms
  ```
- Evidence (live, `gh run view 38689740212 --log`). The checkout fetched
  the base `main` SHA, not the PR head `2891cb9d…`:
  ```
  [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +61330001fe4cb9356eb5ac8a7d0d2fb7f7626466:refs/remotes/origin/main
  [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
  ```
  `git merge-base --is-ancestor 3e336927a 61330001…` → `ANCESTOR`, so the
  policy script that ran was #6680's.
- Result: **PASS**

### C3 — dependabot.yml grouping: `official-actions` (`actions/*`, `github/*`); `types` (`@types/*`, no `dependency-type`); `@types/*` out of `dev-deps` (prd R1; WO-37)

- Check: workflow test's grouping block, plus reading `.github/dependabot.yml`
  on `main`.
- Evidence:
  ```
   ✓ … > dependabot.yml grouping (#6650) > declares official-actions for actions/* and github/* 0ms
   ✓ … > dependabot.yml grouping (#6650) > declares a types group with no dependency-type restriction 0ms
   ✓ … > dependabot.yml grouping (#6650) > playwright and @playwright/* bump together in dev-deps, not production-deps 0ms
   ✓ … > dependabot.yml grouping (#6650) > dev-deps no longer lists @types/* 0ms
  ```
  ```yaml
      production-deps:
        patterns: ["*"]
        exclude-patterns:
          ["@types/*", "eslint*", "prettier*", "vitest*", "@vitest/*", "playwright*", "@playwright/*"]
      types:
        patterns: ["@types/*"]
      dev-deps:
        dependency-type: "development"
        patterns: ["eslint*", "prettier*", "vitest*", "@vitest/*", "playwright*", "@playwright/*"]
  …
    - package-ecosystem: "github-actions"
      groups:
        official-actions:
          patterns: ["actions/*", "github/*"]
  ```
  By inspection, `@types/*` is excluded from `production-deps`, absent from
  `dev-deps`, and matched only by `types`. Every `dev-deps` pattern is in
  `production-deps`' exclude list, so no package matches two groups.
- Result: **PASS**

### C4 — Workflow rewire: merges only on a `merge` decision, otherwise comments the policy reason; wording no longer calls a non-npm update a "production dependency" (prd R3; WO-38)

- Check: workflow test (C2 block, "merges only on a merge decision…"), the
  unit test for hadolint wording (C1), and the live run's step outcomes.
- Evidence (live run 38689740212, `gh api …/runs/38689740212/jobs`):
  ```
    4 Decide: success
    5 Auto-merge: skipped
    6 Comment on PRs needing manual review: success
  ```
  ```
  {"action":"manual","reason":"This is a production dependency update and requires manual review."}
  ```
  The comment it posted on #6685 (`gh api …/issues/6685/comments`):
  ```
  github-actions[bot]	2026-10-15T05:59:14Z	⚠️ This is a production dependency update and requires manual review.
  ```
  For the non-npm wording, the unit test asserts the hadolint reason matches
  `/third-party GitHub Action/` and not `/production dependency/` (C1).
  No third-party action PR has arrived since merge, so that wording has
  only been tested by the unit test, not seen live.
- Result: **PASS** (the manual-review path ran live once; the non-npm wording
  is shown by the unit test only)

### C5 — `pnpm repo-audit` passes (prd § Success criteria)

- Check: `pnpm repo-audit` in the worktree.
- Evidence:
  ```
    PASS  check-workflow-deps
    PASS  check-workflow-paths-coverage
    …
    PASS  check-ci-gate-coverage
    …
    PASS  boundaries
    PASS  check-boundaries-coverage
  35 of 35 checks passed
  EXIT 0
  ```
- Result: **PASS**

### C6 — `pnpm lint && pnpm typecheck && pnpm test` pass for affected packages (prd § Success criteria)

- Check: `pnpm --dir scripts lint`; `pnpm turbo typecheck --filter=@mbe/scripts`;
  `pnpm --dir scripts test` (full suite). Workspace deps were built first with
  `pnpm build --filter '@mbe/scripts^...'` because the suite's preflight
  requires them.
- Evidence:
  ```
  > @mbe/scripts@0.0.0 lint …/scripts
  > eslint .
  EXIT 0
  ```
  ```
   Test Files  304 passed (304)
        Tests  5666 passed (5666)
  EXIT 0
  ```
  ```
  $ node -e '…console.log(Object.keys(p.scripts).join(" "))'
  lint test test:coverage
  ```
  #6680's own CI on its head commit:
  ```
  CI Gate	success	2026-10-15T05:49:05Z
  ```
- Result: **PASS** — lint and test are green. The typecheck arm does not apply
  because `@mbe/scripts` has no `typecheck` script (see assumptions), and
  #6680's `CI Gate` was green.

### C7 — The implementation PR notes how many of the 30 measured PRs would have auto-merged (prd R5; WO-39)

- Check: `gh api repos/…/pulls/6680 --jq .body`.
- Evidence:
  ```
  ## WO-39 measurement: replay of the 30 PRs from #6650

  Fetched with `gh pr list --state merged --author app/dependabot --limit 30` (real data, merged 2026-08-24 .. 2026-10-14) and replayed through `decideDependabotMerge` using each PR's group under the new `dependabot.yml`.

  **21 of 30 would auto-merge** on green CI; 9 stay manual.
  …
  - That covers every slow PR named in #6650 (#5845, #4785, #6572-#6575, #4794, #4795, #5365, #6070, #6578).
  ```
- Result: **PASS**. Caveat from the PR body: grouped PRs were assumed
  non-major because per-package update types could not be recovered.

### C8 — Live replay: no out-of-policy Dependabot PR auto-merged since #6680 (brief § Resume → Verify)

- Check: list every `dependabot[bot]` PR via REST
  (`gh api --paginate 'repos/…/pulls?state=all&sort=created&direction=desc'`,
  200 Dependabot PRs scanned) and keep those with `created_at > 2026-10-15T05:52:32Z`.
  List every `dependabot-auto-merge.yml` run with actor `dependabot[bot]`
  since 2026-10-13 and match each to its PR by `head_sha`. Then read the
  matched run's log, the PR's `auto_merge`, `merged_by` and issue events.
  Everything was read-only.
- Evidence (in-window PRs):

  ```
  [6685,"2026-10-15T05:58:46Z","closed","2026-10-15T11:17:09Z",false,"chore(deps): Bump the production-deps group with 3 updates"]
  ```

  Runs with actor `dependabot[bot]` after the merge (the next-newest is
  2026-10-14T22:51:11Z, before the merge):

  ```
  38689740212	2026-10-15T05:58:50Z	pull_request_target	2891cb9d58328f2e13072bc1a7073c5783459070	dependabot/npm_and_yarn/production-deps-045967fef0	success	dependabot[bot]
  ```

  PR #6685's `head.sha` is `2891cb9d58328f2e13072bc1a7073c5783459070`, the
  same SHA as the run. fetch-metadata outputs from that run:

  ```
  outputs.dependency-names: i18next, react-i18next, @eslint-react/eslint-plugin
  outputs.update-type: version-update:semver-patch
  outputs.package-ecosystem: npm_and_yarn
  outputs.dependency-group: production-deps
  ```

  Merge record:

  ```
  {"auto_merge":null,"base":"main","created_at":"2026-10-15T05:58:46Z","merged_at":"2026-10-15T11:17:09Z","merged_by":"mattbutlerengineering"}
  merged	mattbutlerengineering	2026-10-15T11:17:09Z
  ```

  Running the same inputs through the policy CLI on `main` gives the same
  decision as the run:

  ```
  $ node scripts/dependabot-auto-merge-policy.mjs decide --ecosystem npm_and_yarn --group production-deps --update-type version-update:semver-patch --dependency-names "i18next, react-i18next, @eslint-react/eslint-plugin"
  {"action":"manual","reason":"This is a production dependency update and requires manual review."}
  ```

  Open Dependabot PRs right now: `[]`.

  | PR    | Ecosystem / group                  | Packages                                                  | Update type  | Policy decision (run 38689740212) | Auto-merge armed        | Merged?                                | Open→merge    |
  | ----- | ---------------------------------- | --------------------------------------------------------- | ------------ | --------------------------------- | ----------------------- | -------------------------------------- | ------------- |
  | #6685 | `npm_and_yarn` / `production-deps` | `i18next`, `react-i18next`, `@eslint-react/eslint-plugin` | semver-patch | manual (out of policy, correct)   | no (`auto_merge: null`) | yes, by hand (`mattbutlerengineering`) | 5 h 18 m 23 s |

- Result: **PASS**. n=1, and that PR was out of policy, correctly held for
  manual review, and merged by hand. No production dep, semver-major or
  third-party action auto-merged. **No critical finding.**

### C9 — Live replay: in-policy PRs (official actions, `@types/*`) auto-merge on green CI, and their p90 open→merge beats the ~24 h baseline (brief § Resume → Verify; Operate minimum-signal)

- Check: same replay as C8, keeping only PRs whose group is `official-actions`,
  `types` or `dev-deps` and whose update type is not semver-major.
- Evidence: the only post-merge Dependabot PR is #6685 (`production-deps`).
  In-policy n = **0**. The config sets the trigger:
  ```yaml
    - package-ecosystem: "npm"
      schedule:
        interval: "weekly"
        day: "monday"
  …
    - package-ecosystem: "github-actions"
      schedule:
        interval: "weekly"
        day: "monday"
  ```
  #6680 merged Thursday 2026-10-15. Today is Sunday 2026-10-18, so neither
  weekly run has fired since. #6685 was the off-schedule run that followed
  the config change.
  Related evidence from before the merge (the old workflow, same `gh pr merge
--auto --squash` call): #6677 found that armed auto-merge on #6577 merged
  27 s after `CI Gate` went green, so the arming mechanism works in this repo.
  This proves the mechanism only, not the new policy.
- Result: **NOT SHOWN** — no in-policy PR exists yet, and a p90 cannot be
  computed with n=0.

## Failures

None. No criterion failed, so nothing routes back to Implement. The next stage
is Review.

## Not verified

- **In-policy auto-merge in production (C9).** No official-action or
  `@types/*` PR has been opened since #6680, so no live run has armed
  auto-merge under the new groups. That makes `fetch-metadata` reporting
  `dependency-group: official-actions` / `types` live (as opposed to in the
  config and tests) unproven too. The first chance is the Monday 2026-10-19
  Dependabot run. Operate's minimum signal (≥10 post-merge Dependabot PRs and
  an in-policy p90) is the place to grade it.
- **In-policy p90 vs the ~24 h baseline.** n=0, so it was not computed.
- **Third-party-action manual wording, seen live.** Shown only by the unit
  test (C4). No `hadolint/*` or `codecov/*` PR has arrived.
- **What `update-type` means for a grouped PR.** The policy trusts
  fetch-metadata's single `update-type` for a multi-package group PR (e.g. a
  `types` group with one major and one patch). Whether fetch-metadata v3.1.0
  reports the highest bump across the group was not tested here. #6680's
  WO-39 note states the same gap ("grouped PRs were assumed non-major").
  This is worth a Review look, since a wrong answer would let a major
  through.
- **Typecheck arm of C6.** Not applicable (no `typecheck` script in
  `@mbe/scripts`). `.mjs` sources are not type-checked by any gate (gotchas.md
  § Pre-push: "JS tests … still uncovered").

### Observations for Review (not criteria; not graded)

- `@eslint-react/eslint-plugin`, a lint plugin, landed in `production-deps`
  on #6685. The `eslint*` pattern does not match scoped names, which is the
  same trap `dependabot.yml` already documents for `@vitest/*` and
  `@playwright/*`. This fails safe (manual) and is outside #6650's policy, so
  it is noted only.
- The `dev-deps` branch of `decideDependabotMerge` merges on the group name
  alone, with no per-name prefix check. `official-actions` and `types` both
  have one. This keeps the pre-#6680 behaviour (the unit test calls it
  "existing behavior preserved"), but an edit that widens `dev-deps`'
  patterns would widen auto-merge silently. The policy's own header says the
  prefix check guards against exactly that kind of edit.
