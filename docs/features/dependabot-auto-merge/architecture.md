---
stage: architect
run: feature:dependabot-auto-merge
date: 2026-10-14
ux: "skipped — CI/dependency automation with no user-facing surface (prd.md ux-reason)"
assumptions:
  - "The policy double-checks dependency names (owner prefix for official-actions, @types/ prefix for types), not just the group label — defense in depth so a future dependabot.yml pattern edit cannot silently widen the merge set. Skill default: fail closed."
  - "The workflow may check out the BASE repo (actions/checkout's default ref on pull_request_target is the base) to obtain the policy script — R4's 'never checks out PR head code' forbids the PR head, not the trusted base. No `ref:` input is ever set."
  - "fetch-metadata v3.1.0's outputs are assumed to include package-ecosystem, dependency-names (comma-separated), dependency-group and update-type for grouped PRs; Implement verifies against the pinned action's README before wiring, and only the wiring (not the policy rules or tests) may change if a name differs."
  - "No ADR: both decisions (grouping shape, pure-policy extraction) are two-way doors, unsurprising in context, and follow an existing in-repo pattern (merge-queue-eligibility.mjs) — all three ADR-test legs fail, so the reserved adr ids 98-100 go unused. One-line decisions recorded below instead."
---

# Architecture: Dependabot auto-merge policy

Three small changes; the decision logic moves to one pure module.

## 1. `.github/dependabot.yml`

- `github-actions` ecosystem gains:

  ```yaml
  groups:
    official-actions:
      patterns: ["actions/*", "github/*"]
  ```

  Third-party actions match no group → empty `dependency-group` → manual
  (unchanged behavior for them, now by policy rather than accident).

- npm ecosystem: add group `types` with `patterns: ["@types/*"]` and **no**
  `dependency-type` key (so it captures `@types/*` wherever declared), and
  remove `"@types/*"` from `dev-deps`' patterns. `production-deps` already
  excludes `@types/*`; each package now matches exactly one group. Trap to
  respect (the `vitest*` comment in the file): patterns match full package
  names, scoped names start with `@`.

## 2. `scripts/dependabot-auto-merge-policy.mjs` (new, pure, no deps)

`decideDependabotMerge({ ecosystem, group, updateType, dependencyNames })`
→ `{ action: "merge" | "manual", reason: string }`. Rules, in order:

1. `updateType === "version-update:semver-major"` → manual.
2. `group === "dev-deps"` → merge (existing behavior, unchanged).
3. `group === "official-actions"` **and** every name matches
   `^(actions|github)\//` → merge.
4. `group === "types"` **and** every name starts `@types/` → merge.
5. Otherwise manual, with a reason that says "production dependency" only
   when `ecosystem` is npm — a non-npm update is described as what it is
   (e.g. "third-party GitHub Action").

Fail-closed throughout: missing/unknown group, empty `dependencyNames`, or
a name failing its group's prefix check → manual. CLI entry (same shape as
`merge-queue-eligibility.mjs`'s `main()`): a `decide` subcommand taking
`--ecosystem/--group/--update-type/--dependency-names` and printing the
decision JSON; exit 0 for merge, a distinct non-zero-free design is NOT used
— the workflow branches on the printed `action`, never on exit code, so a
policy "manual" is not a red step.

## 3. `.github/workflows/dependabot-auto-merge.yml`

Keeps `on: pull_request_target`, `permissions` as-is, and
`if: github.actor == 'dependabot[bot]'`. Step changes:

1. `actions/checkout` (pinned by SHA, default base ref — never the PR head).
2. `dependabot/fetch-metadata` (existing pin) — unchanged.
3. `Decide` step: `set -o pipefail` (gotchas § CI), run
   `node scripts/dependabot-auto-merge-policy.mjs decide …` with the
   metadata outputs passed via `env:` (never inline `${{ }}` interpolation
   into the script — command-injection hygiene on `pull_request_target`),
   publish `action`/`reason` to `$GITHUB_OUTPUT`.
4. Merge step (`if: steps.decide.outputs.action == 'merge'`):
   `gh pr merge --auto --squash "$PR_URL"` — unchanged command.
5. Comment step (`if: steps.decide.outputs.action == 'manual'`): posts the
   policy's `reason` instead of the fixed "production dependency" sentence.

## Decisions (one-line records; no ADR per frontmatter)

- Policy as pure module + CLI, workflow branches on its output — mirrors
  `merge-queue-eligibility.mjs` / `auto-merge.yml`.
- Name-prefix double-check inside the policy, so dependabot.yml grouping and
  the merge rule cannot drift apart silently.
- Comment wording comes from the policy's `reason`, eliminating the wording
  bug class instead of patching the string in YAML.

## Risks / verification hooks

- `pull_request_target` + write perms: the diff must show no `ref:` on
  checkout and no execution of PR-controlled content; reviewer is the
  `dependency-update-reviewer` subagent.
- `pnpm repo-audit` workflow guards must stay green; the policy test file
  runs under `scripts/vitest.config.mjs` like its siblings.
- Measurement (R5): replay the 30 measured PRs' (group, update-type) against
  `decideDependabotMerge` at Implement time and record the count in the PR.
