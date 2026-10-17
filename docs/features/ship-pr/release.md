---
stage: ship
run: feature:ship-pr
date: 2026-10-17
assumptions:
  - "Recording-only Ship, per the autorun brief's 'Resume 2026-10-16' release authorization: the change already merged (#6667, #6675, #6794). No deploy, merge, tag, push, publish or issue creation was performed here."
  - "'Production' for a repo-local project skill means `.claude/skills/ship-pr/SKILL.md` on `main`. Claude Code sessions load it from a checkout of `main`, so the merge is the release. No package version or tag exists for it, so none is cut."
  - "Major 1 from review.md (`needs-review` hold is not honoured by the skill's own steps) is not critical, so it does not block recording under the soft gate. It stays an open Owner decision, listed below. The Owner has not yet accepted the deferral."
  - "For #6667 and #6675, push CI on the merge SHA was cancelled with zero jobs. The CI evidence for them comes from (a) the PR-head `CI Gate` and (b) the first green push run on `main` whose tree contains the commit. Neither SHA was re-run, because that would be a new release action."
  - "The rollback plan removes the skill and its CLAUDE.md row and keeps #6794. #6794 closes #6769, a separate fix that the implement-queue profile and the mbe-feature-drain routine now rely on. Reverting it would be its own decision, not this skill's rollback."
  - "Ship pre-flight ran the local-ci-precheck steps against the worktree head 19999f204, which is 48 commits behind origin/main b51da0f76. `.claude/skills/ship-pr/` and the CLAUDE.md row are byte-identical between the two. `.claude/implement-queue.md` differs only in § batch composition and § telemetry, which the skill does not reference."
---

# Release: /ship-pr project skill (already merged; recorded)

## Pre-flight

- [x] **Verification green.** `verification.md` has no unresolved
      failures. Its one open note covers ~20 `scripts` suites that fail to
      load in a bare worktree, in files the diff does not touch.
- [x] **Review soft gate.** `review.md` has no critical findings. Major 1
      is deferred and waits on the Owner (see Open Owner decision).
- [x] **No secrets in the diff.** I grepped the three merge commits for
      Stripe live keys, AWS key ids, PEM private-key headers and JWTs, with
      no hits. The `Secret Scan` workflow passed on every merge SHA (see the
      table below).
- [x] **No target config needed.** The skill reads nothing from the
      environment beyond the `gh` auth that the scripts it calls already
      use.
- [x] **Migrations/data:** none. The run is markdown, plus one pure
      TypeScript predicate in `@mbe/agent-core` (#6794).
- [x] **ADRs:** none added by this run (`architecture.md`: no decision met
      the ADR bar).
- [x] **Rollback plan is concrete** (below).
- [x] **Launch brief:** `python3 <ship>/../../launch_demo.py config` printed
      `NONE` / `launch-demo: 0 problem(s)` (exit 0). There is no config, so
      the skill writes nothing and adds no Release-log entry.
- [x] **Repo Ship hook: local-ci-precheck.** I ran the steps from
      `.claude/skills/local-ci-precheck/SKILL.md` directly against
      `19999f204` on Node v22.22.3. The first parallel pass was red on lint
      only. The cause is a known race between parallel turbo builds that
      write the same `packages/rialto/dist`, not a code defect. Lint run on
      its own passed. Quoted results:

  | Step                                                        | Result                                                                                                                                                |
  | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1 `pnpm install --frozen-lockfile`                          | exit 0, `Done in 4s`                                                                                                                                  |
  | 2 `pnpm lint` (parallel pass)                               | exit 1: `@mattbutlerengineering/rialto:build: Error: ENOENT: no such file or directory, open '.../packages/rialto/dist/lib/hooks/useThemeState.d.ts'` |
  | 2 `pnpm lint` (re-run alone)                                | exit 0, `Tasks: 52 successful, 52 total`                                                                                                              |
  | 3 `pnpm typecheck`                                          | exit 0, `Tasks: 52 successful, 52 total`                                                                                                              |
  | 4 CLI build + `check-adr` + `check-deps`                    | exit 0: `✅ No architectural violations detected.` / `✅ All external dependencies are consistent across the monorepo.`                               |
  | 5 drift (dep-graph `git diff --exit-code` + `pack --check`) | exit 0: dep graphs unchanged; 27 × `llms.txt is in sync`, 0 stale                                                                                     |

  Logs are in the session scratchpad (`ship-pr-precheck/*.log`). After the
  run, `git status` showed only the run's own uncommitted artifacts, so the
  precheck regenerated nothing.

## Rollback plan

Door: two-way. The release is one markdown skill file and one CLAUDE.md
table row. Deleting them through a normal PR fully undoes it. Nothing
outside the repo was published, and no state was written.

Blast radius: if the call is wrong, the Owner and any pipeline session that
invokes `/ship-pr` notice, because the command stops resolving. No routine,
workflow or skill calls it (`git grep ship-pr origin/main` finds only the
CLAUDE.md row, run artifacts, ledger records and the marketing
shipped-features data). No user-facing surface changes.

```
# 1. Branch from current main (never the stale local checkout)
git fetch origin
git switch -c revert/ship-pr-skill origin/main

# 2. Remove the skill and its CLAUDE.md row. Do NOT `git revert 96fa53fbb`
#    wholesale: that squash also carries docs/factory/costs.jsonl ledger
#    rows and the run artifacts, which must stay.
git rm -r .claude/skills/ship-pr
#    edit CLAUDE.md: delete the `| /ship-pr | ... |` row in § Skills (line 94 at b51da0f76)

# 3. Gates the skill touched
node scripts/check-claude-md-table-drift.mjs
node scripts/check-skill-references.mjs
pnpm exec prettier --check CLAUDE.md

# 4. PR through CI (CI Gate is the required check), merged by a human
git commit -m "revert(ship-pr): remove /ship-pr skill"
git push -u origin revert/ship-pr-skill
gh pr create --base main --title "revert(ship-pr): remove /ship-pr skill" --body "..."
gh pr merge <N> --squash --subject "revert(ship-pr): remove /ship-pr skill (#<N>)" --delete-branch

# Leave #6794 (571dd99ec) in place. It is #6769's fix, and
# .claude/implement-queue.md § fast-path and docs/routines/mbe-feature-drain.md
# depend on GATE_PATHS / qualifiesForLowRiskFastPath. Revert it only as its
# own decision, with `git revert 571dd99ec` in a separate PR, then
# `pnpm build --filter @mbe/cli... && pnpm regen` for its llms files.
```

## Release log

The release happened before this stage. These entries record it from the
GitHub REST API (`repos/{owner}/{repo}/pulls/<N>`,
`actions/runs?head_sha=<sha>`, `actions/runs/<id>/jobs`,
`commits/<sha>/status`, `commits/<sha>/check-runs`).

1. **#6667**, "#6639: conductor batch b20261014c", merged
   2026-10-15T04:43:14Z → merge SHA `96fa53fbbf1b6a69cadedf1ed6721679a041187d`.
   It adds `.claude/skills/ship-pr/SKILL.md`, the CLAUDE.md row and the run
   artifacts.
   - PR head `2b9ad7e0`: `CI Gate` check run = **success** (run
     38682555753), commit status `CI Gate` = success.
   - Push CI on the merge SHA: run 38682944322 = **cancelled with 0
     jobs** (superseded while pending in the `CI-refs/heads/main`
     concurrency group). No `CI Gate` exists on this SHA, and the combined
     status is `pending` with no contexts.
   - Covering green main run: the next push, `fae1c85d3` (#6593), ran CI
     38683063910 = success, with the `CI Gate` job = **success**. Its tree
     contains `96fa53fbb`.
   - Other push workflows on the SHA: ADR check, Secret Scan, Release,
     Instruction Regression Testing and Push on main = success.
     Post-Merge Reconciliation = cancelled.
2. **#6675**, "feat(ship-pr): gate-path hold before fast path; record gates
   and dry walk-through", merged 2026-10-15T05:37:21Z → merge SHA
   `cd36c1ba7586b88c39a84f9aaea1a38b5a9c0ad4`. The squash subject on main
   differs from the PR title
   (`docs(ship-pr): run gates and dry walk-through; hold gate-path PRs before the fast path`).
   - PR head `cf0e8a2e`: `CI Gate` check run = **success** (run
     38686469481), commit status = success.
   - Push CI on the merge SHA: run 38687777975 = **cancelled with 0
     jobs** (same concurrency supersession; three later pushes landed in
     the same minute and were also cancelled). No `CI Gate` exists on this
     SHA.
   - Covering green main run: `d1047723e` ran CI 38687832438 = success,
     with the `CI Gate` job = **success**. `git merge-base --is-ancestor
cd36c1ba7 d1047723e` holds.
   - Other push workflows on the SHA: ADR check and Secret Scan = success.
     Release and Post-Merge Reconciliation = cancelled.
3. **#6794**, "feat(agent-core): GATE_PATHS inside
   qualifiesForLowRiskFastPath", merged 2026-10-16T04:09:42Z → merge SHA
   `571dd99ecc0bc94857b0e3886370507c6b26c308`.
   - PR head `b1197f03`: `CI Gate` = **success** (run 38846955727).
   - Push CI on the merge SHA: run 38849168980 = success. Job-level: the
     `CI Gate` job = **success**, and Build, Lint, Typecheck, Integrity,
     Architecture Audit, Test (Node 22: rest, rialto, reservations,
     hospitality), Test Coverage Gate, Dependency Sync, Validate
     Migrations, RLS Integration, the 4 container scans, AI Antipattern
     Ratchet and Dockerfile Lint all = success. Visual Tolerance Change
     Check, Migration Dry-Run, Docs Formatting and Accessibility AI
     Attribution = skipped by design. Commit status: combined = success
     (`CI Gate`, `codecov/patch`).
   - Other push workflows on the SHA: Deploy Services, Release, ADR check
     and Secret Scan = success. Post-Merge Reconciliation = cancelled.
     Revert Watchdog = skipped.
4. **This stage:** no release action was executed. There was no deploy,
   merge, tag, push, publish or issue creation, and nothing was committed.

## Post-release checks

- **Skill is present on `main`.** `.claude/skills/ship-pr/SKILL.md` is
  unchanged from `571dd99ec` to `origin/main` `b51da0f76`
  (`git diff --stat` is empty). Its frontmatter has `name: ship-pr` and
  `user-invocable: true`.
- **The harness resolves the skill.** This Ship session's own skill
  registry lists `ship-pr`.
- **Instruction drift checks** were re-run on the head:
  `node scripts/check-skill-references.mjs` → `PASS: Every /slash-command
named in an instruction file resolves to a skill or is declared with a
reason.` and `PASS: No repo-local skill shares a plugin skill's name
without a declared reason.`
  `node scripts/check-claude-md-table-drift.mjs` → `PASS: CLAUDE.md tables
(CLI commands, skills, subagents) match the repo tree.`
- **End-to-end exercise: not demonstrated.** Steps 1-3 were walked
  read-only on #6674 (verification.md), and steps 4-5 only by calling the
  classifier functions directly. No real `/ship-pr` invocation has carried
  a green PR through review and merge: `git log origin/main --grep=ship-pr`
  shows only the three build commits, and no routine references the skill.
  This is review Minor 5. The first real run on a green PR is Operate's
  evidence to collect.

## Open Owner decision (review Major 1)

**Until this is fixed, do not run `/ship-pr` on a PR that carries
`needs-review`.** The skill's own steps never stop on the `hold_labels`
label. Step 4 only uses `needs-review` to turn off the fast path. Step 5
names only gate paths as a hold. So a reviewer PASS on a `needs-review`
PR arms `--auto`, or merges directly when GitHub reports `CLEAN`. That
bypasses an explicit human hold the profile (`.claude/implement-queue.md:5`,
`:16`, `:262`) and the plugin (`implement-queue/SKILL.md:137-138`, `:171`)
both treat as "no review, no merge". The Owner should either accept the
deferral or order the fix: in step 1, stop with `held — needs-review` on
any `hold_labels` label, as the plugin's step 2 does.

## Follow-ups

These are proposed backlog lines in text only. `docs/backlog.md` was not
written.

- `- [ ] ship-pr: honour hold_labels in step 1 (stop "held — needs-review"); fold in Minors 1, 3, 4 — review Major 1 (feature:ship-pr)`
- `- [ ] ship-pr: map § reviewers' queue-only inputs for an ad-hoc PR — AC from PR body + Closes #N issue, reviewer reads a throwaway worktree of the PR head, a FLAG stops with no retry — review Minor 1 (feature:ship-pr)`
- `- [ ] implement-queue profile: one recorded node invocation for reviewersForDiff / qualifiesForLowRiskFastPath / matchesGatePath that fails closed on import error; ship-pr points to it and names matchesGatePath, not GATE_PATHS — review Minor 2 (feature:ship-pr)`
- `- [ ] ship-pr: step 2 wording — classifyCiGateStatus does not depend on the agent-core dist (scripts/ci-gate-status.mjs imports only node builtins) — review Minor 3 (feature:ship-pr)`
- `- [ ] ship-pr: replace step 4's restated gate-path / needs-review pre-check with a pointer to § fast-path and qualifiesForLowRiskFastPath — review Minor 4 (feature:ship-pr)`
- `- [ ] ship-pr: record the first real /ship-pr run on a green PR (reviewer dispatch, --auto or CLEAN-direct merge, [Merge Without Review] stop) as end-to-end evidence — review Minor 5 (feature:ship-pr, Operate)`
- `- [ ] implement-queue profile § ci-status: gate-unattributed text calls the ci.yml commit-status fix "not-yet-implemented"; it landed in #4025 and was confirmed 2026-08-24 — review Minor 6 (profile)`
- `- [ ] local-ci-precheck: lint, typecheck and drift lanes race on parallel turbo builds of packages/rialto/dist (ENOENT useThemeState.d.ts seen 2026-10-17); build shared deps once before fanning out — found in this Ship pre-flight`

## Outcome

Shipped with hiccups, recorded after the fact. The skill reached `main`
through #6667 and #6675, and #6794 later adjusted it. Every PR head had a
green `CI Gate`. On `main`, push CI for #6667's and #6675's merge SHAs
was cancelled by concurrency supersession before any job ran. The covering
runs on `fae1c85d3` and `d1047723e` are green at the `CI Gate` job level,
and #6794's own merge SHA is green job by job. The skill resolves and passes
both instruction drift checks. Its review-and-merge half has never run for
real. One Major (the `needs-review` hold) is open for the Owner. Next stage:
Operate.
