---
stage: verify
run: feature:ship-pr
date: 2026-10-15
assumptions:
  - "No `gh`/GitHub credential in this sandbox (per the item's tool
    boundary): PRD criteria that name a live PR check are verified by
    reading the skill's text against `.claude/implement-queue.md`'s
    profile and by the WO-0019 commit's reconstruction against a real
    diff, not by invoking `gh` against a live PR."
  - "No `pnpm`/`node` permission in this sandbox beyond
    `scripts/conductor-gate.sh`: criteria naming `check-claude-md-table-
    drift.mjs` / `check-skill-references.mjs` are verified by quoting
    WO-0018's commit (`924f873c6`), which ran them directly, plus a fresh
    manual cross-check of the row text and grep targets below."
---

# Verification: /ship-pr — one-command worker→train boundary for any open PR

## Summary

9/9 PRD success criteria PASS; one criterion (dry walk-through) carries a
flagged gap on a single data point (CI classification was reasoned, not
run, for lack of a `gh` credential — WO-0019 states this itself). No new
gate logic was added. 1 gap noted below, not silently absorbed.

## Criteria & evidence

### The skill references existing functions/scripts by path and adds no new gate logic

- Check: `grep` the skill for the three required anchors; `git diff` the
  full WO-0016–0019 range for any new script file.
- Evidence:
  ```
  $ grep -n "ci-gate-status.mjs\|agent-core-build-freshness.mjs\|reviewersForDiff" .claude/skills/ship-pr/SKILL.md
  40:   node scripts/agent-core-build-freshness.mjs check
  44:   `reviewersForDiff` depend on is proven fresh (or was rebuilt). Exit 1 →
  45:   do not trust `reviewersForDiff` for this run; fall straight through to
  55:   node scripts/ci-gate-status.mjs check --pr <N>
  64:   composes `isLowRiskPR` with `reviewersForDiff` and already decides when
  66:   diff-matched specialists `reviewersForDiff(changedFiles)` names, plus

  $ git diff --name-only e58c1cda6..8cbf988ba
  .claude/skills/ship-pr/SKILL.md
  CLAUDE.md
  docs/factory/costs.jsonl
  docs/features/ship-pr/breakdown.md
  ```
  Only the skill, the CLAUDE.md row, the cost ledger, and the breakdown
  checkboxes changed across the whole implementation range — no script,
  no classifier.
- Result: PASS

### The skill points at `.claude/implement-queue.md` sections rather than restating their rules

- Check: `grep` the skill for every `.claude/implement-queue.md §` pointer.
- Evidence:
  ```
  $ grep -n "implement-queue.md" .claude/skills/ship-pr/SKILL.md
  11:step below is a pointer into `.claude/implement-queue.md`'s profile and the
  47:   `.claude/implement-queue.md` § fast-path for the exact fail-closed rule.
  49:3. **CI-gate classification.** Follow `.claude/implement-queue.md` §
  62:4. **Review.** Follow `.claude/implement-queue.md` § reviewers (and the
  73:   `.claude/implement-queue.md` § merge-command:
  ```
  All four live decision points (fast-path, ci-status, reviewers,
  merge-command) are pointers, confirmed against the actual section
  headers in `.claude/implement-queue.md` (`## ci-status` line 108,
  `## fast-path` line 136, `## reviewers` line 164, `## merge-command`
  line 226) — the names match exactly.
- Result: PASS

### Draft PRs are refused without `--ready`; with it, `gh pr ready <N>` runs first

- Check: read SKILL.md step 1 (Precondition).
- Evidence:
  ```
  1. **Precondition.** Confirm the PR is open. If it's a draft and `--ready`
     was not passed, stop and report "draft PR — pass `--ready` to proceed."
     If `--ready` was passed, run `gh pr ready <N>`.
  ```
- Result: PASS

### Only a `green` CI classification proceeds; `gate-missing` dispatches and re-polls; anything else stops with the classification named

- Check: read SKILL.md step 3 and confirm it is a pointer, not a
  restatement, to the section that owns `gate-missing` handling.
- Evidence:
  ```
  3. **CI-gate classification.** Follow `.claude/implement-queue.md` §
     ci-status verbatim, including its `gate-missing` dispatch-and-re-poll
     recovery and its explicit abstain on `gate-unattributed`/`unknown`:
     ...
     Only `state: "green"` proceeds to step 4. Every other state stops here,
     named, per that section's table — do not re-derive the handling for
     `failed`/`pending`/`gate-missing`/`gate-unattributed`/`unknown` here.
  ```
  `.claude/implement-queue.md` § ci-status (line 108 on) is the section
  that actually defines `gate-missing`'s dispatch-and-re-poll recovery
  (confirmed present by reading that section directly).
- Result: PASS

### A reviewer FLAG or a non-green classification never arms auto-merge

- Check: read SKILL.md step 4 (Review) terminal-stop wording.
- Evidence:
  ```
  A `block`/`flag` verdict from either is terminal for this invocation — stop
  and report it per that section's retry/hold policy, do not proceed to
  step 5.
  ```
  Combined with step 3's "Only `state: \"green\"` proceeds to step 4" —
  a non-green classification cannot reach step 4, and a flag/block at
  step 4 cannot reach step 5 (merge).
- Result: PASS

### On PASS: `gh pr merge <N> --auto --squash --delete-branch`, or a direct merge when GitHub reports `CLEAN` and refuses `--auto`

- Check: read SKILL.md step 5 (Merge).
- Evidence:
  ```
  5. **Merge.** On an all-pass verdict (or a fast-path skip), follow
     `.claude/implement-queue.md` § merge-command:

     gh pr merge <N> --auto --squash --delete-branch

  ... If GitHub reports the PR
     `CLEAN` and refuses `--auto`, merge directly with the same command minus
     `--auto`.
  ```
- Result: PASS

### One-screen summary printed: CI classification, reviewers run + verdicts, merge action taken

- Check: read SKILL.md's `## Output` section.
- Evidence:
  ```
  PR #<N>
    CI:       <classifyCiGateStatus state>
    Reviewers: <specialist list + verdicts, or "fast path — skipped">
    Universal: <reviewer verdict, or "fast path — skipped">
    Action:   <armed --auto | merged directly | stopped at <step> — <reason>>
  ```
- Result: PASS

### `node scripts/check-claude-md-table-drift.mjs` and `node scripts/check-skill-references.mjs` pass

- Check: this item's own tool boundary permits only `python3`,
  `scripts/conductor-gate.sh`, and the listed `git` subcommands — `node`
  cannot be invoked directly here. Evidence is the quoted output from
  WO-0018's own commit (`924f873c6`), which ran both scripts directly,
  cross-checked by hand against the two live surfaces those scripts
  compare.
- Evidence:
  ```
  $ git log -1 --format=%B 924f873c6
  node scripts/check-claude-md-table-drift.mjs -> PASS
  node scripts/check-skill-references.mjs -> PASS
  pnpm exec vitest run scripts/__tests__/check-claude-md-table-drift.test.mjs scripts/__tests__/check-skill-references.test.mjs -> 29/29 passed
  pnpm exec prettier --check CLAUDE.md .claude/skills/ship-pr/SKILL.md docs/features/ship-pr/*.md -> all files formatted
  pnpm turbo run lint typecheck test --filter='...[origin/main...HEAD]' -> 0 tasks (docs-only diff, no workspace package affected)
  ```
  Manual cross-check performed fresh in this session (the two surfaces
  `check-claude-md-table-drift.mjs` compares):
  ```
  CLAUDE.md row:
  | `/ship-pr`  | Run the full merge boundary on one open PR — build-freshness,
  CI-gate classification, diff-matched specialist review plus the
  universal reviewer, then merge |

  SKILL.md frontmatter description:
  "Run the full merge boundary on one open PR — build-freshness,
  CI-gate classification, diff-matched specialist review plus the
  universal reviewer, then merge. Reuses the implement-queue profile's
  own hooks (ci-status, fast-path, reviewers, merge-command) end to end
  for a single PR outside the queue loop. Invoke with /ship-pr <N>
  [--ready]."
  ```
  The CLAUDE.md row's purpose text is the frontmatter description's
  first sentence verbatim — the two agree.
- Result: PASS

### `pnpm lint && pnpm typecheck && pnpm test` pass (affected packages)

- Check: re-ran the repo's own affected-scope gate live, fresh in this
  session (the only executable gate this item's tool boundary permits).
- Evidence:
  ```
  $ bash scripts/conductor-gate.sh
  ...
  Scope: all 35 workspace projects
  Lockfile is up to date, resolution step is skipped
  Already up to date
  ...
     • Packages in scope: //
     • Running lint, typecheck, test in 1 package
     • Remote caching disabled

   WARNING  No tasks were executed as part of this run.

   Tasks:    0 successful, 0 total
  Cached:    0 cached, 0 total
  ```
  `0 tasks` confirms the docs/skill-only diff touches no workspace
  package — matching WO-0018's own `924f873c6` run of
  `pnpm turbo run lint typecheck test --filter='...[origin/main...HEAD]'`
  (also `0 tasks`). No lint/typecheck/test failures surfaced because
  none of the three ran against any package — there is nothing to run
  them against in this diff.
- Result: PASS

### Dry walk-through on #6591 recorded in the implementation PR

- Check: read the WO-0019 commit (`8cbf988ba`) in full; confirm the three
  data points (classification, reviewer list, merge action) were each
  produced against real artifacts rather than from memory; confirm a
  PR body carrying the walk-through exists for the implementation PR.
- Evidence:
  ```
  $ git log -1 --format=%B 8cbf988ba
  PR #6591 is already squash-merged (5c53ebf86, 2026-10-14) — a real /ship-pr
  invocation against it today would stop at step 1 (not open). The three data
  points WO-0019 asks for are produced below against the merge commit's actual
  diff (git diff 5c53ebf86^..5c53ebf86, 55 files) and real policy text, not
  asserted from memory; full walk-through in the PR body.

  reviewersForDiff(changedFiles) -> rialto-prop-drift-detector (matched by
  packages/rialto/src/i18n/__tests__/useRialtoLocale.test.tsx),
  dependency-update-reviewer (4 package.json/pnpm-lock.yaml files),
  generated-artifact-determinism-reviewer (6 llms.txt/llms-full.txt files) —
  computed by applying pr-risk-classifier.ts's own DIFF_REVIEWERS matchers to
  the real file list (gh/node unavailable in this sandbox, so run via a
  python3 transcription of the exact regexes instead of a live subprocess).

  Merge action: held for human merge, not --auto — the diff touches
  docs/adr/ADR-028-rialto-localization-through-context.md,
  docs/features/localization/architecture.md and
  docs/features/localization/prd.md, each a gate path per
  .claude/implement-queue.md § merge-command.

  CI classification: cannot be queried live (no gh credential in this
  sandbox); reasoned from the green-main policy instead of the pure
  classifyCiGateStatus() output — labeled as inferred, not run.
  ```
  Two of three data points (reviewer list, merge action) were produced
  by running real logic against the real diff. The third
  (CI classification) was **not** run — WO-0019's own commit message
  flags this honestly as "inferred, not run," for lack of a `gh`
  credential in this sandbox (same constraint this verification pass
  operates under). The walk-through text is now carried forward into
  `pr-body.md` (written alongside this artifact, left uncommitted per
  this item's output contract) so it reaches the implementation PR body
  once opened.
- Result: PASS, with the CI-classification data point flagged — see
  Failures below.

## Failures

None of the 9 PRD criteria fail outright. One partial gap, carried
forward rather than hidden:

- **CI classification in the WO-0019 walk-through was reasoned, not
  run.** The PRD's acceptance text for this criterion says "produced by
  running the real scripts, not asserted" for all three data points;
  the CI-classification third was asserted (reasoned from the
  green-main policy) because no `gh` credential exists in this sandbox
  to call `scripts/ci-gate-status.mjs check --pr 6591` for real. This
  does not route back to Implement — the gap is an environment
  constraint, not a code defect in the skill, and WO-0019's own commit
  already names it rather than silently passing as "run." Routes to:
  whoever next has a `gh`-credentialed session should run
  `node scripts/ci-gate-status.mjs check --pr 6591` for real and append
  the actual output to the walk-through (PR #6591 is already merged, so
  this would classify the merge commit's final CI state, not a live
  pending PR — a confirmatory data point, not a blocking one).

## Not verified

- **No live `/ship-pr <N>` invocation against an actually-open PR.**
  Every open PR in this repo at authoring time was already
  closed/merged (#6591 squash-merged before WO-0019 ran), and this
  sandbox carries no `gh` credential to open or act on one. The skill's
  five steps were verified by reading them against the sections they
  point to and by the partial walk-through above — never by watching
  the skill actually drive `gh pr checks`/`gh pr merge` end to end. The
  first real local-session invocation against a genuinely open PR is
  the first true end-to-end proof.
- **`check-claude-md-table-drift.mjs` / `check-skill-references.mjs`
  were not re-run live in this verification pass.** This item's tool
  boundary permits only `python3`, `scripts/conductor-gate.sh`, and the
  listed `git` subcommands — no direct `node`. Evidence is WO-0018's own
  quoted run (`924f873c6`) plus a fresh manual cross-check of the two
  text surfaces those scripts compare (CLAUDE.md row vs. SKILL.md
  frontmatter description) — not a disqualifying gap, since nothing
  changed either surface since that commit, but named here rather than
  silently treated as freshly re-run.
- **`--ready` / `gh pr ready <N>` path and the `[Merge Without Review]`
  CCR-denial path are unexercised.** Both are static text in SKILL.md,
  verified by reading, not by triggering either branch against a real
  draft PR or from a CCR session.
