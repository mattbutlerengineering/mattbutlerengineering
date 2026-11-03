---
stage: architect
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
ux: skipped — no user-facing surface (CI tooling), per autorun-brief.md
assumptions:
  - "Design choice: Matt said 'Let Architect decide'. The architect skill names no option for this decision, but its rules give the default: 'Prefer boring technology and existing patterns; novelty needs a stated reason.' The repo's existing pattern for a privileged workflow that reads PR data is `pull_request_target` + base-only checkout (`dependabot-auto-merge.yml:7-12`), and it is the only option that also protects the workflow file itself (defect.md § Primary sources). Taken as the default; logged here instead of stopping. If Matt reads the skill as offering no default, this is the one decision to reverse."
  - "Scope: the skill gives no default for 'same-class consumers in this run or a follow-up'. Decided IN this run for both `auto-merge.yml` and `merge-queue.yml` (reason under Decisions). Judgement call, flagged for Matt."
  - "`workflow_dispatch` cannot be pinned from inside the workflow file: a dispatch against `--ref X` runs the file as it exists at X. Pinning therefore has two halves: the ten producers stop passing `--ref <PR branch>` (default branch is the dispatch default), and the workflow fails closed when `github.ref` is not the default branch. A writer who dispatches a modified copy from their own branch is not stopped (residual risk; a writer can already add a `tier:*` label directly)."
  - "`pull_request_target` for a PR whose base is not the default branch: the docs fetched in capture say the workflow file comes from the default branch. [INFERENCE] GitHub actually takes the file from the PR's base branch; both are base-side, so the trust property holds either way. Not run."
  - "Not checked on live GitHub (read-only run, no dispatch): that a fork PR's `refs/pull/N/head` is fetchable with the job token (documented GitHub behaviour, not exercised), and the claim that no label lands on the fix PR itself during rollout (derived from the trigger rules, see Migration)."
  - "docs/standards.json is absent from the repo; the plugin's copy has no factory/pipeline statement bearing on this design, so no slug is cited."
---

# Architecture: tier-classifier as a base-only trust seam

## Approach

The tier gate currently treats the PR head as code to run: it checks the head out, runs `scripts/resolve-pr-metadata.mjs` from it, and takes `base_ref`, title, body and fork status from that script's stdout. The fix moves the seam from a path rule to an execution context. `tier-classifier.yml` triggers on `pull_request_target` (the workflow file and every step's working tree are then base-side, and a PR cannot edit the workflow that classifies it) and on `workflow_dispatch` (pinned to the default branch). It checks out only the base repo, runs the existing resolver from that base checkout, and fetches the PR head as git objects only (`git fetch origin refs/pull/N/head`, never `checkout`/`merge`). The file list and numstat come from `git diff` over those objects. No step ever places PR-head content on disk or executes it. `auto-merge.yml` and `merge-queue.yml` get the same trigger swap so the eligibility script they run is also base-side. Four new T4 path rules cover the merge-gate files, and the false guarantee in `docs/change-tiers.md:28` and the workflow comment is rewritten to what now holds.

Shape considered and rejected: keep `pull_request` and run the resolver/policy from a second base checkout (details under Decisions).

## Components

### tier-classifier workflow (`.github/workflows/tier-classifier.yml`) — policy executor

- Responsibility: the only place a PR's tier is computed. Executes base code only; treats the PR head as data. Owns the step contract below.
- Collaborators: `scripts/resolve-pr-metadata.mjs` (base copy), `scripts/tier-escalation.mjs` (policy, loaded from `origin/<base_ref>`), `gh` CLI, GitHub API.
- Steps, in order (names marked * are kept because existing tests key on them):
  1. **Pin dispatch to the default branch** (`if: github.event_name == 'workflow_dispatch'`): fail unless `github.ref` equals `refs/heads/<default_branch>`; both passed through `env:`.
  2. **Checkout (base only)**: `actions/checkout`, `fetch-depth: 0`, `persist-credentials: false`, no `ref:`, no `repository:`. Mirrors the `dependabot-auto-merge.yml` header rule.
  3. **Resolve PR metadata*** (`id: pr`): `node scripts/resolve-pr-metadata.mjs --pr "$PR_NUMBER"` from the base checkout. `base_ref`, `head_sha`, `is_fork`, `title`, `body` come from the API via base-side code, so a PR cannot change what this script does.
  4. **Fetch PR head as data**: `git fetch --no-tags origin "refs/pull/${PR_NUMBER}/head"`; the fetched tip must equal `head_sha` from step 3, else the step fails (a push raced the run; the next `synchronize` run replaces it). The working tree is never switched.
  5. **Compute base SHA and diff***: `merge-base "origin/${PR_BASE_REF}" "$HEAD_SHA"`, then `git diff --no-ext-diff --no-textconv --name-only` and `--numstat` between `base_sha` and `$HEAD_SHA`, written to `/tmp/changed-files.txt` and `/tmp/numstat.txt` as today. Revisions only, no working-tree reads.
  6. **Load tier policy from base branch***: unchanged (`git show "origin/${PR_BASE_REF}:scripts/tier-escalation.mjs"`). It is now sound, because `PR_BASE_REF` comes from trusted code.
  7. Classify, Ensure tier labels, Apply tier label, Comment: unchanged except the new T4 rules (next component).
- Permissions: unchanged (`contents: read`, `pull-requests: write`). Under `pull_request_target` the token is write-capable even for fork PRs, which is safe only because no PR-head code runs.

### T4 merge-gate path rules (the `rules` array in the Classify heredoc)

- Responsibility: make an edit to any file that decides merge eligibility land T4.
- New rules: `scripts/resolve-pr-metadata.mjs`; `scripts/merge-queue-eligibility.mjs`; and the workflow rule at `:113` extended from `codeql|coverage-gate|tier-classifier` to also match `auto-merge` and `merge-queue`. `scripts/tier-escalation.mjs` already has its rule. Matched exactly, as the existing rules are.
- Role in the design: defence in depth. The execution context stops a PR forging its own tier; these rules make a _change to the gate_ itself land T4 and get the scrutiny that tier brings. They do not carry the security property.

### Dispatch producers (ten workflows)

- Responsibility: ask for classification of a `GITHUB_TOKEN`-authored PR, which fires no `pull_request(_target)` event. Files: `acmm-regression`, `docs-audit`, `drift-fix`, `metrics-collectors`, `pr-metrics`, `production-feedback`, `record-summary-rows`, `shipped-features-snapshot`, `stale-human-blocked`, `visual-baseline-regen`.
- Change: `gh workflow run tier-classifier.yml -f pr="$PR_NUMBER"` with the `--ref` argument removed (default is the repo default branch). Their comments claiming the classifier "only triggers on `pull_request`" are corrected.
- Not changed: their `ci.yml` dispatches, which legitimately run on the PR branch.

### Arming workflows (`auto-merge.yml`, `merge-queue.yml`) — consumers

- Responsibility: arm auto-merge from the `tier:*` label via `scripts/merge-queue-eligibility.mjs`.
- Change: `pull_request` becomes `pull_request_target` (same `types`). Their checkout already has no `ref:`, so it is then the base repo; add a header comment with the rule (never check out the PR head), as `dependabot-auto-merge.yml` has. `auto-merge.yml`'s `check_suite` and `merge-queue.yml`'s `schedule`/`workflow_dispatch` paths are unchanged (already default-branch).
- Why a trigger swap and not just a checkout `ref:`: under `pull_request` the workflow YAML is the PR's, so the PR rewrites the steps and the checkout (defect.md § Primary sources).

### Docs

- `docs/change-tiers.md:28`: the sentence "a PR cannot edit the policy to lower its own tier" is kept only with its real basis: the workflow runs from the base side and treats the PR head as data. List the new T4 paths in the T4 section. The workflow comment at `tier-classifier.yml:78-84` is rewritten the same way.

## Data model

None. The seam is a set of step outputs, all strings, none persisted:

| Name                                               | Source (trusted because)                                               | Consumer                     |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `PR_NUMBER`                                        | `github.event.pull_request.number` or dispatch input `pr` (via `env:`) | resolver, fetch, label steps |
| `base_ref`, `head_sha`, `is_fork`, `title`, `body` | `gh pr view` run by base-checkout resolver                             | diff, policy load, Classify  |
| `/tmp/changed-files.txt`, `/tmp/numstat.txt`       | `git diff` between revisions (data only)                               | Classify                     |
| `/tmp/tier-policy/tier-escalation.mjs`             | `git show origin/<base_ref>:…`                                         | Classify                     |

Invariant owner: the workflow file owns "nothing from the head is executed". It is checkable textually and by behaviour (see Test strategy).

## Interfaces & contracts

### Dispatch pin guard

- Input: `github.event_name`, `github.ref`, `github.event.repository.default_branch` (all via `env:`).
- Output: exit 0 (non-dispatch, or ref is the default branch) or exit 1 with an `::error::` line.
- Failure modes: a producer still passing `--ref <branch>` fails this step, so no label lands and eligibility fails closed (`merge-queue-eligibility.mjs` treats no `tier:*` label as awaiting classification). Retry safe. Does not stop a writer dispatching an edited file from their own ref (see assumptions).

### Fetch PR head as data

- Input: `PR_NUMBER`, `HEAD_SHA` (resolver output, via `env:`).
- Output: objects present locally; `HEAD_SHA` usable as a revision.
- Failure modes: `refs/pull/N/head` missing (closed/deleted ref, GitHub error), tip != `HEAD_SHA` (race), or no common ancestor with `origin/<base_ref>` (merge-base fails). All fail the job before Classify, so no label is written and the earlier label, if any, is stale until the next run. Network timeout is the job's `timeout-minutes: 5`; retry is safe (idempotent fetch). Fork PRs: head ref lives in the base repo, so the same fetch applies.

### Classify input contract

- Input: the two `/tmp` files, `PR_TITLE`/`PR_BODY`/`PR_IS_FORK` env, the base policy module. Unchanged, which is why the existing heredoc-extracting tests keep working.
- Output: `tier=`, `label=`, `reasons=` in `$GITHUB_OUTPUT`. Unchanged.

### Eligibility script call (arming workflows)

- Input: labels from `gh pr view`. Output: JSON decision. Failure: unchanged. New fact for the contract: the script and its trusted-author list now come from base, so `TRUSTED_AUTOMATION_AUTHORS` becomes an independent limit. This reverses the cost defect.md § Blast radius records for the PR-edited script.

## Stack & dependencies

- `pull_request_target` + `actions/checkout` (existing pinned SHA) — the repo's established pattern; no new action or dependency.
- `git fetch`/`git diff` plumbing instead of the REST "list PR files" API — keeps numstat (needed by the size rule, which the API's per-file `additions` could also give but would change the data path and pagination limit of 3000 files) and keeps every existing test fixture valid.
- No new script file: the base checkout runs the existing resolver, so there is no new module whose tests must be written.

## Decisions & alternatives

- **`pull_request_target` with base-only checkout** over `pull_request` + a second base checkout — under `pull_request` GitHub runs the PR's own workflow file (docs-confirmed in defect.md), so the PR can delete the second checkout; that design cannot protect the file that defines the gate. Only a default-branch-resident workflow can.
- **Resolver run from the base checkout, `base_ref` from the API** over reading `base_ref` from the event payload — dispatch has no payload, so a payload read needs a second code path; the resolver's own header already chose one path. Once the resolver is base-side, API data is as trusted as payload data.
- **Fetch `refs/pull/N/head` + `git diff` over revisions** over the "list files" API — same trust (data only), but keeps numstat and avoids the 3000-file cap; fits every existing test fixture. Alternative kept in reserve if fetch of that ref proves unreliable.
- **Dispatch pinned by removing `--ref` from ten producers + a fail-closed guard** over a guard alone — the guard alone would break every producer; producers alone leave a future `--ref` silently unprotected. A test over all workflows keeps the pair in sync.
- **Auto-merge and merge-queue fixed in this run** over naming them a follow-up — the stated attack (forged low tier) is equally available by editing `merge-queue-eligibility.mjs` or `merge-queue.yml` under `pull_request` with `contents: write`; closing only the classifier leaves an equal-cost bypass and the new T4 rules for those files would protect nothing. The change is the same one-line trigger swap, independently revertible. Accepted cost: a larger T4 diff to review. Not fixed, named only: any other `pull_request` workflow holding a write token has the same exposure; that is a repo-wide audit, out of scope.
- **No ADR-016 amendment**: ADR-016 defines which checks are required (`CI Gate`) and does not mention the tier classifier; `tier-classifier` is not a required check, so changing its trigger leaves the required-check set and `CI Gate` untouched. Checked against ADR-016's section headings (Required vs advisory checks, Branch protection), not a full read. Branch protection stays out of scope.

### Accepted behaviour changes (old rule vs new, over the inputs where they differ)

| Input                                                                                                  | Old                                                             | New                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| PR edits `resolve-pr-metadata.mjs`, `merge-queue-eligibility.mjs`, `auto-merge.yml`, `merge-queue.yml` | T2 (unmatched default)                                          | T4                                                                                                                                       |
| PR edits `tier-classifier.yml` or the resolver to forge `base_ref`                                     | forged tier lands                                               | edit is ignored when classifying itself; lands T4                                                                                        |
| Fork PR                                                                                                | token read-only; [INFERENCE] label write fails, no label        | write token in base context; classified and labelled (safe: no head code runs). Title/body/filenames still flow only through `env:`/data |
| PR whose base is not the default branch                                                                | policy and diff base from `origin/<base_ref>`, workflow from PR | workflow from base side; policy still `origin/<base_ref>`                                                                                |
| Dispatch with `--ref` != default branch                                                                | runs PR-branch workflow and checkout                            | fails closed                                                                                                                             |
| Dispatch for a PR from a producer                                                                      | classifies PR head via checkout                                 | same tier result via fetched head                                                                                                        |
| Head moves between resolve and fetch                                                                   | n/a                                                             | step fails; next run classifies                                                                                                          |
| Edit to `auto-merge.yml`/`merge-queue.yml` triggers                                                    | PR's own YAML is what runs                                      | base YAML runs; the PR's version takes effect after merge                                                                                |

## Test strategy

TDD per the brief; the first test is RED against current `main`.

1. **RED first, in `scripts/__tests__/tier-classifier-workflow.test.mjs`**, new `describe("trust seam: base-only execution")`: (a) `on:` has `pull_request_target` and `workflow_dispatch` and no `pull_request:`; (b) the checkout step has no `ref:` or `repository:` and appears before the resolver step; (c) no step runs `git checkout`/`switch`/`merge`/`worktree add`, and no `run:` block executes a path that only the head provides; the only `node` invocations are the resolver and the Classify heredoc; (d) `base_ref` is only read from `steps.pr.outputs.base_ref` and `steps.pr` runs the resolver; (e) no `${{ }}` inside any `run:` body (the `dependabot-auto-merge` test style).
2. **Behavioural, same file**, using the repo's existing fixture pattern (`makeRepo` + `extractStepRun`): build a repo whose base has the real resolver/policy and whose PR ref (`refs/pull/7/head`) carries a neutered policy and an edited resolver; run the **Fetch PR head** and **Compute base SHA and diff** step bodies against it. Assert the file list is the real one (not empty), the working tree's resolver/policy bytes still equal base, and a tip/`HEAD_SHA` mismatch exits non-zero.
3. **Dispatch pin**, same file: run the guard step body with `github.ref` != default → non-zero; equal → zero; non-dispatch event → zero.
4. **`tier-classifier-dispatch.test.mjs`**: replace the "on its own automation branch" regex with a test over every `.github/workflows/*.yml`: any `gh workflow run tier-classifier.yml` has no `--ref`. Update the `pull_request` trigger assertion at `:38` to `pull_request_target`.
5. **T4 rules**: `runClassifier` cases for each of the four gate files expecting tier 4, and the regex rule matching `auto-merge.yml`/`merge-queue.yml` (and not a similarly named file).
6. **Arming workflows**: in `merge-queue-eligibility.test.mjs`, assert both files use `pull_request_target`, check out with no `ref:`/`repository:`, and carry the header rule; `merge-queue-tier-race` keeps its wiring assertions.
7. Existing tests that must stay green: `tier-escalation`, `tier-classifier-workflow` (policy-from-base describe keys on step names `Resolve PR metadata` and `Load tier policy from base branch`, kept), `tier-classifier-dispatch`, `merge-queue-tier-race`, `merge-queue-eligibility`, `resolve-pr-metadata`.
8. Not testable locally, stated: real `pull_request_target`/fork/dispatch behaviour on GitHub. Verify after merge by observing the next PR's label.

## Migration & rollback

- The change lands through the gate it changes, and that gate is the _old_ one. The old classifier runs on `pull_request` from the PR's merge commit. The fix PR's version of the workflow has no `pull_request` trigger, so [INFERENCE from the trigger rules, not run] that event fires nothing, and `pull_request_target` runs the base copy, which has no such trigger either. Expect **no automated `tier:*` label on the fix PR**. By the rules it is T4 (edits `tier-classifier.yml` and the other gate files). Matt applies `tier:critical` by hand. Nothing arms auto-merge on it: Matt merges it himself (brief § Release), and eligibility fails closed without a label anyway. `CI Gate` is unaffected (not part of this change).
- After merge, the next PR is the first classified by the new workflow; the open PRs keep their existing labels until their next `synchronize`.
- Rollback is a revert of the whole change as a unit, never of the workflow alone: the old workflow with producers already on the default branch would check out `main`, diff `main` against `main`, and stamp an empty diff `tier:trivial`. State this in the PR body. The partial-state failure (new workflow, old producers) is safe: the guard fails closed.
- No data migration, no config flip, no branch-protection change.

## ADRs

none — no decision met the ADR bar. The trigger choice is reversible by one revert and is documented here, in the workflow header and in `docs/change-tiers.md`; the rest are local to CI files. (If Matt wants the unattended choice recorded as one, it would be a provisional ADR.)

## Requirement traceability

| Brief requirement                                     | Where met                                 |
| ----------------------------------------------------- | ----------------------------------------- |
| Base-only execution; head is data                     | tier-classifier steps 2–5; tests 1–2      |
| `base_ref` from trusted source                        | step 3 from base-side resolver; test 1(d) |
| Dispatch pinned to default branch                     | guard + producers; tests 3–4              |
| T4 rules for the four gate files                      | T4 rules component; test 5                |
| Correct `change-tiers.md:28` and workflow comment     | Docs component                            |
| Same-class `auto-merge.yml` (and `merge-queue.yml`)   | arming workflows component; test 6        |
| Out of scope: GATE_PATHS, branch protection, 4 minors | untouched                                 |
