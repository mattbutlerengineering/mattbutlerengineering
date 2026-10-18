---
stage: review
run: feature:dependabot-auto-merge
date: 2026-10-18
verdict: no critical findings and no live production defect; 2 majors stay open for the Owner, 4 minors deferred
assumptions:
  - "Scope is #6680 (`3e336927a`) as merged. No commit on `origin/main` (tip `552dcabd4` at review time) after `3e336927a` touches `.github/dependabot.yml`, `.github/workflows/dependabot-auto-merge.yml`, `.github/workflows/auto-merge.yml`, the policy or its two test files (`git log 3e336927a..origin/main -- <those paths>` printed nothing)."
  - "Domain pass selection: the domain-reviewers table does not select the Dependencies pass, because `.github/dependabot.yml` is not a manifest or lockfile. The orchestrator asked for the `dependency-update-reviewer` checklist anyway, so it was applied to the config change by hand (no subagent). Payments and Migrations: not selected."
  - "Severity of M1 and M2 is Major, not Critical. Both mechanisms predate #6680 (the old dev-deps branch used the same `gh pr merge --auto --squash` call), #6680 widens them, and no out-of-policy auto-merge has happened since it merged (verification.md C8). The Owner may re-rank either one."
  - "Minors are deferred per the review skill's default ('Minors ... may be deferred freely'). The brief does not address them. Each deferral reason is logged with its finding."
  - "ADR standing: `adr_status.py` reports every ADR in this repo as `unrecognized` with status text 'active' or 'superseded'. Per the adr-compliance reference, 'active' is treated as live."
  - "No `docs/standards.json` exists in this repo, so no finding cites a standards slug."
---

# Review: auto-merge official-action and @types Dependabot bumps on green CI

## Scope

- **#6680 as merged**, squash `3e336927a`, merged 2026-10-15T05:52:32Z.
  Files: `.github/dependabot.yml`, `.github/workflows/dependabot-auto-merge.yml`,
  `scripts/dependabot-auto-merge-policy.mjs` (new),
  `scripts/__tests__/dependabot-auto-merge-policy.test.mjs` (new),
  `scripts/__tests__/dependabot-auto-merge-workflow.test.mjs` (new), and
  `breakdown.md`.
- **Later commits on `main` touching the same files:** none (see assumptions).
- **Third-party code it trusts:** `dependabot/fetch-metadata` at the pinned
  SHA `25dd0e34f4fe68f24cc83900b1fe3fe149efef98`. That SHA is the `v3.1.0` tag
  (`gh api repos/dependabot/fetch-metadata/git/refs/tags/v3.1.0` → that SHA).
  Its `src/` was read at the pin, read-only. The checkout pin
  `3d3c42e5aac5ba805825da76410c181273ba90b1` is the `actions/checkout`
  `v7.0.1`/`v7` tag.
- **Live evidence:** read-only `gh api` reads of PRs #6577, #5484, #6575,
  #5845 and #6685, their timelines, events, commits and workflow runs, plus
  branch protection.

Security got the deepest pass because this workflow merges code into `main`
with a write token.

## The three items Verify flagged

### 1. Does `update-type` report the highest bump across a grouped PR? **Yes, so it is not critical.**

The source at the pinned SHA, `src/dependabot/output.ts`:

```ts
10	const UPDATE_TYPES_PRIORITY = [
11	  'version-update:semver-major',
12	  'version-update:semver-minor',
13	  'version-update:semver-patch'
14	]
…
21	  const updateType = maxSemver(updatedDependencies)
…
79	function maxSemver (updatedDependencies: Array<updatedDependency>): string | null {
80	  const semverLevels = updatedDependencies.reduce(function (semverLevels, dependency) {
81	    semverLevels.add(dependency.updateType)
…
85	  return UPDATE_TYPES_PRIORITY.find(semverLevel => semverLevels.has(semverLevel)) || null
```

The action's own `action.yml` describes the output as "The highest semver
change being made by this PR". Its upstream test `output.test.ts:71`
('when given a multiple dependencies, it uses the highest values for types')
expects `semver-major` at line 105. Each dependency's `updateType` comes from
its own entry in the Dependabot-signed commit YAML, falling back to a
version comparison (`update_metadata.ts:103`,
`dependency['update-type'] || calculateUpdateType(lastVersion, nextVersion)`).
Real commits in this repo carry the field for every entry. For example,
grouped PR #6685's first commit lists `update-type: version-update:semver-patch`
for each of its 3 dependencies, and #6575 and #5845 (single actions bumps)
carry `semver-minor` and `semver-patch`.

So a `types` or `official-actions` group PR that contains one major reports
`version-update:semver-major`. `decideDependabotMerge` returns manual at
`scripts/dependabot-auto-merge-policy.mjs:55`, and a probe confirms it:

```
$ node scripts/dependabot-auto-merge-policy.mjs decide --ecosystem github_actions --group official-actions --update-type version-update:semver-major --dependency-names "actions/checkout, actions/setup-node"
{"action":"manual","reason":"Major version updates require manual review."}
```

There is one residual edge, a dependency whose update type cannot be
determined at all. It is minor m3 below. Separately, the major can still
reach `main` through a different path, which is M1 below.

### 2. `dev-deps` merges on the group name alone. **Minor m1, deferred.**

### 3. `@eslint-react/eslint-plugin` lands in `production-deps`. **Minor m2, deferred. It fails safe.**

## Findings

### Major M1: security — once auto-merge is armed it is never revoked, so the PR merges whatever its head is when `CI Gate` goes green, not what the policy evaluated

- **Where:** `.github/workflows/dependabot-auto-merge.yml:20`
  (`if: github.actor == 'dependabot[bot]'`), `:50-55` (arms
  `gh pr merge --auto --squash`), `:57-63` (the manual branch only comments
  and never runs `gh pr merge --disable-auto`).
- **Mechanism.** The policy decides once, on the push Dependabot made. A
  later push by anyone else does not re-run the job, because the actor gate
  skips it. The arming persists, and GitHub merges the head that exists when
  `CI Gate` turns green. A later Dependabot push that the policy rejects runs
  the comment step and leaves the earlier arming in place.
- **Observed, on this repo, on the same command (#6577, pre-#6680 workflow):**
  - `auto_squash_enabled` by `github-actions[bot]` at 2026-10-13T22:10:20Z
    (issue events API), for Dependabot's patch/minor dev-deps commit.
  - 2026-10-14T21:51:59Z: commit `a2f3337a36`, author `mattbutlerengineering`,
    `verified: false`, "align playwright packages to 1.64 and fix lint for
    dev-deps bump". Then `ecd3723bd5`, a merge of `origin/main`. Together they
    touched 9 files (8 `package.json` plus `pnpm-lock.yaml`).
  - The only `Auto-merge Dependabot` run after those pushes is
    `38640264341`, actor `dependabot[bot]`, on `31b76032` (the Dependabot
    rebase). Nothing re-evaluated `a2f3337a36` or `ecd3723bd5`.
  - `merged` by `github-actions[bot]` at 2026-10-14T22:20:43Z. The arming
    carried non-Dependabot code (labelled `tier:sensitive` by the classifier)
    into `main`.
- **Failure scenarios that #6680 now extends to `official-actions` and
  `types`:**
  - (a) Observed shape: an agent or human pushes a "fix CI" commit onto an
    armed Dependabot PR. That commit merges with no reviewer gate. This
    contradicts the repo rule to "run the diff-matched review gate **before**
    setting `--auto`" (gotchas § CI).
  - (b) Suspicion, not shown: Dependabot re-pushes an armed group PR in place
    and the new content includes a newly released major. In-place force-pushes
    of group PRs do happen here: #6577 at 2026-10-14T21:26:17Z and #5484 at
    2026-09-19T05:51:18Z, both `head_ref_force_pushed` by `dependabot[bot]`.
    The re-run would decide `manual` and comment, but it would not disarm, so
    the major merges on green. What would settle it: a group PR whose version
    set changes on a Dependabot force-push while armed.
- **Fix options for the Owner** (not decided here): run
  `gh pr merge --disable-auto` in the manual branch (tolerating "not
  enabled"), and/or add a job without the actor gate that disarms when
  `github.event.pull_request.user.login == 'dependabot[bot]'` and
  `github.actor != 'dependabot[bot]'`.
- Standard: none.
- **Decision: OPEN — left for the Owner.**

### Major M2: design — merges finished by this workflow land on `main` as `GITHUB_TOKEN` pushes, so no `push` workflow (main CI, Release, Post-Merge Reconciliation) runs for them, and `main` is not `strict`

- **Where:** `.github/workflows/dependabot-auto-merge.yml:52-55`. Auto-merge
  is armed with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, so GitHub completes
  the merge as `github-actions[bot]`. This is the anti-recursion trap in
  gotchas § CI.
- **Evidence.** #6577's merge commit `43ca33a0f` (merged by
  `github-actions[bot]`) has 6 runs and **none with `event: push`**: 3×
  `Auto-Merge Policy` `check_suite`, 1 Dependabot `dynamic`, 1 `claude`
  `issue_comment`, and `Push on main` `dynamic`. #6680's own human merge
  `3e336927a` has `push` runs for `CI`, `Release`, `Post-Merge Reconciliation`,
  `ADR check` and `Secret Scan`. Branch protection measured today:
  `{"contexts":["CI Gate"],"strict":false}`.
- **Failure scenario.** An in-policy PR passes `CI Gate` against a stale merge
  ref, which non-strict `main` allows. It merges after another PR has changed
  `main`, and the combination breaks. No push CI runs on that merge commit, so
  `main` is red with no red run until the next human merge's push CI. The same
  applies to an official-action bump that changes how a `push`-only workflow
  behaves. Release/deploy also skips that commit. ADR-016's invariant ("`main`
  must always be green") goes unobserved for these commits.
- **Scale.** Before #6680 this applied to `dev-deps` only. #6680's own WO-39
  replay says 21 of the 30 measured PRs would now auto-merge.
- **Fix options for the Owner:** accept it (Dependabot-only, PR CI did run).
  Or have a `pull_request_target: closed` + merged step run
  `gh workflow run ci.yml --ref main`, which is the documented
  `workflow_dispatch` exception (it needs `actions: write`). Or arm with a
  non-`GITHUB_TOKEN` credential. The brief puts the merge train and
  `auto-merge.yml` out of scope, which is another reason this is the
  Owner's call.
- Standard: none.
- **Decision: OPEN — left for the Owner.**

### Minor m1: correctness — the `dev-deps` branch merges on the group name with no name check, unlike the two new groups (Verify item 2)

- **Where:** `scripts/dependabot-auto-merge-policy.mjs:58`
  (`if (group === "dev-deps") return merge(...)`). Compare `:60-70`, where
  `official-actions` and `types` require every name to match its prefix. The
  module's own header (`:10-12`) says the prefix check exists "so an edit to
  dependabot.yml's group patterns cannot silently widen the set of PRs that
  merge themselves". `dev-deps` is the one group that check does not cover.
- **Probe:**
  `decide --ecosystem npm_and_yarn --group dev-deps --update-type version-update:semver-minor --dependency-names "left-pad"`
  → `{"action":"merge","reason":"Dev dependency patch/minor update."}`.
- **Scenario.** A future `dependabot.yml` edit that adds, say,
  `"@typescript-eslint/*"` or `"*"` to `dev-deps` patterns widens auto-merge
  with no test going red. Context, not part of this finding: the existing
  unscoped wildcards `eslint*`, `prettier*` and `playwright*` already match
  any npm publisher's package with that prefix (e.g. any `eslint-plugin-*`).
  That auto-merge surface predates #6680 and was decided earlier.
- **Decision: deferred.** The behaviour is unchanged from before #6680 (the
  test calls it "existing behavior preserved"), and the group's
  `dependency-type: "development"` plus a reviewed `dependabot.yml` bound it
  today. A one-line fix mirroring the `dev-deps` patterns would close it.

### Minor m2: design — scoped lint tooling falls into `production-deps` and is called a "production dependency" (Verify item 3)

- **Where:** `.github/dependabot.yml:16-39`. `eslint*` does not match scoped
  names, the same trap the file documents for `@vitest/*` and
  `@playwright/*`. The workspace's `devDependencies` include
  `@eslint-react/eslint-plugin`, `@eslint/compat`, `@eslint/js` and
  `typescript-eslint`, and none of them matches a `dev-deps` pattern.
- **Scenario.** These bump inside `production-deps`, so they stay manual. The
  PR comment then calls them a production dependency, as it did on #6685, a
  `direct:development` `@eslint-react/eslint-plugin` patch: "⚠️ This is a
  production dependency update and requires manual review." This fails safe,
  in the manual direction. The costs are mislabelling and lint plugins
  stalling inside the production group.
- **Decision: deferred.** It is outside #6650's decided policy, and widening
  `dev-deps` is a policy change for the Owner, best done together with m1's
  name check.

### Minor m3: correctness — a group member whose update type cannot be determined drops out of the "highest bump"

- **Where:** fetch-metadata `output.ts:79-85` (pinned). The policy reads only
  the aggregate `update-type` (`dependabot-auto-merge.yml:37`).
- **Scenario.** If one entry in a group has no `update-type` in the commit
  YAML **and** its versions cannot be compared (`calculateUpdateType` returns
  `''`), it is not added to the max. The upstream test `output.test.ts:148`
  ('some do not have update types') expects `semver-minor` for a group with
  two typeless members. If such a member were a major in `types` or
  `official-actions`, it would merge. Not observed: every real commit
  examined (#6685, #6575, #5845, #6577's `31b76032`) carries a per-entry
  `update-type`. A fully typeless PR yields `null`, which already maps to
  manual (`policy.mjs:54`).
- **Hardening:** decide on `steps.metadata.outputs.updated-dependencies-json`
  and require every entry to have a non-empty, non-major `updateType`.
- **Decision: deferred.** It needs two independent omissions by Dependabot,
  and there is no evidence that either happens.

### Minor m4: security — the actor gate is `github.actor` only, and the spoof it is exposed to is closed by fetch-metadata, not by this workflow

- **Where:** `dependabot-auto-merge.yml:20`.
- **Scenario.** The known spoof is a fork PR whose branch is then updated by
  the fork's Dependabot. That makes `github.actor == 'dependabot[bot]'` on
  `synchronize`. Today it fails closed inside fetch-metadata
  (`verified_commits.ts:27`: `pr.user.login !== DEPENDABOT_LOGIN` → `false`;
  `:40` checks the first commit's author; `:48` requires a verified
  signature). `main.ts:47` then calls `setFailed('PR is not from Dependabot')`,
  so the job dies before `Decide`. The safety therefore rests on a
  third-party default (`skip-verification: false`). A future edit that sets
  that input, or an action upgrade that changes it, would open the gate.
- **Hardening:**
  `if: github.actor == 'dependabot[bot]' && github.event.pull_request.user.login == 'dependabot[bot]'`.
  Also note that fetch-metadata verifies only `commits[0]`, which is why M1's
  later pushes are invisible to it.
- **Decision: deferred.** Not exploitable at the current pin.

## Passes with no findings

- **Security, `pull_request_target` hygiene (apart from M1 and m4):** clean.
  - The checkout has no `ref:` or `repository:` (`:23-26`), so it fetches the
    base. The live run `38689740212` fetched base `61330001…`, not PR head
    `2891cb9d…` (verification.md C2).
  - `persist-credentials: false`.
  - No PR-controlled code is executed: `node` runs the base checkout's
    script, and `jq` is the runner's.
  - No cache or artifact restore, so there is no cache-poisoning path.
  - Every PR-derived value reaches the shell through `env:` (`:34-38`,
    `:53-55`, `:60-63`), and none is interpolated into `run:`.
  - `$GITHUB_OUTPUT` receives only the policy's fixed `action` and `reason`
    strings, so newline injection is not possible.
  - `set -o pipefail` is present, and `decision=$(…)` under the default
    `bash -e` aborts on a policy crash.
  - Permissions are `contents: write` and `pull-requests: write`, the minimum
    for `gh pr merge --auto` and `gh pr comment`. No `actions`, `id-token`
    or secret beyond `GITHUB_TOKEN`.
  - The prefix regexes are anchored (`^(actions|github)\/`, `^@types\/`), so
    `actions-evil/x` cannot match. That case is tested.
- **Correctness of the policy:** clean apart from m1 and m3. Fail-closed
  checks all hold: unknown group → manual; empty names, missing update type
  or major → manual (probe: `--update-type ""` → manual). The ecosystem
  strings match fetch-metadata's real values (`packageEcosystem: chunks[1]`
  of the branch name: `npm_and_yarn`, `github_actions`). The
  `github/codeql-action/upload-sarif` name, which is real in #5845, passes the
  prefix check.
- **Design:** the code matches `architecture.md` §1-3 step for step,
  including the base-only checkout and the env passing. No undocumented
  deviation. No missing ADR: the grouping and the pure-policy extraction are
  two-way doors that follow the `merge-queue-eligibility.mjs` pattern,
  matching architecture.md's own ADR-test reasoning. The `# v4/v5` comment on
  a `v7.0.1` checkout pin is a repo-wide convention (86 occurrences), not
  #6680's.
- **Complexity (lean cut-list):** nothing to cut. One 107-line pure module
  with one caller (the workflow) and one test file, the shape the PRD (R2)
  required. No speculative options and no dead branches.
- **ADR compliance:** ADR-016 (green-main gating) and ADR-027 (non-strict
  main) are in reach. The diff breaks neither decision directly: merges still
  require `CI Gate`. ADR-016's goal is what M2 puts at risk, recorded there.
  ADR-016's text still says "`main` is **`strict`**", which is measured false
  today. That is a pre-existing ADR/reality drift, noted and not graded
  against this run. The other ADRs (001-015, 017-026, 028) are out of scope:
  UI, API, auth, data and agent runtime.
- **Dependencies (the `dependency-update-reviewer` checklist, applied by
  hand):** items 1-8 and 10 are not applicable, since no package version
  changes. Item 9 (cross-package mismatch) improves: `@playwright/*` now
  bumps with `playwright*`, which closes the #6577 split that went red.
  Item 11 (coverage-tooling risk): `@vitest/coverage-v8` stays auto-mergeable
  via `dev-deps`, but the coverage floor is enforced inside `CI Gate`
  (ADR-016), so a downward re-measure blocks the merge rather than landing.
- **Domain passes (table):** none selected.

## Verdict

**No critical finding. Nothing here is a live production defect.** The
specific Verify concern (a grouped `semver-major` slipping through
`types`/`official-actions`) is ruled out at the pinned fetch-metadata source.
#6680 is live on `main` and does what it claims for the PRs it evaluates.

The Owner has two **open majors** to decide. Both predate #6680, and #6680
widens both. **M1:** an armed auto-merge is never revoked, so later
non-Dependabot pushes merge unreviewed; this was observed on #6577. **M2:**
merges completed by `GITHUB_TOKEN` skip every `push` workflow on a non-strict
`main`. The four minors are deferred with their reasons logged.

Ship may record the release (`outcome: released`) with M1 and M2 listed as
open and owned by the Owner.
