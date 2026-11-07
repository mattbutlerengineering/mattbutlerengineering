# Autorun brief: tier-classifier escalation false positives

<!-- stop-after: decompose — lifted 2026-10-18, see § Resume 2026-10-18 -->

## Source

GitHub issue #6655 (part 10 of 10 for SDLC speed, tracking #6637), driven as a
Conductor batch item on branch `conductor/sdlc-ci-6655`. The issue body is the
brief's substance; this file condenses it for the stage skills.

## Feature description (what and why)

`tier-classifier.yml` escalates PR tiers on two signals that both
over-trigger, measured 2026-10-14: (1) the >1000-added-lines size escalation
counts every added line, including generated files the classifier itself
already rates "T1: auto-generated" (`llms*.txt` et al.) — #6610 was escalated
T3→T4 on 2198 added lines of which only 988 were code; (2) the
secrets/incident keyword escalation fires on any descriptive mention — #6541
(docs + one app file) escalated on the sentence "…`E2E_AUTH0_*` credentials or
CI/artifact access…". 3 of 4 open PRs wait on a human because of tier, two of
them false positives. Extract both decisions into a pure, unit-tested module
(`scripts/tier-escalation.mjs`), count only review-surface additions, require
an incident cue for keyword escalation, and replay old-vs-new over the last
300 PRs before changing behaviour.

## Run scale and slug

Feature run, slug `tier-escalation-false-positives`, re-entering at Idea.

## Decisions already made (from the issue)

- Module: `scripts/tier-escalation.mjs` + `scripts/__tests__/tier-escalation.test.mjs`,
  called from `.github/workflows/tier-classifier.yml` instead of inline logic.
- Size rule: exclude paths the classifier rates T1-generated (`**/llms.txt`,
  `**/llms-full.txt`, `pnpm-lock.yaml`, `**/registry.json`,
  `infrastructure/worker/dep-graph.json`,
  `docs/architecture/dependency-graph.md`, `**/generated*`); decide `*.md`
  explicitly — recommendation (take as default): exclude `docs/features/**`
  run artifacts, keep other docs counting.
- Keyword rule: escalate only on an actual incident/rotation signal (keyword
  in the title, or in a sentence with an incident cue); keep the existing
  "sensitive path already matched" hard-set gate.
- Replay 300 PRs old-vs-new before changing behaviour; pin each changed case
  with a test; table goes in the implementation PR description.
- Acceptance: #6610 → T3, #6591 → stays T4, #6541 → no keyword escalation;
  "we leaked the Stripe key and must rotate it" → still T4; existing workflow
  tests stay green; `pnpm lint && pnpm typecheck && pnpm test` pass.
- Patterns: BYPASS_PHRASE/REQUEST_CUE mention-vs-request fix (#3919→#3921);
  pure decision extracted from a workflow (`scripts/merge-queue-eligibility.mjs`).

## Tracker

Run is seeded from issue #6655; the Conductor owns that issue's lifecycle
(labels, close at merge). No tracker export from this run — no new issues, no
per-item mirroring.

## Release authorization

None. Prepare-and-stop default stands, and the run stops at Decompose
(`stop-after` above) regardless. This session never pushes and never opens a
PR; it keeps `pr-body.md` (uncommitted, worktree root) current for the
Conductor.

## Reserved identifiers

prd 8, adr 110-112, wo 76-85 — used only if the stage conventions call for
them; this repo's `docs/adr/` sequence is at ADR-026, so an ADR here would
take a reserved number only at merge time if the T4 gate demands one.

## Pre-flight record (protocol: open PRs first / work in flight)

Could not run: this session has no GitHub credential and no `gh`/network
tools (Bash is restricted to python3, git add/commit/status/diff/log, and the
conductor gate). Reported as not-run, not as clean.

## Resume 2026-10-18 — shipped by the Conductor; Verify + Review + Ship record

The Owner re-invoked autorun on this run on 2026-10-18 and answered two gap
questions live (not assumptions):

1. **Shape:** "Verify + Review + Ship record." The `stop-after: decompose`
   line above is lifted.
2. **Operate:** see `operate:` below.

Facts measured at resume, not assumptions:

- Shipped: **#6701** `b8af19905` ("fix(ci): count only review-surface lines
  and incident signals toward tier escalation"), merged
  2026-10-15T14:03:57Z; #6655 closed 2026-10-15T14:03:58Z. Blueprint
  #6674 `f485c7efc`. Conductor ledger/scorecard #6946. `breakdown.md` 6/6
  checked. `scripts/tier-escalation.mjs` exists on `main`.
- This session HAS `gh` and network (the original pre-flight could not run;
  it now can). Open-PR pre-flight 2026-10-18: no open PR touches
  `tier-classifier.yml` or `scripts/tier-escalation*`.
- Remaining stages run in `.claude/worktrees/tier-escalation-close`, branch
  `docs/tier-escalation-close`, cut from `origin/main`. Run
  `pnpm install --frozen-lockfile` there before tests.

What each stage does:

- **Verify** grades the acceptance criteria above against `main`, with real
  commands: `pnpm --dir scripts test` (tier-escalation and workflow tests),
  the module run against the real PRs named (#6610 -> T3, #6591 stays T4,
  #6541 no keyword escalation) and the "we leaked the Stripe key and must
  rotate it" sentence -> T4, and evidence from real `tier-classifier.yml`
  runs on PRs merged/opened since 2026-10-15 (run IDs, the tier label each
  PR got). Read-only on GitHub: never add/remove labels, dispatch
  workflows, or comment.
- **Review** reviews #6701 as merged plus anything on `main` since that
  touched the same files. A major finding stays open for the Owner.
- **Ship** records the release that already happened (`outcome: released`).
  The "deploy" is `main`'s workflow file taking effect: evidence is the
  first real `tier-classifier.yml` runs on `b8af19905`-or-later. No new
  release action. A critical finding is a live defect, reported.
- The orchestrator opens the docs PR and leaves it for the Owner.

## Operate

operate:
minimum-signal: >-
At least 20 PRs classified by tier-classifier.yml after #6701 merged,
read from real workflow runs, with every escalation among them
hand-checked as a true or false positive. users-observed counts PRs
and humans honestly; 0 is valid.

## Verify decisions 2026-10-18 (Owner, live — not assumptions)

`verification.md` (`254295b88`) graded 2 of 6 PRD criteria FAIL and flagged a
gate bypass. The Owner answered:

3. **Gate bypass (live on `main`):** `tier-classifier.yml` checks out the PR
   head (line 53) and imports `scripts/tier-escalation.mjs` from it (line
   140); no path rule covers that file, so a PR can edit the policy and
   lower its own tier. "Fix now: base-ref + T4 rule." The workflow loads
   the policy module from the base branch, never the PR head, and
   `scripts/tier-escalation.mjs` gets a T4 path rule. RED test first. This
   also ends the `ERR_MODULE_NOT_FOUND` fail-closed on pre-#6701 branches.
4. **Criterion 1 (#6610 -> T3) FAIL:** "Amend criterion, fix fixture."
   #6610 classifying T4 (1004 counted lines: 988 code + 16 in
   `services/reservations/CLAUDE.md`) is accepted as correct; `CLAUDE.md` /
   `AGENTS.md` stay counted. The test fixture that claimed "#6610 shape
   stays T3" is corrected to the real shape and asserts T4.
5. **Criterion 4** (replay table / pins) follows from 4: the corrected
   fixture is the #6610 pin.

Routing: this re-enters **Implement** for one fix PR (items 3-4), opened by
the orchestrator and left for the Owner's merge. Verify re-runs after it
merges; Review and Ship follow.

## Resume — 2026-11-02 (Matt present, in-session answers)

Matt re-invoked autorun and chose this run, which drives Verify (re-run) →
Review → Ship, then Operate if its `minimum-signal` exists. There is no stop
line.

Facts measured at resume:

- The 2026-10-18 routing's fix PR has merged: **#7078** `79b02e565` ("fix(ci):
  load the tier-escalation policy from the base branch; T4 for policy
  edits"), merged 2026-10-22T21:09:34Z. It delivers Verify decisions 3–5 above:
  - the `Load tier policy from base branch` step;
  - the T4 path rule for `scripts/tier-escalation.mjs`;
  - `docs/change-tiers.md` § T4;
  - the #6610 fixtures corrected to 1004 counted lines → T4 in
    `tier-escalation.test.mjs` and `tier-classifier-workflow.test.mjs`.
- The 2026-10-18 close-out was never pushed: local branch
  `docs/tier-escalation-close`, tip `8bc99acb5`, 673 commits behind
  origin/main, no PR. Its brief is adopted verbatim above. Its
  `verification.md` (`254295b88`: 3 pass, 2 fail) was never merged.
- **Orchestrator decision (logged; it mirrors Matt's 2026-11-02 ruling on the
  same situation in venue-scoped-routes, "adopt, re-verify fresh"):**
  - Verify re-runs on current origin/main, under the PRD criteria as Matt
    amended them on 2026-10-18 (#6610 → T4 is correct).
  - Verify uses the old verification only as its criteria and command
    template (`git show docs/tier-escalation-close:docs/features/tier-escalation-false-positives/verification.md`)
    and never copies its evidence.
  - The local branch stays untouched.
- **Worktree / branch (supersedes the 2026-10-18 one):**
  `.claude/worktrees/venue-scoped-routes-autorun`. The path name is kept from
  the previous run, because moving it would break pnpm's absolute `.bin`
  paths. Branch `docs/tier-escalation-false-positives-autorun`, cut from
  `origin/main` @ `6e9adc880`, with no upstream. Dependencies were
  re-bootstrapped for the post-#8166 lockfile.
- **Open-PR pre-flight (2026-11-02, this invocation):** drained under Matt's
  in-session permission to merge any PR.
  - Merged: #8005, #8160, #8166, #8168, #8173, #8174, #8175.
  - #8170: union-merge conflict fixed; auto-merge armed.
  - #8167: held, because its reviewer flagged a real defect.
  - #8157: chaos-agent PR, never to be merged.
  - No open PR touches `tier-classifier.yml` or `scripts/tier-escalation*`.
- **Release authorization (Matt, 2026-11-02, live):** Ship may merge its own
  pull request (`gh pr merge --auto --squash --delete-branch`) once `CI Gate`
  is green and `review.md` has no unfixed critical or major finding, and then
  records the outcome.
  - The code release itself already happened: #6701 on 2026-10-15 and #7078
    on 2026-10-22, live as `main`'s workflow. Ship records that and does not
    re-release it.
  - No deploy, publish or tag beyond what CI does on merge.
  - A critical or major finding stops Ship before the merge and is surfaced.
- **Tracker:** none (#6655 closed 2026-10-15).
- **Operate:** the `operate:` section above stands (Matt, 2026-10-18).
  Operate runs after Ship only if that minimum signal exists, counted from
  real `tier-classifier.yml` runs.

## Review decision 2026-11-02 (Matt, live — not an assumption)

`review.md` (`06ca05cb2`) found one open MAJOR: PR-head code (`scripts/resolve-pr-metadata.mjs`, and the workflow file itself under `pull_request`) can steer `tier-classifier.yml` and lower its own PR's tier. Matt chose **"Separate fix run, defer here"**:

- The MAJOR is deferred, still open, to a new maintenance run `docs/fixes/tier-gate-pr-head-code`. That run is started as the next autorun, after this one.
- Because the deferral is explicit, the MAJOR no longer stops this run's Ship merge. Ship merges its artifact PR under the release authorization above and records `outcome: released` for the code release that already happened (#6701, #7078).
- Operate then runs. Its minimum signal is met per verification.md: 885 distinct PRs were classified since #6701.
