---
stage: operate
run: feature:zone-batch-nonstrict-main
date: 2026-11-07
users-observed: 0
signal-source: "No analytics or usage counter exists for this tooling. Read on 2026-11-07: (1) `.claude/improvement-loop/log.md` (the daily mbe-evening / implement-queue run record), lines after 4300 (2026-10-25 onward), grepped for `selectZoneSpreadBatch`, `strictMain`, `zone-spread`, `claimed`, `batch of`, then read in full where a hit named a batch; (2) `docs/process-retro.md` (weekly process retro of 2026-11-01) lines 138-150 and 700-708; (3) `git log origin/main --since=2026-10-15` on `scripts/issue-zone.mjs`, `scripts/main-strictness.mjs`, both test files, ADR-023, ADR-027 and `.claude/implement-queue.md`; (4) `gh api search/issues` for the run's slug, `ADR-027`, `same-zone`, `hotspot`, `selectZoneSpreadBatch`, `main-strictness`; `gh pr list --state all --search 'issue-zone OR main-strictness OR ADR-027 OR same-zone OR zone-batch'`; `gh issue view 6640`; (5) `gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks` and `node scripts/main-strictness.mjs` run in the worktree; (6) `docs/backlog.md` grep for the run's topics (no hits). Sentry MCP not queried: the tooling is a local script with no deployed surface that reports to Sentry. No human statement about the change was found."
assumptions:
  - "Population count: users-observed counts people who ran the tool. The only invocations found are by the scheduled mbe-evening routine's agent (implement-queue compose hook), not by a person. The Owner approved the policy at the blueprint gate and decided WO-30 at Review, which is decision work, not use; no record shows him running `selectZoneSpreadBatch` or `main-strictness.mjs`. So 0. This differs from the dependabot-auto-merge retro, where a human's merge actions measurably changed; here nothing a human did is observed to have changed. The agent compose iterations below are the sample, not the population."
  - "Compose-iteration count: only an improvement-loop entry that says the iteration ran the selector counts. Entries that say 'claimed N issues' without naming the selector or `strictMain` are not counted. The log is a prose record written by the agent itself, so the count is a floor and the content is self-reported."
  - "Cause of `strictMain: true`: the log entries state the value but not why. The 2026-11-01 weekly retro shows the same token class getting `403 Resource not accessible by integration` on branch protection and the probe printing `{\"strictMain\":true}` as its fail-closed default. Whether the mbe-evening session's token gets the same 403 was not measured, so the link is a hypothesis."
  - "Live value: `strict` was read once here, 2026-11-07, with the Owner-account `gh` in this worktree. It is repo state, not code (gotchas § CI), and says nothing about what the routine's token sees."
  - "No tests, builds or lints were re-run. Test counts and gate results cite `verification.md` and `release.md` at `39204320e` and are not re-measured."
---

# Retro: same-zone batching when `main` is not strict (#6640 via #6678, #6661, WO-30 #7110)

## Population

**0 people observed.** The tool has one caller: the implement-queue compose
hook, run by the mbe-evening routine's agent. In the 10 days from 2026-10-26 to 2026-11-05, the improvement-loop log
records the selector running in 5 evening iterations (10-26, 10-28, 11-02,
11-04, 11-05). Four of those entries state the probe value, and all four are
`strictMain: true` (10-26, 10-28, 11-04, and 11-05, which says "main is
`strict`"). The 11-02 entry names the selector and a 3-issue batch without
stating the probe value. No entry shows a batch composed with `strictMain: false`, so
**no same-zone pair has been admitted by the new rule since it shipped**.
This is the sample. It is not a count of users.

State, not use, as of `origin/main` at `c4320513d`:

- The code is on `main`: #6678 (`d1047723e`, merged 2026-10-15T05:37:59Z),
  ADR-027 via #6661, and WO-30 via #7110 (squash `333a15e4a`, merged
  2026-10-19T02:37:44Z).
- No later change touched the selector's behaviour. The only commits on the
  touched paths since 2026-10-19 are #7824 (2026-10-27, `scripts/issue-zone.mjs`
  loses the `export` on `buildScopeZoneMap` and `DEFAULT_MAX_WORKERS`: 1 line)
  and #8466 (2026-11-07, edits `.claude/implement-queue.md`; its diff has no
  zone, strict or compose line). No revert: `git log --grep=revert` on the
  scripts and the PR search for a revert both returned nothing.
- `main`'s `strict` reads `false` today: `gh api …/required_status_checks` →
  `{"contexts":["CI Gate"],"strict":false}`, and `node scripts/main-strictness.mjs`
  → `{"strictMain":false}` (both 2026-11-07, Owner-account token).

## Outcomes vs. intent

### Success sentence (idea.md): with `strictMain: false`, three same-zone issues with disjoint scopes form one batch; with the default, every existing test's output is unchanged

- What happened: not observed in use. The code path exists on `main` and the
  probe reads `false` for the Owner's token today, so the relaxed rule is
  reachable from a checkout. In the 4 recorded iterations that state a probe
  value (10-26, 10-28, 11-04, 11-05) the routine got `strictMain: true`, so the relaxed rule ran 0 times
  there. The same-zone surplus it would have considered was deferred
  instead: #7376 behind #7709 (10-28), #8186 behind #8185 and #8199 behind
  #8198 (11-04), #8282 and #8281 behind #8280 (11-05, "deferred this batch
  by the zone-spread selector since main is `strict`"). Whether the relaxed
  rule would have admitted any of them was not computed (their path sets
  were not read), so the missed throughput is not measured.
- Signal strength: **unobserved** for the relaxed rule. **pattern** (4 of 4
  stated probe values, 10 days) that the routine runs in the default mode.

### SC-1 (default unchanged), SC-2 (three disjoint → one batch), SC-3 (overlap and pathless defer), SC-4 (fail closed), SC-5 (ADR-027 record), SC-6 (gates)

- What happened: `verification.md` records 6 PASS, 0 FAIL, re-verified at
  `39204320e` after WO-30 (5680 scripts tests; 87 in `issue-zone.test.mjs`).
  Not re-run here. SC-4's fail-closed behaviour is the one thing seen live:
  the 2026-11-01 weekly retro ran the probe, got a 403 and recorded that
  `{"strictMain":true}` was "its ADR-027 fail-closed default on exactly that
  error, not a measurement". SC-2 was never shown on a production batch
  (`verification.md` §Not verified: "NOT SHOWN").
- Signal strength: **measured** at Verify (cited, not re-measured); SC-4
  **anecdote** in operation (one weekly-retro session).

### Review Major (WO-30): overlapping issues must never count as disjoint

- What happened: fixed at the Owner's decision and merged in #7110. The E1,
  E2 and hotspot cases are tests on `main`. No issue or PR since 2026-10-19
  reports two same-zone issues stacked on one file; but the relaxed rule has
  not run, so absence of a report is not evidence the fix works in use.
- Signal strength: **unobserved** (state: fix and tests on `main`).

### Operate hand-offs from Review and Ship

- *Probe-source visibility.* The probe still prints `{"strictMain":true}` for
  both "strict" and "could not read". The evidence in this retro (the 403 in
  the weekly retro; four `true` readings in a row; the 11-05 entry asserting
  "main is strict" as fact while `main` is `false`) fits the Review suspicion
  that the routine is permanently fail-closed. It does not prove it: nobody has
  run the probe inside a routine session. Signal: **pattern** that `true`
  recurs, **unobserved** for the cause.
- *`llms*.txt`-only conflicts in same-zone batches.* 0 same-zone batches
  exist, so there is nothing to count. Signal: **unobserved**.
- *Dispatch-path coverage.* The log shows the selector in the implement-queue
  iteration only. Whether hand-dispatched sessions, `mbe-feature-drain` or
  `mbe-swarm` bypass it today was not re-measured. Signal: **unobserved**.
- *Operate's minimum (5 selector-composed same-zone batches).* Not met:
  0 of 5. Ship predicted this and the evidence agrees.

## Open debt

The run's own debt. It is never feedback and counts toward nothing above.

- **#6640** (CLOSED 2026-10-15T05:38:01Z, created 2026-10-14T22:36:41Z): the
  originating issue, created before the run's merge. Its closure is the
  Conductor's, not an Operate outcome.
- **#6637** (CLOSED): its tracking issue, same status.
- **No issue exists for any deferral.** The search found no issue created
  after 2026-10-14 that cites this run's `review.md` or `verification.md`, or
  names `selectZoneSpreadBatch` or `main-strictness` as its subject. `docs/backlog.md` has no line on them
  either. The five deferred Minors and the dispatch-path question therefore live
  only in `review.md` and `release.md`, and are seeded below:
  1. ADR-027 Decision contradicts the default mode (#6811's hotspot lock applies in strict mode too).
  2. Probe cannot tell "strict" from "could not read".
  3. Generated `llms*.txt` files invisible to the overlap check.
  4. Stale "main is strict" premise (`.claude/implement-queue.md:42`,
     `scripts/issue-zone.mjs:6-12` header, ADR-027 Consequences). Still
     present on `main` at `c4320513d`.
  5. Out-of-zone-only paths still stack.

## Run retrospective

- Keep: the pure selector plus a pure fail-closed classifier at the call
  site. It is why the default path was safe to ship before anything was
  measured, and the fail-closed branch is the one that ran. Keep Verify's
  decision to grade SC-2 as shown-in-test and NOT SHOWN in production: it
  matches what the log says three weeks later.
- Keep: Review reproducing each finding through the real module (E1, E2,
  hotspot) and the Owner fixing the Major in-run as WO-30. The fix has no
  follow-up commits.
- Change: the stage's feasibility question was "will the relaxed mode
  run?", and nobody asked it before shipping. Review raised the 403 suspicion
  as a Minor with a one-command check; Ship deferred it; the evening routine then ran four
  iterations in a row on `true` with no signal that it was the fallback. A
  probe whose failure and normal output are byte-identical makes the
  feature's whole benefit invisible. The visibility Minor should have been
  the Major.
- Change: five Minors and an Owner question were left in artifacts with no
  issue, so nothing re-surfaces them. Open an issue per deferral at Ship, or
  carry them in `pending-merge:`-style pointers.
- Change: #6811 edited ADR-027's Decision in place after it merged,
  creating the contradiction Review found. That landed from a different run
  and was only caught because this run's Review read the same files.
- Stop: nothing wasted. The idea → breakdown artifacts were small and the
  blueprint-gate stop kept the policy change with the Owner.

## Environment

All of this run's mistakes live in `scripts/`, whose tests run in CI: the
`rest` leg of the `test` matrix in `.github/workflows/ci.yml` (filter
`!@mbe/reservations-service !@mbe/hospitality !@mattbutlerengineering/rialto`)
runs `pnpm turbo test:coverage`, and `@mbe/scripts` (`pnpm-workspace.yaml`) is
in that leg [INFERENCE: its `test:coverage` task was not read run-by-run]. The pre-commit hook
runs `pnpm lint-staged` (eslint and prettier on `**/*.mjs`) and
`check-adr --staged`. So the check command is under a CI job; the gaps below
are missing assertions, not missing gates. `docs/standards.json` does not
exist in this repo.

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| Path tokens compared without stripping trailing punctuation, so the same file counted as disjoint and the hotspot lock was dodged in both modes | `review.md` §Major; `release.md` §WO-30 | mechanical | `scripts/__tests__/issue-zone.test.mjs` (already holds E1, E2 and hotspot cases after WO-30): add a property-style case asserting that appending `.`, `,` or `...` to any extracted path leaves `selectZoneSpreadBatch` output unchanged. Runs in CI's `rest` leg. |
| Active ADR's Decision section was rewritten in place by #6811, contradicting the default mode ("exactly ADR-023's original rule") | `review.md` §Minor 1 | mechanical | `tools/cli/src/check-adr.ts` (runs in `.husky/pre-commit` as `check-adr --staged` and in CI `ci.yml` line 357): reject a staged diff that edits the Decision section of an `active` ADR. A grep of the file for "Decision", "byte" and "immutab" found nothing, so it does not check this today. |
| Probe prints the same `{"strictMain":true}` for "strict" and "could not read" | `review.md` §Minor 2; `docs/process-retro.md:143` | mechanical | `scripts/__tests__/main-strictness.test.mjs`: assert the classifier returns a `source` of `measured` or `unavailable`; then `.claude/implement-queue.md` § compose logs it. The classifier is the existing seam. |
| Generated `llms*.txt` files never enter the overlap check | `review.md` §Minor 3 | judgement | `.claude/rules/gotchas.md` § CI (the line that already describes the zone rule): a reader must decide whether generated files count as shared scope. If the Owner says they do, the rule becomes an `issue-zone.test.mjs` case. |
| Stale "main is strict" premise left in the compose doc and the module header; `.claude/improvement-loop/log.md` still states "main is `strict`" as fact on 11-05 | `review.md` §Minor 4; `.claude/implement-queue.md:42`; `scripts/issue-zone.mjs:6-12` | judgement | `.claude/rules/gotchas.md` § CI line 49, which already says "main is NOT `strict`" and "re-measure before building on it". `scripts/check-doc-freshness.mjs` only checks that referenced paths exist, so it cannot hold this. |
| Out-of-zone-only paths count as non-pathless and can batch | `review.md` §Minor 5 | mechanical | `scripts/__tests__/issue-zone.test.mjs`: add the E3 case from Review (two `feat(hospitality)` issues citing only `packages/rialto/src/…`) expecting `[1]`. |
| Review's "probably fail-closed everywhere" suspicion was deferred with a one-command check that nobody ran before the routine started using the probe | `review.md` §Minor 2 (Suspicion); `release.md` §Deferred minors 2 | judgement | `.claude/implement-queue.md` § compose: a line telling the iteration to print and log the probe's raw output once per session. The existing pipeline has no pointer that holds a deferred "run this once" check. |

## Idea seeds

Appended to `docs/backlog.md`, one line each:

- Make `scripts/main-strictness.mjs` report `source: measured|unavailable` and have the implement-queue iteration log it; measure the share of compose iterations over 14 days that read `measured` (4 of 4 recorded readings were `true`, cause unknown). (from: feature:zone-batch-nonstrict-main)
- Give cloud implement-queue sessions a way to learn main's `strict` value (a token with Administration:read, or a measured value a workflow refreshes) so the relaxed rule can run at all; measure same-zone batches admitted per week, now 0. (from: feature:zone-batch-nonstrict-main)
- Decide which claim paths must route through `selectZoneSpreadBatch` (hand-dispatched sessions, `mbe-feature-drain`, `mbe-swarm`); measure selector compose calls vs issues claimed, and merge-from-main commits on same-zone parallel PRs. (from: feature:zone-batch-nonstrict-main)
- Write the short ADR amending ADR-027 for the cross-zone shared-registry lock (it applies under `strictMain: true`), and make `check-adr` reject in-place Decision edits to an `active` ADR. (from: feature:zone-batch-nonstrict-main)
- Replace the stale "main is strict" premise in `.claude/implement-queue.md:42`, the `scripts/issue-zone.mjs` header and ADR-027 Consequences, including the "never correctness" claim; measure with a grep for the unconditional phrase. (from: feature:zone-batch-nonstrict-main)
- Count only in-zone paths when deciding a same-zone issue is non-pathless, with Review's E3 as a test; measure how many ready issues have only out-of-zone paths (0 of 31 in Review's sample). (from: feature:zone-batch-nonstrict-main)
- Decide whether generated `llms*.txt` files count as shared scope in the overlap check; once a same-zone batch exists, count `llms*.txt`-only merge conflicts (42 of 75 hospitality `src` commits also touch `apps/hospitality/llms*.txt`). (from: feature:zone-batch-nonstrict-main)
- Re-run this retro's measurement when 5 selector-composed same-zone batches exist, and commit the command that counts them from the improvement-loop log and `metrics/queue-telemetry.jsonl`. (from: feature:zone-batch-nonstrict-main)

## Run complete

Closed 2026-11-07. Operate's minimum signal (5 selector-composed same-zone
batches) was not met: 0 of 5, and 0 people were observed using the tool. The
relaxed rule is on `main`, passes its own tests, and was reachable by the
Owner's token today, but the routine that calls the selector has recorded
`strictMain: true` in all 4 iterations that state a probe value. The bet that
same-zone batching speeds up the queue is untested. The first thing to act on
is the probe's blindness: until it says why it returned `true`, no one can
tell a strict `main` from an unreadable one. The seeds above are the input to
the next Idea-stage run.
