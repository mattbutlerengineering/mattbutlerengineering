---
kind: autorun-brief
run: feature:dependabot-auto-merge
date: 2026-10-14
stop-after-lifted: decompose (2026-10-18, see § Resume 2026-10-18)
---

# Autorun brief: auto-merge official-action and @types Dependabot bumps on green CI

Not an artifact — this file never counts toward orientation or active-run
discovery. It is the single source of interview answers for every stage of
this run. Where it is silent, a stage takes its skill's recommended default
and logs it under `assumptions:`; where no default exists, it stops and
surfaces.

`stop-after: decompose` (lifted 2026-10-18, see § Resume) — this run is driven up to the blueprint gate
(`breakdown.md` committed) and stops there. Implement onward belongs to a
later session.

## Origin

Conductor item for issue #6650 (part 7 of 8 of the **sdlc-speed** feature,
tracking #6637), batch `conductor/b20261014c-6650`. The issue body — written
by `/decompose` and carrying Matt's explicit policy decision of 2026-10-14 —
is the verbatim source for every answer below.

**Pre-flight (open PRs first): could not run.** This environment carries no
GitHub credential — every `gh` command is forbidden and pushes fail — so the
open-PR list and the in-flight duplication check are both unrunnable here.
Recorded per protocol as "the check could not run", not as a clean result.
Mitigation on record: the issue declares this item "Parallel-safe: yes with
parts 1–6", and the conductor's batch plan priced these items as a batch.

## Problem (sufferer's view)

Matt hand-merges Dependabot PRs that need no judgement. Measured 2026-10-14
over the last 30 merged Dependabot PRs: median open→merge across all repo PRs
is ~33 min, but p90 is ~24 h and **every** slow PR is Dependabot — GitHub
Actions patch/minor bumps (#5845 codeql-action 248 h, #4785 27 h, #6572–#6575
24 h each) and `@types/*` bumps (#4794 216 h, #4795 215 h, #5365 108 h, #6070
81 h, #6578 24 h), nearly all merged by hand.

## Who / why now / evidence

- **Who:** Matt (the only human merge path), and the sdlc-speed goal — these
  stalls set the repo's p90 cycle time.
- **Why now:** the sdlc-speed measurement (2026-10-14) identified this as the
  single largest p90 contributor; parts 1–6 attack other causes.
- **Evidence:** the measured PR list above (from the issue, not re-measured
  here — no tracker access in this environment).

## Root causes (established in the issue)

1. `.github/dependabot.yml`'s `github-actions` ecosystem has **no `groups`**,
   so `dependabot/fetch-metadata` returns an empty `dependency-group`;
   `dependabot-auto-merge.yml` treats anything not `dev-deps` as production
   and posts "requires manual review" (e.g. #6575 `actions/setup-node`
   7.0.0→7.1.0).
2. The `dev-deps` npm group also requires `dependency-type: "development"`,
   so `@types/*` declared under a package's `dependencies` matches neither
   group and is never auto-merged.

## Decided policy (Matt, 2026-10-14 — not revisitable by this run)

Auto-merge on green CI for:

- (a) GitHub Actions **patch/minor** updates whose action owner is `actions`
  or `github`;
- (b) **all `@types/*`** updates (patch/minor) regardless of dependency type.

Third-party actions (e.g. `hadolint/*`) and production npm deps stay manual.
Any `semver-major` stays manual.

## Solution shape (from the issue's task list)

1. `.github/dependabot.yml`: add a `groups` entry for the `github-actions`
   ecosystem collecting `actions/*` and `github/*` (e.g. `official-actions`),
   and make `@types/*` land in an auto-mergeable group whatever its
   dependency type.
2. `.github/workflows/dependabot-auto-merge.yml`: auto-merge
   (`gh pr merge --auto --squash`) when the group is `dev-deps`,
   `official-actions` or the `@types` group **and** `update-type` is not
   `semver-major`; keep the manual-review comment otherwise, and fix its
   wording so a non-npm update is not called a "production dependency".
3. Pure, unit-tested policy: `scripts/dependabot-auto-merge-policy.mjs`
   exporting `decideDependabotMerge({ ecosystem, group, updateType,
dependencyNames })`, called from the workflow via its CLI — the
   `scripts/merge-queue-eligibility.mjs` pattern.

## Scope boundaries

- **In:** the three files above + their test file; the PR-body note counting
  how many of the 30 measured PRs would have auto-merged under the new rule.
- **Out:** any change to branch protection, `auto-merge.yml`, the merge
  train, tier classifier, or Dependabot schedules; auto-merging third-party
  actions or production npm deps; semver-major anything.

## Success criteria (from the issue's acceptance criteria)

- Unit tests: `actions/setup-node` minor → merge;
  `github/codeql-action/upload-sarif` patch → merge;
  `hadolint/hadolint-action` minor → manual; any `semver-major` → manual;
  `@types/node` patch in a production `dependencies` block → merge; a
  production npm dep → manual.
- Workflow keeps `on: pull_request_target`,
  `if: github.actor == 'dependabot[bot]'`, and never checks out PR head code.
- `pnpm repo-audit` passes (workflow guards, fitness-check wiring).
- PR notes how many of the 30 measured PRs would have auto-merged.
- `pnpm lint && pnpm typecheck && pnpm test` pass for affected packages.

## Constraints / already decided

- Reviewer for the change: `dependency-update-reviewer` subagent;
  supply-chain notes in `.claude/rules/gotchas.md` § Dependencies.
- Reserved id block for this item: **prd 4, adr 98–100, wo 36–45**. If the
  block runs out, stop and say so.
- Never edit `.claude-plugin/plugin.json`'s version.
- Model/budget for the conductor Worker: sonnet, $1.00 (issue's agent block)
  — applies to the implement step, not this blueprint run.

## Tracker mirror

Yes — opt-in per ADR-0026. Every breakdown work item carries
`(tracker: #6650)`. No new issues are created; #6650 is the mirror for the
whole item and closes at the implementation PR, not this blueprint PR.

## UX surface

None — CI/dependency automation only. PRD records `ux: not-applicable`.

## Release authorization

None requested and none granted. Moot in practice: `stop-after: decompose`
ends the run before Implement. The blueprint PR itself is opened by the
Conductor from `pr-body.md`; this session never pushes or merges.

## Resume 2026-10-18 — shipped by the Conductor; Verify + Review + Ship record

The Owner re-invoked autorun on this run on 2026-10-18 and answered two gap
questions live (not assumptions):

1. **Shape:** "Verify + Review + Ship record." The `stop-after: decompose`
   in the frontmatter is lifted.
2. **Operate:** see `operate:` below.

Facts measured at resume, not assumptions:

- Shipped: **#6680** `3e336927a` ("ci(deps): auto-merge official-action and
  @types Dependabot bumps on green CI"), merged 2026-10-15T05:52:32Z; #6650
  closed 2026-10-15T05:52:34Z. Related: #6677 (why armed auto-merge #6577
  waited 24h), conductor batch #6668, ledger #6949. `breakdown.md` 4/4.
- This session HAS `gh` and network (the original pre-flight could not run;
  it now can). Open-PR pre-flight 2026-10-18: no open PR touches any
  `dependabot` path.
- Remaining stages run in `.claude/worktrees/dependabot-close`, branch
  `docs/dependabot-auto-merge-close`, cut from `origin/main`. Run
  `pnpm install --frozen-lockfile` there before tests.

What each stage does:

- **Verify** grades the PRD success criteria against `main`: the pure
  policy's unit tests and workflow tests (real commands, quoted), plus a
  read-only replay over every real Dependabot PR opened since #6680 merged:
  for each, what the policy decided, whether auto-merge was armed, whether
  it merged and how long open->merge took, and whether anything outside
  the policy (production deps, majors, third-party actions) auto-merged —
  that would be a critical finding. Read-only on GitHub: no merges,
  labels, comments, approvals, or workflow dispatches.
- **Review** reviews #6680 as merged plus anything on `main` since that
  touched the same files. A major finding stays open for the Owner.
- **Ship** records the release that already happened (`outcome:
released`): the workflow/config on `main` took effect at merge; evidence
  is the first real `dependabot-auto-merge.yml` runs after it. No new
  release action. A critical finding is a live defect, reported.
- The orchestrator opens the docs PR and leaves it for the Owner.

## Operate

operate:
minimum-signal: >-
At least 10 Dependabot PRs opened after #6680 merged, with the measured
p90 open->merge time for the in-policy ones compared against the
2026-10-14 baseline (~24 h). users-observed counts PRs and humans
honestly; 0 is valid.

## Review decisions 2026-10-18 (Owner, live — not assumptions)

`review.md` (`7020754c3`) returned no critical, two majors, four minors. The
Owner answered:

3. **M1 — armed auto-merge is never revoked (security):** "Fix now + m4."
   A separate fix PR, outside this run's Ship, makes
   `dependabot-auto-merge.yml` re-evaluate on every `synchronize` and run
   `gh pr merge --disable-auto` unless the head commit is still authored by
   `dependabot[bot]` and the policy still decides `merge`; and adds the
   `github.event.pull_request.user.login == 'dependabot[bot]'` gate (m4).
   RED test first; the Owner merges. Ship records M1 as open with that fix
   pending; it does not block the record.
4. **M2 — GITHUB_TOKEN-completed merges fire no `push` workflows:**
   "Defer to seed." Ship lists it as a follow-up seed tied to the existing
   `AUTOMATION_PAT` gap (docs/SECRETS.md): merge with an App/PAT token so
   push workflows run. Needs an Owner-minted secret.
