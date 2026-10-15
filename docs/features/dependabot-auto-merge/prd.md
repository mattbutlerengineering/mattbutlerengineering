---
stage: prd
run: feature:dependabot-auto-merge
date: 2026-10-14
prd-id: 4
ux: not-applicable
ux-reason: "CI/dependency automation with no user-facing surface — the outputs are a Dependabot config, a workflow, and a Node policy module"
assumptions:
  - "The @types group is named `types` — the issue says 'make @types/* land in an auto-mergeable group' and 'the @types group' without fixing a name; `types` follows the existing short-name convention (dev-deps, official-actions)."
  - "prd-id 4 is taken from this conductor item's reserved id block (prd 4, adr 98-100, wo 36-45)."
---

# PRD 4: auto-merge official-action and @types Dependabot bumps on green CI

## Problem statement

Every slow PR in the repo's p90 (≈24 h vs a ~33 min median, measured
2026-10-14 over the last 30 merged Dependabot PRs — issue #6650) is a
Dependabot bump Matt has already decided to accept in principle:
official-action patch/minor updates and `@types/*` updates. The existing
`dependabot-auto-merge.yml` cannot merge them because (1) the
`github-actions` ecosystem declares no `groups`, so `fetch-metadata` reports
an empty `dependency-group` and the workflow's only merge branch
(`dependency-group == 'dev-deps'`) never fires for actions; and (2) the npm
`dev-deps` group requires `dependency-type: "development"`, so `@types/*`
under a `dependencies` block matches no group. The decision logic also lives
in workflow `if:` expressions, untestable and already wrong in its wording
(it calls every non-dev-deps update a "production dependency", including
GitHub Actions bumps).

## Policy (decided by Matt 2026-10-14 — a constraint, not a question)

Auto-merge on green CI, patch/minor only:

- GitHub Actions updates whose action owner is `actions` or `github`;
- all `@types/*` updates, regardless of dependency type.

Manual forever: third-party actions (e.g. `hadolint/*`), production npm
deps, and anything `semver-major`.

## Requirements

1. **R1 — grouping.** `.github/dependabot.yml`: the `github-actions`
   ecosystem gains a group `official-actions` matching `actions/*` and
   `github/*` (third-party actions stay ungrouped); npm gains a group
   `types` matching `@types/*` with no `dependency-type` restriction, and
   `@types/*` leaves the `dev-deps` patterns so each package matches exactly
   one group.
2. **R2 — pure policy.** `scripts/dependabot-auto-merge-policy.mjs` exports
   `decideDependabotMerge({ ecosystem, group, updateType, dependencyNames })`
   returning a merge/manual decision plus a human-readable reason, with a
   CLI entry the workflow calls (pattern:
   `scripts/merge-queue-eligibility.mjs`). Unit tests live in
   `scripts/__tests__/dependabot-auto-merge-policy.test.mjs`.
3. **R3 — workflow rewire.** `dependabot-auto-merge.yml` calls the policy
   CLI and merges (`gh pr merge --auto --squash`) only on a `merge`
   decision; otherwise it posts the manual-review comment, whose wording no
   longer calls a non-npm update a "production dependency".
4. **R4 — security invariants.** The workflow keeps
   `on: pull_request_target` and `if: github.actor == 'dependabot[bot]'`,
   and never checks out PR head code.
5. **R5 — measurement note.** The implementation PR states how many of the
   30 measured PRs would have auto-merged under the new rule.

## Success criteria (acceptance, from #6650)

- Unit tests pass for exactly these cases: `actions/setup-node` minor →
  merge; `github/codeql-action/upload-sarif` patch → merge;
  `hadolint/hadolint-action` minor → manual; any `semver-major` → manual;
  `@types/node` patch in a production `dependencies` block → merge; a
  production npm dep → manual.
- `pnpm repo-audit` passes (workflow guards, fitness-check wiring).
- `pnpm lint && pnpm typecheck && pnpm test` pass for affected packages.

## Out of scope

Branch protection, `auto-merge.yml`, the merge train, tier classifier,
Dependabot schedules; auto-merging anything the policy above calls manual.
