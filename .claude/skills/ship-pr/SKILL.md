---
name: ship-pr
description: "Run the full merge boundary on one open PR — build-freshness, CI-gate classification, diff-matched specialist review plus the universal reviewer, then merge. Reuses the implement-queue profile's own hooks (ci-status, fast-path, reviewers, merge-command) end to end for a single PR outside the queue loop. Invoke with /ship-pr <N> [--ready]."
user-invocable: true
---

# /ship-pr

A single-PR run of the same merge boundary `/idea-to-prod:implement-queue`
runs per-PR in its own loop. This skill owns no gate logic of its own — every
step below is a pointer into `.claude/implement-queue.md`'s profile and the
scripts it names. If a step's rule ever needs to change, change it there;
this file must never grow a restated copy of a rule it only references (the
duplicated-sentence drift recorded in `.claude/rules/gotchas.md` is exactly
this failure mode).

## Invocation

```
/ship-pr <N> [--ready]
```

- `<N>` — an open PR number.
- `--ready` — the PR is a draft; without this flag a draft PR is refused
  outright (an explicit author hold, not something this skill flips on its
  own). With it, run `gh pr ready <N>` first, then continue.

## Protocol

Stop at the first step that doesn't clear — never fall through to the merge
step on anything but a clean pass.

1. **Precondition.** Confirm the PR is open and read its draft state:
   `gh pr view <N> --json state,isDraft,labels,headRefOid`. If it's a draft and `--ready`
   was not passed, stop and report "draft PR — pass `--ready` to proceed."
   If `--ready` was passed, run `gh pr ready <N>`.

2. **Build freshness.**

   ```bash
   node scripts/agent-core-build-freshness.mjs check
   ```

   Exit 0 → the dist both `classifyCiGateStatus` support code and
   `reviewersForDiff` depend on is proven fresh (or was rebuilt). Exit 1 →
   do not trust `reviewersForDiff` for this run; fall straight through to
   the full specialist set in step 4 as if every specialist applies — see
   `.claude/implement-queue.md` § fast-path for the exact fail-closed rule.

3. **CI-gate classification.** Follow `.claude/implement-queue.md` §
   ci-status verbatim, including its `gate-missing` dispatch-and-re-poll
   recovery and its explicit abstain on `gate-unattributed`/`unknown`:

   ```bash
   gh pr checks <N> --watch
   node scripts/ci-gate-status.mjs check --pr <N>
   ```

   Only `state: "green"` proceeds to step 4. Every other state stops here,
   named, per that section's table — do not re-derive the handling for
   `failed`/`pending`/`gate-missing`/`gate-unattributed`/`unknown` here.

4. **Review.** First read the changed files (`gh pr diff <N> --name-only`)
   and the labels from step 1. `qualifiesForLowRiskFastPath` returns `true`
   for a docs-only diff that touches `**/prd.md` or `**/architecture.md`,
   yet the profile holds those for a human merge (ADR-0087) — so a gate-path
   match or a `needs-review` label is checked **before** the fast path is
   consulted, not after (found in the #6639 dry walk-through on #6674). A
   gate-path PR still gets the review below, then step 5 holds it. Follow `.claude/implement-queue.md` § reviewers (and the
   `fast-path` hook's `qualifiesForLowRiskFastPath` short-circuit, which
   composes `isLowRiskPR` with `reviewersForDiff` and already decides when
   review can be skipped — don't re-decide it here): dispatch the
   diff-matched specialists `reviewersForDiff(changedFiles)` names, plus
   the universal `reviewer` subagent unless the fast path applies. A
   `block`/`flag` verdict from either is terminal for this invocation — stop
   and report it per that section's retry/hold policy, do not proceed to
   step 5.

5. **Merge.** On an all-pass verdict (or a fast-path skip), follow
   `.claude/implement-queue.md` § merge-command:

   ```bash
   gh pr merge <N> --auto --squash --delete-branch
   ```

   A changed file matching a gate path (`GATE_PATHS` in `@mbe/agent-core`) holds the PR for a human merge instead
   — do not run the merge command; report `held for human merge — gate
path` (per that section, not re-derived here). If GitHub reports the PR
   `CLEAN` and refuses `--auto`, merge directly with the same command minus
   `--auto`. If the merge call itself is denied with
   `[Merge Without Review]` (Claude Code Remote sessions, gotchas § CCR
   #6125), do not retry through this or any other tool — report the PR as
   reviewed, green, and awaiting a human merge.

## Output

One summary screen at the end of the run (success or stop):

```
PR #<N>
  CI:       <classifyCiGateStatus state>
  Reviewers: <specialist list + verdicts, or "fast path — skipped">
  Universal: <reviewer verdict, or "fast path — skipped">
  Action:   <armed --auto | merged directly | held for human merge | stopped at <step> — <reason>>
```

## Scope

This skill adds no new gate logic, scripts, or classifiers — every rule it
points at already exists and is already exercised by
`/idea-to-prod:implement-queue`'s per-PR loop. It exists only to make that
same boundary callable against one PR number on demand, outside the queue.
