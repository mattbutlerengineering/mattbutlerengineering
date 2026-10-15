---
stage: verify
run: feature:ship-pr
date: 2026-10-14
---

# Verification: /ship-pr

## WO-0018 — repo gates

The change set is markdown only (`.claude/skills/ship-pr/SKILL.md`, this file,
`breakdown.md`), so no workspace package is affected.

| Gate                                               | Result                                                       |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `node scripts/check-claude-md-table-drift.mjs`     | PASS: CLAUDE.md tables match the repo tree                   |
| `node scripts/check-skill-references.mjs`          | PASS: every /slash-command resolves                          |
| `node scripts/detect-instruction-rot.mjs`          | No instruction rot detected                                  |
| `pnpm exec prettier --check` on every changed file | PASS                                                         |
| `pnpm lint` / `typecheck` / `test` (affected pkgs) | N/A: no package source changed                               |
| `pnpm --dir scripts test` (extra)                  | Ran; ~20 unrelated suites fail to load in this bare worktree |

The `scripts` suite failures (cors-audit, revert-rca, persist-metrics, ...)
are load failures in files this diff does not touch; they are not caused by it.

## WO-0019 — read-only dry walk-through

Target: PR #6674 (the originally named #6591 is mid-merge elsewhere).
Nothing was merged, armed, labelled, commented, or pushed on it.

| Step | Skill action                            | Reported                                                                                                 |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1    | `gh pr view 6674` precondition          | OPEN, not draft, label `tier:standard`, head `5fbc0527`                                                  |
| 2    | `agent-core-build-freshness.mjs check`  | exit 0, dist was missing so it rebuilt: `{"trusted":true,"state":"fresh","rebuildSucceeded":true}`       |
| 3    | `ci-gate-status.mjs check --pr 6674`    | `{"state":"pending","reason":"CI is running but CI Gate has not reported yet"}` -> skill would stop here |
| 4    | `reviewersForDiff` over 5 changed files | `[]`; `isLowRiskPR` true; `qualifiesForLowRiskFastPath` **true**                                         |
| 5    | merge                                   | Would NOT merge: two files match gate paths (`**/prd.md`, `**/architecture.md`) -> held for human merge  |

(Step 3 used `check` without `gh pr checks --watch`, which blocks until CI ends.
Steps 4-5 were run anyway against the real functions to exercise the rest.)

### Skill defect found and fixed

`qualifiesForLowRiskFastPath` returned `true` for #6674 even though the profile
(`.claude/implement-queue.md` § fast-path) makes a gate-path match, and the
`needs-review` label, preconditions of the fast path. SKILL.md step 4 delegated
to the predicate without checking either, and the gate-path hold lived only in
step 5 with no output state. A literal run would have skipped review and then
relied on the reader noticing step 5's hold. Fixes in SKILL.md: step 1 now reads
the draft state and labels with an explicit command; step 4 checks gate paths and
`needs-review` before consulting the fast path; step 5 says to not run the merge
command on a gate-path PR; the summary gains a `held for human merge` action.
No new gate logic was added; it points at the profile's existing rule.
