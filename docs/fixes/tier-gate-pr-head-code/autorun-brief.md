# Autorun brief: tier-gate-pr-head-code

Collected 2026-11-02 from Matt (in session, live answers). This is not a pipeline
artifact.

## Run

- **Scale:** maintenance run (a security defect in the merge gate's trust model),
  slug `tier-gate-pr-head-code`, in `docs/fixes/tier-gate-pr-head-code/`. It
  enters at Capture. Expected re-entry: `architect`, because the fix changes
  which code the gate trusts.
- **Origin:** the open MAJOR in
  `docs/features/tier-escalation-false-positives/review.md` (main @ `ab4a3b2bc`,
  merged via #8176). Matt deferred it on 2026-11-02 ("Separate fix run, defer
  here"). That review's § "Major" is the primary evidence source. Re-verify
  every line pointer on current origin/main before relying on it.
- **Worktree / branch:** `.claude/worktrees/bootstrap-worktree-autorun` (path
  name kept from an earlier run), branch `fix/tier-gate-pr-head-code`, cut
  from `origin/main` @ `ab4a3b2bc`, with no upstream. Never use the main
  checkout.

## Defect (what is broken)

`.github/workflows/tier-classifier.yml` executes code from the PR it is
classifying, so a PR can lower its own tier:

- It triggers on `pull_request` and `workflow_dispatch`, and checks out the PR
  head (`ref: github.event.pull_request.head.sha`; on dispatch, the
  dispatcher's `--ref`).
- It then runs `node scripts/resolve-pr-metadata.mjs` from that checkout, with
  a `pull-requests: write` token in the job env. The script's stdout becomes
  `title`, `body`, `head_sha`, `base_ref` and `is_fork`.
- `base_ref` drives the diff range (merge-base, `--name-only`, `--numstat`) and
  #7078's base-branch policy load (`git show "origin/${PR_BASE_REF}:scripts/tier-escalation.mjs"`).
  `title`/`body`/`is_fork` feed Classify.
- A PR that edits the script can point `base_ref` at its own branch, which
  gives an empty diff and loads its own edited policy. Pointing it at a second
  branch the attacker pushed gives a markdown-only diff, so T1. The script can
  also run arbitrary code (`GITHUB_ENV`, `gh pr edit` with the job token).
- Under `pull_request` the workflow file itself comes from the PR's merge
  commit, so a PR can edit `tier-classifier.yml`, including the rule meant to
  catch that edit [INFERENCE: standard Actions behaviour; Capture confirms].
- No path rule covers `resolve-pr-metadata.mjs`, so an edit to it defaults to T2.
- Nothing downstream catches it independently. `merge-queue-eligibility.mjs`
  reads only the `tier:*` label. Branch protection requires only `CI Gate`,
  with no required reviews and `enforce_admins: false`. `auto-merge.yml` also
  runs `merge-queue-eligibility.mjs` from the PR checkout, which is the same
  class of problem.
- `docs/change-tiers.md:28` and the workflow comment at `:78-84` claim "a PR
  cannot edit the policy to lower its own tier". That guarantee does not hold.

**Evidence available:**

- file:line in the origin review;
- the reviewer's local throwaway-repo re-run of the two `git` steps
  (`PR_BASE_REF=feat` → 0 files and the PR's edited policy;
  `PR_BASE_REF=main` → 2 files).

Capture reproduces it locally again (read-only on GitHub; never exploit the
live gate, never dispatch workflows, never push a test branch).

**Root-cause hypothesis:** the gate's trust boundary is a path rule, not
execution context. The workflow treats the PR head as code to run, when it
should be data to inspect.

**Blast radius:**

- Who can use it: anyone with write access, which includes collaborators, a
  leaked automation token, or a prompt-injected agent branch. Agent branches
  are real actors in this repo.
- What it buys them: a forged low tier bypasses the tier holds in
  `merge-queue.yml` and `auto-merge.yml`.
- What still holds: `CI Gate` is still required, and fork PRs fail closed
  because their token is read-only [INFERENCE].
- There is no evidence anyone has used it.

## Desired shape

The tier gate executes only base-branch code. The PR head is data: its file
list and numstat are read without running anything it contains. `base_ref`
comes from the event payload or base-side code, never from PR-head code. On
dispatch, the workflow ref is pinned to the default branch.

## Scope

- **In:**
  - make `tier-classifier.yml` a trust boundary: base-only execution, and
    `base_ref` from a trusted source;
  - T4 path rules in the classifier for the other merge-gate files
    (`scripts/resolve-pr-metadata.mjs`, `scripts/merge-queue-eligibility.mjs`,
    `.github/workflows/auto-merge.yml`, `.github/workflows/merge-queue.yml`);
  - correct `docs/change-tiers.md:28` and the workflow comment.
- **Same class, Architect decides whether it is in this run or a named
  follow-up:** `auto-merge.yml` running `merge-queue-eligibility.mjs` from the
  PR checkout.
- **Out (Matt, 2026-11-02):**
  - adding the gate files to agent-core `GATE_PATHS`;
  - turning on required code-owner review or any other branch-protection
    setting;
  - the 4 deferred minors of the tier-escalation review.

## Decisions already made

- **Fix design (Matt):** "Let Architect decide". Architect weighs
  `pull_request_target` (base-only workflow, file list from the API; the
  pattern `dependabot-auto-merge.yml` already uses) against a separate base
  checkout under `pull_request`, plus any option it finds. It takes the
  skill's recommended default and logs it under `assumptions:`. If the skill
  offers no default, it stops and surfaces.
- GitHub Actions security rules apply:
  - never check out and execute PR code with a write token;
  - pass every PR-derived value through `env:`, never by interpolating
    `${{ }}` into a script body (see the `dependabot-auto-merge.yml` header).

## Constraints

- TDD:
  - write a RED test first, pinning the trust boundary (for example, the
    workflow never runs a PR-head script, and `base_ref` comes from the
    payload or base);
  - keep the existing tier tests green (`tier-escalation`,
    `tier-classifier-workflow`, `tier-classifier-dispatch`,
    `merge-queue-tier-race`).
- Repo gotchas apply:
  - `set -o pipefail` in workflows;
  - no `status` shell variable;
  - explicit-path staging;
  - never pipe `git push`;
  - prettier-format docs.
- Active ADRs bind (ADR-016 merge gating).

## Tracker

None. No GitHub issue interaction.

## UX

No user-facing surface (CI tooling).

## Release authorization (Matt, 2026-11-02)

Prepare and stop.

- Ship opens the fix PR (code plus run artifacts), records `outcome: prepared`
  with `pending-merge:`, and stops.
- Matt reviews and merges the gate change himself.
- No merge, deploy, publish or tag.

## Operate

operate: skip — no retro this run; the run stays active until someone has
feedback to capture.

## Pre-flight record

- **Open PRs (2026-11-02):** drained earlier this session under Matt's merge
  permission. Still open: #8157 (a chaos-agent synthetic bug, never to be
  merged) and #8167 (held on a reviewer flag). Neither touches a merge-gate
  file.
- **Work in flight:** checked 2026-11-02. Nothing matches: no run directory,
  branch, worktree, open PR or open issue is already doing this work.
