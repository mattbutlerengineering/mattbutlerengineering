---
stage: review
run: feature:ship-pr
date: 2026-10-16
assumptions:
  - "No live user: every severity and every fix-or-defer decision here is the Review subagent's, logged under the autorun brief's 'Resume 2026-10-16' scope."
  - "Nothing is fixed in this stage. The change is already merged (#6667, #6675, #6794), and the run's standing instruction is that findings become deferrals and follow-ups. Major 1 is recorded as deferred on that instruction only. The review skill says a major is fixed or explicitly deferred by the user, so the Owner still has to accept or reverse that deferral."
  - "Diff scope is the skill as it stands on origin/main (dd0560081): .claude/skills/ship-pr/SKILL.md and its CLAUDE.md row from #6667, the #6675 squash, and #6794's changes to the skill, to .claude/implement-queue.md and to packages/agent-core/src/pr-risk-classifier.ts. The worktree HEAD (19999f204) differs from origin/main by one metrics file, so every check run here holds for main."
  - "There is no docs/standards.json, so no standards statement is cited and no enforced-statement trigger applies."
  - "No specialist or reviewer subagent was dispatched. The run diff is markdown plus one pure TypeScript predicate that #6794's own review gate already covered."
---

# Review: /ship-pr

## Scope

This review covers the skill as merged on `main`, read against `prd.md`'s
success criteria and against the queue profile and scripts it delegates to.

- `96fa53fbb` (#6667) added `.claude/skills/ship-pr/SKILL.md`, the
  `CLAUDE.md:94` row, and the run artifacts.
- `cd36c1ba7` (#6675) added the gate-path hold before the fast path, the
  explicit `gh pr view` command, the `held for human merge` output, and
  `verification.md`.
- `571dd99ec` (#6794, closes #6769) made `qualifiesForLowRiskFastPath` reject
  gate paths (`packages/agent-core/src/pr-risk-classifier.ts:135-160`), added
  `GATE_PATHS` and `matchesGatePath` exports (`packages/agent-core/src/index.ts:329-333`),
  and replaced the restated gate-path list in the skill and in
  `.claude/implement-queue.md` with a pointer to `GATE_PATHS`.

Each step of the skill was checked against the code it delegates to:

- `scripts/agent-core-build-freshness.mjs`: `check` is the only subcommand,
  and it exits 0 or 1 on `trusted` (`:213-220`). This matches step 2.
- `scripts/ci-gate-status.mjs`: `check --pr <N>` prints one JSON object with
  `state` set to one of `green`, `failed`, `pending`, `gate-missing`,
  `gate-unattributed` or `unknown` (`:199`, `:309-330`). The CLI always exits
  0, so the agent decides from `state` and not from the exit code. That matches
  step 3, which reads `state`.
- `.claude/implement-queue.md`: § ci-status (`:112-138`), § fast-path
  (`:140-166`), § reviewers (`:168-228`) and § merge-command with its "No tier
  hold" subsection (`:230-262`).
- The plugin's implement-queue skill (`idea-to-prod/0.19.0/skills/implement-queue/SKILL.md`)
  defines the hold and consent rules: `hold_labels` at `:35`, step 2 at
  `:137-138`, and the merge-policy exclusions at `:165-172`.
- `docs/agents/reviewer-contract.md` and `.claude/agents/reviewer.md` define
  the `ReviewInput` and the read-only contract that § reviewers hands to the
  reviewer.

Read-only checks run against this tree:

| Check                                          | Result                                         |
| ---------------------------------------------- | ---------------------------------------------- |
| `node scripts/check-skill-references.mjs`      | PASS (both checks)                             |
| `node scripts/check-claude-md-table-drift.mjs` | PASS: CLAUDE.md tables match the repo tree     |
| `node scripts/detect-instruction-rot.mjs`      | No instruction rot detected                    |
| `adr_status.py .`                              | 28 ADRs, all `unrecognized` (repo status word) |

PRD success criteria against the merged skill:

| Criterion                                                     | Status                                                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| References existing scripts by path, no new gate logic        | Met. SKILL.md:41, :56, :73 name them, and no script or classifier was added by #6667 or #6675                                       |
| Draft refused without `--ready`, `gh pr ready` first with it  | Met (SKILL.md:24-26, :33-36). `ci.yml` runs on drafts, since `pull_request` has no draft filter, so readying cannot strand CI       |
| Only `green` proceeds, `gate-missing` dispatches and re-polls | Met by reference to § ci-status (SKILL.md:50-61)                                                                                    |
| FLAG or non-green never arms auto-merge                       | Met for FLAG and CI. Major 1 covers a different hold that the skill drops                                                           |
| PASS arms `--auto`, or merges directly on `CLEAN`             | Met (SKILL.md:79-90)                                                                                                                |
| One-screen summary                                            | Met (SKILL.md:95-105)                                                                                                               |
| Drift checks pass                                             | Met, re-run above                                                                                                                   |
| Dry walk-through recorded in the PR                           | Met with a substitution. The walk-through ran on #6674 because #6591 was mid-merge, and it is recorded in #6675's body. See Minor 5 |
| Lint, typecheck and test on affected packages                 | N/A for #6667 and #6675, which changed markdown only. #6794's package change went through its own CI                                |

## Findings

### Major 1: `/ship-pr` reviews and merges a PR that carries the `needs-review` hold label

- Scenario: PR #N carries `needs-review` (for example, a human hold after a
  reviewer flag) and has green CI. A pipeline session runs `/ship-pr N`.
  1. Step 4 (`SKILL.md:63-69`) mentions `needs-review` only as something to
     check before the fast path, so the label just turns off the fast path.
  2. The reviewer then passes.
  3. Step 5 (`SKILL.md:79-90`) names only the gate path as a hold, so the
     agent runs `gh pr merge N --auto --squash --delete-branch`.
  4. If GitHub reports `CLEAN` and refuses `--auto`, the agent merges directly
     instead, and nothing gets a chance to step in.

  This breaks the hold contract the skill says it reuses:
  - The profile frontmatter sets `hold_labels: [needs-review]`
    (`.claude/implement-queue.md:5`). `:16` says a PR merges only with "no
    `needs-review` label". `:262` lists the label under "What still holds a
    PR".
  - The plugin skill is stricter. A hold label "ends the gate here: no review,
    no merge" (`implement-queue/SKILL.md:137-138`), and the label is never
    covered by merge consent (`:171`).
  - `CLAUDE.md`'s label table defines `needs-review` as "a human must look at
    this PR".

  The hold is still reachable by reference, because `:262` sits inside the
  § merge-command section that step 5 points to. But the skill's own steps
  state a narrower hold, and that is the text an agent acts on. This is not
  critical: it has never been observed, it needs a reviewer pass as well, and
  the referenced section does carry the rule. It is not minor either, because
  when it fires it bypasses an explicit human hold, and on a `CLEAN` PR there
  is no window for `merge-queue.yml`'s `--disable-auto` to catch it.

- Standard: none (no standards index).
- Decision: deferred under the run's no-fix standing instruction, pending the
  Owner's acceptance. Follow-up: in step 1, stop on a `hold_labels` label with
  `held — needs-review`, as the plugin's step 2 does. Do it in a separate PR
  and re-run the drift checks.

### Minor 1: Step 4 hands the agent queue-only steps that a `/ship-pr` invocation cannot carry out

- Scenario: step 4 tells the agent to follow § reviewers and, on a flag, "that
  section's retry/hold policy" (`SKILL.md:69-77`). Three parts of that
  section assume a queue worker, and a hand-opened PR has none of them:
  - `ReviewInput` needs `verificationOutput`, `taskDescription` and
    `acceptanceCriteria` "extracted from the issue body"
    (`docs/agents/reviewer-contract.md:22-24`). A PR with no linked issue has
    no acceptance criteria, so the reviewer's criteria-gap check
    (`reviewer-contract.md:13`) passes because there is nothing to compare
    against.
  - The reviewer is told to read code on disk only from
    `.claude/worktrees/agent-<taskId>/` (`.claude/agents/reviewer.md:79`).
    No such worktree exists for a `/ship-pr` run.
  - The retry policy dispatches a new worker with `--no-pr` and labels the
    linked issue (`.claude/implement-queue.md:242`). There is no worker, and
    there may be no issue. Step 4 also says "stop", which contradicts
    "retry".

  Each invocation improvises these parts, so two runs on the same PR can
  review it to different standards. That undercuts the PRD's "same gates as a
  queue PR".

- Standard: none.
- Decision: deferred. The review still gates, and a flag still stops. As a
  follow-up, add a short mapping to the skill:
  - AC come from the PR body and its `Closes #N` issue, and are empty only
    when both lack them.
  - The reviewer works from a throwaway worktree of the PR head.
  - A flag stops with no retry.

### Minor 2: The classifier and gate-path steps give the agent no way to call the functions

- Scenario: steps 4 and 5 rely on `reviewersForDiff`,
  `qualifiesForLowRiskFastPath` and the `GATE_PATHS` match. These are
  TypeScript exports of `@mbe/agent-core` (`packages/agent-core/src/index.ts:329-333`)
  with no CLI. No script under `scripts/` calls them except the freshness
  check's comments. The skill and the profile both name the functions but
  never show how to call them. Verification's walk-through called them by
  hand. Every run has to work out its own import of
  `packages/agent-core/dist/index.js` from the right directory, and a failed
  import is exactly the "unreadable classifier" case the plugin says must fail
  closed (`implement-queue/SKILL.md:141-142`). The skill never tells the agent
  to fail closed here. The skill also names `GATE_PATHS` where the predicate
  is the exported `matchesGatePath`.
- Standard: none.
- Decision: deferred. This is a gap the skill shares with the profile, not a
  regression from this run. Follow-up: one `node --input-type=module -e`
  invocation (or a small CLI in the freshness script's style) recorded once in
  the profile's § fast-path, with the skill pointing to it.

### Minor 3: Step 2 wrongly says `classifyCiGateStatus` depends on the agent-core dist

- Scenario: `SKILL.md:44-45` says the freshness check covers "the dist both
  `classifyCiGateStatus` support code and `reviewersForDiff` depend on". But
  `scripts/ci-gate-status.mjs:84-85` imports only `node:child_process` and
  `node:url`, so CI classification never touches the dist. Nothing currently
  goes wrong, because exit 1 only changes reviewer handling. The risk is that
  a reader extends "untrusted dist" to CI classification and abstains on a
  real `green`.
- Standard: none.
- Decision: deferred (wording). Fix it alongside Major 1's follow-up.

### Minor 4: Step 4 repeats in prose what the predicate and the profile already enforce

- Cut-list entry: `.claude/skills/ship-pr/SKILL.md:63-69` (reuse). Step 4
  checks gate paths and `needs-review` before consulting the fast path.
  - Since #6794, `qualifiesForLowRiskFastPath` returns `false` for any gate
    path (`pr-risk-classifier.ts:136`).
  - § fast-path already sends `needs-review` to review
    (`.claude/implement-queue.md:142-148`).

  The prose therefore decides nothing that the referenced code and section
  don't already decide, for every input. Replacing it with a pointer keeps
  the skill to its own rule against restating
  (`SKILL.md:12-15`). This cut is separate from Major 1. Major 1 adds a
  real hold stop, while this cut removes a duplicate fast-path pre-check.

- Standard: none.
- Decision: deferred. Fold it into Major 1's follow-up so the two edits land
  together.

### Minor 5: The green → review → merge half of the skill has never run

- Scenario: the only exercise of the skill stopped at step 3 with `pending`
  (`verification.md`, WO-0019 step 3). Steps 4 and 5 were checked by calling
  the functions directly, with no reviewer dispatched and no merge command
  run. There has been no real invocation since. `git log origin/main
--grep=ship-pr` shows only the three commits that built the skill, and no
  routine or skill references it. So the reviewer dispatch, the CLEAN-direct
  merge and the `[Merge Without Review]` stop have never run. This is the
  "shipped ≠ run" class recorded in memory. It is not a defect in the text,
  but nothing has demonstrated that those steps work.
- Standard: none.
- Decision: deferred to Ship and Operate. The first real `/ship-pr` on a green
  PR should be recorded as the end-to-end evidence.

### Minor 6 (profile, out of this run's scope): § ci-status calls the `gate-unattributed` fix unimplemented

- Scenario: `.claude/implement-queue.md:134` says `gate-unattributed` "needs a
  human, or the separate (not-yet-implemented) fix of `ci.yml` publishing a
  commit _status_". But `.claude/rules/gotchas.md` § CI records that fix as
  landed (#4025) and confirmed live on 2026-08-24. The skill follows
  § ci-status verbatim (`SKILL.md:50-52`), so it inherits the stale sentence.
  Behaviour is still safe because the state still stops. The text is just
  wrong about why.
- Standard: none.
- Decision: deferred. The brief puts profile edits out of scope. Route it as a
  profile fix, either through `/claude-md-improver` or a `docs/backlog.md`
  seed.

## Passes with no findings

- **Security:** clean. The skill handles no secrets or input parsing. It
  passes the PR number to `gh` unchanged, and the classifier is a pure
  function.
- **Design:** clean apart from the findings above. The skill matches
  `architecture.md`, which describes a protocol document that references the
  profile, a `--ready` opt-in, and no ADR. No decision in the diff meets the
  ADR bar, because the skill is reversible by deleting one file and one row.
  #6794's predicate change does not edit any ADR Decision section.
- **ADR compliance:** clean. `adr_status.py` reports 28 ADRs, all
  `unrecognized`. Their status lines read `active`, so they are treated as
  live. The diff reaches ADR-016 (green-main gating, single `CI Gate`, no
  merge through red). It complies: only `green` proceeds, and a direct merge
  happens only when GitHub reports `CLEAN`. ADR-023 and ADR-027 (batch
  composition) and ADR-005 (worktree isolation) were read and are not
  reached, because the skill composes no batch and spawns no worker. ADRs
  001-004, 006-015, 017-022 and 024-028 cover subjects the diff never reaches.
- **Domain passes:** none selected. No changed path matches payments,
  migrations or dependencies.

## Verdict

Ready for Ship to record the release. Nothing new is released, and nothing
blocks it: there is no critical finding and no enforced standard.

One major (Major 1, the `needs-review` hold) is deferred under the run's
no-fix instruction. Because the review skill says a major is fixed or
explicitly deferred by the user, the Owner should confirm that deferral. Until
the follow-up lands, a pipeline session should not run `/ship-pr` on a PR
carrying `needs-review`. Minors 1-6 are deferred with reasons above, and
Minors 1, 3 and 4 can land in the same follow-up PR as Major 1.
