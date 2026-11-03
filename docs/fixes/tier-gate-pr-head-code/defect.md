---
stage: capture
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
re-entry: architect
assumptions:
  - "Variant: defect brief (something is broken), not a condition brief. Skill default for a bug/regression."
  - "re-entry: architect. Skill rule: a scoped fix with no design decisions re-enters at Implement; anything design-touching re-enters at Architect. The fix changes which code the gate executes and where base_ref comes from, and Matt explicitly delegated the design choice (pull_request_target vs a separate base checkout vs other) to Architect. That is a design decision, so work items are left to architecture.md + breakdown.md."
  - "Slug tier-gate-pr-head-code and worktree/branch fix/tier-gate-pr-head-code were fixed by the brief; not re-negotiated."
  - "Work-in-flight check recorded as 'nothing matches' (see Notes). The tracker intake step (skill step 4) does not apply: the brief says Tracker: none."
  - "Blast-radius 'fork PRs fail closed' is confirmed only for the read-only-token half (GitHub docs); the consequence that no label lands is derived from reading tier-classifier.yml and stays [INFERENCE]. Not a skill default; recorded rather than guessed."
---

# Defect: tier-classifier executes the PR it is classifying, so a PR can lower its own tier

Origin: the open Major in `docs/features/tier-escalation-false-positives/review.md`
§ Major (main @ `ab4a3b2bc`, merged via #8176), deferred to this run by Matt on
2026-11-02. All line pointers below were re-verified against `origin/main`
`ab4a3b2bc` on 2026-11-02 (worktree is `ab4a3b2bc` + the brief commit).

## Defect (or Condition)

**Observed.** `.github/workflows/tier-classifier.yml` runs code that lives in
the PR it is classifying, with a `pull-requests: write` token in the job env:

- `:10-13` triggers on `pull_request` (opened/synchronize/reopened) and
  `workflow_dispatch`. Permissions are `contents: read`, `pull-requests: write`
  (`:25-27`); `GH_TOKEN` is set at job level (`:37-40`).
- `:42-53` checks out the PR head (`ref: github.event.pull_request.head.sha`;
  on dispatch that is empty, so it falls back to `github.ref`, the dispatcher's
  `--ref`), `fetch-depth: 0`.
- `:55-64` runs `node scripts/resolve-pr-metadata.mjs --pr "$PR_NUMBER" >> "$GITHUB_OUTPUT"`
  **from that checkout**. Its stdout becomes `title`, `body`, `head_sha`,
  `base_ref`, `is_fork` (`scripts/resolve-pr-metadata.mjs:41-49`; `base_ref` is
  printed at `:47`; the CLI is `:57-76`).
- `:66-76` uses `steps.pr.outputs.base_ref` for `git merge-base "origin/${PR_BASE_REF}" HEAD`
  and for the `--name-only` / `--numstat` diff. Those two files are the entire
  input to the path rules and the size rule.
- `:78-90` loads the escalation policy with
  `git show "origin/${PR_BASE_REF}:scripts/tier-escalation.mjs"`, again from the
  script's `base_ref`. #7078's "load from base" is only as trusted as that value.
- `:92-97` feeds `title`, `body`, `is_fork` from the same step into Classify.

So a PR that edits `scripts/resolve-pr-metadata.mjs` controls every input to
the tier. It can print `base_ref=<its own branch>` (empty diff, its own edited
policy), or `base_ref=<a second branch the attacker pushed>` (a diff containing
only a markdown file, so T1), or, since it is arbitrary node code, write
`GITHUB_ENV` / call `gh pr edit` with the job token.

Further gaps on the same trust boundary:

1. **No path rule covers the helper.** The T4 workflow rule names only
   `codeql|coverage-gate|tier-classifier` (`:113`); the T4 script rule names
   only `scripts/tier-escalation.mjs` (`:114`); the T3 script rule is
   `^scripts\/check-` (`:123`). An edit to `scripts/resolve-pr-metadata.mjs`
   falls to the "unmatched paths default to T2" branch (`:168-171`).
   `scripts/merge-queue-eligibility.mjs`, `.github/workflows/auto-merge.yml` and
   `.github/workflows/merge-queue.yml` are equally uncovered.
2. **The workflow file itself comes from the PR.** On `pull_request` the
   workflow file used is the one at the PR's merge commit, so a PR can edit
   `tier-classifier.yml`, including the T4 rule at `:113` that is meant to catch
   the edit. Confirmed by GitHub's own docs (see Reproduction § Primary sources).
   No path rule can fix this one.
3. **`workflow_dispatch` is wider.** Workflow file and checkout both come from
   the `--ref` the dispatcher picks, while `--pr` picks the PR that gets
   labelled (`:14-23`, `:30`, `:53`). Anyone who can dispatch can stamp any PR
   with a tier computed by code of their choosing. This needs write access.
4. **Downstream consumers re-run PR-controlled code (same class).**
   - `auto-merge.yml` triggers on `pull_request` (`:4-5`), checks out with no
     `ref:` (`:20-22`), i.e. the PR merge commit, then runs
     `node scripts/merge-queue-eligibility.mjs check ...` (`:84`) and
     `... check-author ...` (`:110`) from that checkout. Note the trusted-author
     allow-list (`TRUSTED_AUTOMATION_AUTHORS`, `scripts/merge-queue-eligibility.mjs:218`)
     lives in the same PR-editable script, so it is **not** an independent limit,
     contrary to the origin review's reading. The `check_suite` branch of the
     same workflow is not exposed this way: GitHub runs it on the default
     branch's last commit (docs table, § Primary sources).
   - **New in this capture:** `merge-queue.yml` has the same shape. It triggers
     on `pull_request` (`:3-5`), checks out with no `ref:` (`:18-21`), then runs
     `node scripts/merge-queue-eligibility.mjs check ...` (`:59`) from the merge
     checkout with `contents: write` + `pull-requests: write` (`:10-12`). The
     brief and origin review name only `auto-merge.yml`; `merge-queue.yml` is the
     same class and Architect should decide scope for it together with
     `auto-merge.yml`.
5. **Nothing independent catches it.** `scripts/merge-queue-eligibility.mjs`
   reads only the `tier:*` label (`BLOCKED_TIER_LABELS`, `:36`; eligibility
   functions at `:53`, `:88`, `:151`) and never looks at paths or diffs, so a
   forged `tier:trivial` passes. Per the origin review, branch protection
   requires only `CI Gate`, `required_pull_request_reviews: null`,
   `enforce_admins: false`; CODEOWNERS lists `/.github/` and `/scripts/`
   (`.github/CODEOWNERS:33-34`) but no review is required, so it blocks nothing.
   (Branch-protection state was not re-queried here: reading it is a GitHub API
   call outside this capture's remit; the origin review's claim is carried
   forward, unverified by me.)

**Expected.** `docs/change-tiers.md:28` and the workflow comment at
`tier-classifier.yml:78-84` both state a guarantee: "a PR cannot edit the policy
to lower its own tier". That guarantee does not hold.

## Reproduction / Evidence

All local, throwaway repo under `/tmp/tier-gate-repro`; nothing touched GitHub
(no workflow dispatch, no pushed branch, no label/comment; the only `gh` calls
made were read-only `pr list`/`issue list`/`repo view`). Script:
`/tmp/repro-tier-gate.sh` (not committed; ephemeral). It builds a bare
`origin`, a `main` carrying the real `scripts/tier-escalation.mjs` and
`scripts/resolve-pr-metadata.mjs` from `origin/main`, a branch `shadow` (adds
`services/users/src/auth/session.ts` — a T4 path — and **neuters** the policy
module to `decideKeywordEscalation(){return {action:"none"}}`,
`decideSizeEscalation(){return {escalate:false}}`), and a PR branch `feat` =
`shadow` + one markdown file `docs/note.md`. For each candidate `PR_BASE_REF`
it runs the workflow's own two git steps (`:71-75`, `:90`), then extracts the
**real Classify heredoc** (`:99-292`) from the checked-in workflow with `awk`
and runs it under node with the repo's env contract
(`PR_TITLE="docs note"`, `PR_BODY=""`, `PR_IS_FORK=false`, temp `GITHUB_OUTPUT`).

Output (verbatim):

```
== PR_BASE_REF=main
   docs/note.md
   scripts/tier-escalation.mjs
   services/users/src/auth/session.ts
   policy from origin/main head:     7142 bytes, neutered=0
   Classified: tier:critical (T4)
     - `docs/note.md` -> T1: markdown only
     - `scripts/tier-escalation.mjs` -> T4: tier-escalation policy edit (merge-gate policy)
== PR_BASE_REF=feat
   policy from origin/feat head:      131 bytes, neutered=1
   Classified: tier:standard (T2)
     - unmatched paths default to T2:
== PR_BASE_REF=shadow
   docs/note.md
   policy from origin/shadow head:      131 bytes, neutered=1
   Classified: tier:trivial (T1)
     - `docs/note.md` -> T1: markdown only
```

Reading it:

- `PR_BASE_REF=main` (what an honest resolver prints): real diff of 3 files,
  real policy, **T4 / `tier:critical`**.
- `PR_BASE_REF=feat` (the PR's own branch): empty diff (no file lines), the
  PR's edited 131-byte policy loaded as "base" -> T2 floor (`tier:standard`,
  still blocked by `BLOCKED_TIER_LABELS`, matching the origin review's claim
  that the own-branch variant alone floors at T2).
- `PR_BASE_REF=shadow` (second attacker branch): diff is one `.md`, the
  neutered policy is loaded -> **T1 / `tier:trivial`** for a PR that, against
  `main`, is T4. `tier:trivial` is not in `BLOCKED_TIER_LABELS`, so
  `merge-queue-eligibility.mjs` would let it through given `has-pr` (or
  `auto-merge` + trusted author) labels.

This is the same result the origin review reported for the two git steps
(`PR_BASE_REF=feat` -> 0 files + the PR's edited policy; `PR_BASE_REF=main` ->
real files), now extended through the real Classify code to the resulting tier.
Not demonstrated, deliberately: the forged `base_ref` coming out of an edited
`resolve-pr-metadata.mjs` (trivially a different `console.log` at `:71`; the
script's output contract is plain `base_ref=<value>` at `:47`), and the
`GITHUB_ENV` / `gh pr edit` variants, because those require running attacker
code in the live gate, which is out of bounds.

**Regression-test seed (for Verify).** Structural pins, no network needed:
(a) `tier-classifier.yml` runs no script that comes from the PR checkout
(workflow-text assertion in the style of `scripts/__tests__/tier-classifier-workflow.test.mjs`);
(b) `base_ref` is sourced from the event payload / base-side code, never from
PR-head code; (c) on dispatch the workflow ref is the default branch;
(d) T4 path rules exist for the four named gate files. Existing tests that must
stay green: `tier-escalation`, `tier-classifier-workflow`,
`tier-classifier-dispatch`, `merge-queue-tier-race` (all present under
`scripts/__tests__/`).

### Primary sources (settling the brief's [INFERENCE] items)

Fetched 2026-11-02.

- **Which workflow file a `pull_request` run uses — CONFIRMED.**
  [Securely using `pull_request_target`](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target):
  "The `pull_request` event (along with `pull_request_review` and
  `pull_request_review_comment`) is unusual: it runs the workflow file from the
  **merge commit of the pull request**." The same page: for `pull_request_target`
  "the workflow, and any subsequent `actions/checkout` call that does not
  specify a `ref`, is taken from the **base repository's default branch**, not
  from the pull request." Also
  [Events that trigger workflows § pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request):
  `GITHUB_SHA` is "Last merge commit on the `GITHUB_REF` branch",
  `GITHUB_REF` is `refs/pull/PULL_REQUEST_NUMBER/merge`, and `actions/checkout`
  with no `ref:` checks out that merge branch (which is what `auto-merge.yml:20`
  and `merge-queue.yml:18` do).
- **`pull_request_target` semantics — CONFIRMED.** Same events page:
  "This event runs in the context of the default branch of the base
  repository, rather than in the context of the merge commit... Avoid using
  this event if you need to build or run code from the pull request." The
  security page adds that the job receives the base repo `GITHUB_TOKEN` and
  secrets, and that the vulnerability is "completed by the _next_ step that
  runs code checked out into the current working directory", i.e. the base
  workflow may read PR data but must not execute it. Architect note from the
  same events page: with `GITHUB_TOKEN`-authored PRs, "other
  `GITHUB_TOKEN`-triggered events do not create workflow runs at all"
  (excepting `workflow_dispatch` and `repository_dispatch`), so
  `pull_request_target` would not cover the four automation producers either;
  the dispatch path must stay (pinned to the default branch).
- **Fork token permissions — CONFIRMED (read-only half).** Events page § Workflows
  in forked repositories: "With the exception of `GITHUB_TOKEN`, secrets are
  not passed to the runner when a workflow is triggered from a forked
  repository. The `GITHUB_TOKEN` has read-only permissions in pull requests
  from forked repositories." The repo is public (`gh repo view`:
  `visibility: PUBLIC`), so forks are possible. [INFERENCE] The consequence that
  `Apply tier label` then fails and no label lands (gate fails closed) is
  derived from reading the workflow, not run.
- **`workflow_dispatch` file/ref — PARTIALLY CONFIRMED.** Same events page:
  `GITHUB_REF` is the "Branch or tag that received dispatch", `GITHUB_SHA` the
  last commit on it, and it can be dispatched "against any branch or tag via the
  API or CLI"; it only fires if the workflow file exists on the default branch.
  [INFERENCE] that the file version executed is the one at the chosen ref (the
  page implies it via `GITHUB_SHA`; I did not find an explicit sentence).
- **Branch-protection state (`CI Gate` only, no required reviews,
  `enforce_admins: false`) — UNVERIFIED here.** Carried from the origin review;
  not re-queried.

## Root-cause hypothesis

Hypothesis, not a finding: the gate's trust boundary is a path rule, not an
execution context. The classifier treats the PR head as code to run, when it
should be data to inspect. #7078 moved one module (`tier-escalation.mjs`) to a
base-branch read, but the selector for "which base" (`base_ref`) and everything
upstream of it (the resolver, the workflow file itself, the eligibility script
in the two arming workflows) still come from the PR. Path rules cannot protect
the file that applies path rules. The reproduction above is consistent with this
hypothesis (changing one value, `base_ref`, moves T4 to T1 with the real
Classify code), but does not rule out other PR-controlled inputs.

## Blast radius

- **Who can use it:** anyone able to push a same-repo branch/open a PR (write
  access): collaborators, a leaked automation token (`AUTOMATION_PAT`), or a
  prompt-injected agent branch. Agent branches are real actors in this repo.
  Fork PRs: read-only token (confirmed) so the label write fails; [INFERENCE]
  fails closed. Dispatch needs write access too.
- **What it buys them:** a forged low tier (`tier:trivial`) removes the
  tier hold in `merge-queue.yml` and `auto-merge.yml` (both read only the
  label). Through the same-class path, a PR-edited `merge-queue-eligibility.mjs`
  can also fake eligibility and the trusted-author check directly, with
  `contents: write` in those workflows.
- **What still holds:** `CI Gate` is required [per origin review, unverified
  here]; the arming workflows still need the `has-pr` / `auto-merge` label,
  which a writer can add; fork PRs fail closed [INFERENCE on the consequence].
- **Since when:** not dated. Per the origin review, #7078 moved only the policy
  module to a base-branch read and was understood to close the class; I did not
  trace git history for when the PR-head checkout + resolver pattern appeared.
- **Evidence of use:** none found. No evidence anyone has used it (not
  searched exhaustively; the brief states none).
- **Severity:** Major (origin review's call, kept): a working way to lower a
  PR's own tier on the merge gate, needing write access.
- **Scale implication:** this is a security-relevant CI/trust-model change and
  the change itself is T4 (`tier-classifier.yml`, `scripts/*` gate files);
  Review and Ship should scale accordingly.

## Ruled out

- **Steering `base_ref` alone does not reach T1.** Own-branch `base_ref`
  floors at T2 (reproduced above: `tier:standard`, still blocked). A lower tier
  needs a second attacker-pushed branch or a script-level takeover.
- **Fork PRs are not a path** (read-only fork token, confirmed by GitHub docs;
  consequence [INFERENCE]).
- **A path rule or required code-owner review cannot close this alone.**
  Path rules are applied by the classifier the PR controls; the origin review's
  interim item 3 is partial by its own admission. (Branch-protection changes are
  Out of scope per Matt in any case.)
- **`auto-merge.yml`'s `check_suite` path is not exposed** to PR-edited code
  (GitHub runs `check_suite` on the default branch's last commit).
- **The trusted-author list is not an independent control** (it lives in the
  PR-editable script, `merge-queue-eligibility.mjs:218`, executed from the PR
  checkout at `auto-merge.yml:110`).

## Notes

### Scope (as set by Matt, 2026-11-02; recorded exactly)

- **In:**
  - make `tier-classifier.yml` a trust boundary: base-only execution, and
    `base_ref` from a trusted source;
  - T4 path rules in the classifier for the other merge-gate files
    (`scripts/resolve-pr-metadata.mjs`, `scripts/merge-queue-eligibility.mjs`,
    `.github/workflows/auto-merge.yml`, `.github/workflows/merge-queue.yml`);
  - correct `docs/change-tiers.md:28` and the workflow comment
    (`tier-classifier.yml:78-84`).
- **Same class, Architect decides whether it is in this run or a named
  follow-up:** `auto-merge.yml` running `merge-queue-eligibility.mjs` from the PR
  checkout. Capture finding for that decision: `merge-queue.yml:18-21,59` does
  the same and is not named in the brief; Architect should decide both together
  and say so explicitly.
- **Out (Matt, 2026-11-02):**
  - adding the gate files to agent-core `GATE_PATHS`;
  - turning on required code-owner review or any other branch-protection
    setting;
  - the 4 deferred minors of the tier-escalation review.

### Desired shape (from the brief)

The tier gate executes only base-branch code. The PR head is data: its file
list and numstat are read without running anything it contains. `base_ref`
comes from the event payload or base-side code, never from PR-head code. On
dispatch, the workflow ref is pinned to the default branch.

### Design decision delegated to Architect

Matt: "Let Architect decide". Weigh `pull_request_target` (base-only workflow,
file list from the API; the pattern `dependabot-auto-merge.yml:7-12` already
uses) against a separate base checkout under `pull_request`, plus any option it
finds. Take the architect skill's recommended default and log it under
`assumptions:`; if the skill has none, stop and surface. Inputs this capture
adds: GitHub confirms `pull_request` runs the PR's own workflow file (so a
separate-base-checkout design under `pull_request` cannot protect the workflow
file itself; only a default-branch-resident workflow can), and
`GITHUB_TOKEN`-authored PRs do not fire `pull_request`/`pull_request_target`
at all, so the dispatch path (pinned to the default branch) has to survive.

### Constraints (from the brief)

- TDD: RED test first pinning the trust boundary; keep `tier-escalation`,
  `tier-classifier-workflow`, `tier-classifier-dispatch`,
  `merge-queue-tier-race` green.
- GitHub Actions security: never check out and execute PR code with a write
  token; pass every PR-derived value through `env:`, never interpolate `${{ }}`
  into script bodies (see the `dependabot-auto-merge.yml` header).
- Repo gotchas: `set -o pipefail` in workflows; no `status` shell variable;
  explicit-path staging; never pipe `git push`; prettier-format docs.
- Active ADRs bind: ADR-016 (`docs/adr/ADR-016-green-main-merge-gating.md`).
- Release (Matt): prepare and stop. Ship opens the fix PR (code + run
  artifacts), records `outcome: prepared` with `pending-merge:`, and stops.
  Matt reviews and merges. No merge, deploy, publish or tag.
- Operate: skip — no retro this run.
- UX: no user-facing surface (CI tooling). Tracker: none.

### Work already in flight (2026-11-02): nothing matches

The check **ran** (not "could not run"). Recipe and results:

- `git fetch origin`; `git branch -a --no-merged origin/main` filtered on
  `tier|gate|classif|pr-head`: only this run's own branch
  (`fix/tier-gate-pr-head-code`) plus unrelated gate-named branches. Related
  but not this defect: `docs/tier-escalation-false-positives-autorun` and
  `-retro` (the origin run's artifacts / retro), and
  `origin/ci-fix/tier-hold-test-drift` (one commit, `a48a335d6`, reconciling
  `merge-queue-eligibility.test.mjs` with the no-tier-hold policy; touches only
  that test and an implement-queue SKILL).
- `git worktree list`: this worktree, `venue-scoped-routes-autorun`
  (`docs/tier-escalation-false-positives-retro`), `mbe-keygate`
  (`fix/key-gated-workflows-visible-skip`). None addresses PR-head code in the
  gate.
- `docs/fixes/`: only `key-gated-workflows-visible-skip` (unrelated) and this run.
- `gh pr list --state open`: #8177 (tier-escalation operate retro), #8167
  (availability feature), #8157 (chaos synthetic bug). None touches a gate
  file. `gh issue list --state open --search "tier classifier pull_request_target"`:
  empty.

### Provenance

The brief's [INFERENCE] about the workflow file coming from the PR merge commit
is now confirmed (see Primary sources). The fork "fails closed" claim is
half-confirmed (read-only token documented; label-write failure inferred).
