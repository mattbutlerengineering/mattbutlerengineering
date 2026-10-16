---
stage: decompose
run: feature:dependabot-auto-merge
date: 2026-10-14
assumptions:
  - "Work-order ids WO-36..WO-39 are taken in order from this item's reserved block (wo 36-45); wo 40-45 go unused."
  - "Tracker mirror: all items mirror the one existing issue #6650 (ADR-0026 import, no new issues created); #6650 closes at the implementation PR."
  - "Ordering is dependency order: the pure policy first (TDD), then the configs that consume it, then the measurement which replays the policy. One implementation PR carries WO-36..38 together — the workflow without the policy script is broken, so they cannot merge separately; WO-39 is a PR-body obligation of that same PR."
---

# Breakdown: Dependabot auto-merge policy

Progress lives in the checkboxes — Implement checks items off as acceptance
criteria are met, test-first per repo mandate. All four items ship in one
implementation PR (see frontmatter).

## Milestone 1: policy + wiring

- [x] **WO-36 — pure policy module + tests** — RED first:
      `scripts/__tests__/dependabot-auto-merge-policy.test.mjs` pins the six
      acceptance cases (`actions/setup-node` minor → merge;
      `github/codeql-action/upload-sarif` patch → merge;
      `hadolint/hadolint-action` minor → manual; any semver-major → manual;
      `@types/node` patch under production `dependencies` → merge; production
      npm dep → manual) plus fail-closed cases (unknown/empty group, empty
      names, prefix mismatch) and npm-vs-non-npm reason wording; then
      `scripts/dependabot-auto-merge-policy.mjs` (`decideDependabotMerge` +
      `decide` CLI, no dependencies) goes GREEN. (tracker: #6650)
- [x] **WO-37 — dependabot.yml groups** — add `official-actions`
      (`actions/*`, `github/*`) under the `github-actions` ecosystem; add npm
      group `types` (`@types/*`, no `dependency-type` key) and remove
      `@types/*` from `dev-deps` patterns, per architecture § 1. Accept: each
      affected package name matches exactly one group by inspection against
      the file's own pattern-matching comment. (tracker: #6650)
- [ ] **WO-38 — workflow rewire** — `dependabot-auto-merge.yml` per
      architecture § 3: pinned base-ref checkout, metadata passed via `env:`,
      `set -o pipefail`, branch on the CLI's printed `action`, comment posts
      the policy `reason`. Accept: `on: pull_request_target` and the
      dependabot actor gate unchanged; no `ref:` on checkout; verify
      fetch-metadata v3.1.0 output names against its README before wiring
      (architecture assumption 3); `pnpm repo-audit` green. (tracker: #6650)

## Milestone 2: evidence

- [ ] **WO-39 — measurement note** — replay the 30 PRs measured in #6650
      (their group/update-type under the NEW dependabot.yml grouping) through
      `decideDependabotMerge` and state in the implementation PR body how
      many would have auto-merged; needs `gh` access to enumerate the 30 PRs
      — if the implementing session lacks it, compute from the PR list
      quoted in #6650 and label the count as derived from that sample.
      (tracker: #6650)

## Notes

- Gates for the implementation PR: `pnpm lint && pnpm typecheck && pnpm test`
  (affected: `scripts/`), `pnpm repo-audit`, local-ci-precheck before first
  push; reviewer: `dependency-update-reviewer`.
- Blueprint gate: this run stops here (`stop-after: decompose` in the brief).
  Implement onward is a later session's work, priced separately by the
  conductor (issue agent block: sonnet, $1.00).
