# Autorun brief: tier-classifier escalation false positives

stop-after: decompose

## Source

GitHub issue #6655 (part 10 of 10 for SDLC speed, tracking #6637), driven as a
Conductor batch item on branch `conductor/sdlc-ci-6655`. The issue body is the
brief's substance; this file condenses it for the stage skills.

## Feature description (what and why)

`tier-classifier.yml` escalates PR tiers on two signals that both
over-trigger, measured 2026-10-14: (1) the >1000-added-lines size escalation
counts every added line, including generated files the classifier itself
already rates "T1: auto-generated" (`llms*.txt` et al.) — #6610 was escalated
T3→T4 on 2198 added lines of which only 988 were code; (2) the
secrets/incident keyword escalation fires on any descriptive mention — #6541
(docs + one app file) escalated on the sentence "…`E2E_AUTH0_*` credentials or
CI/artifact access…". 3 of 4 open PRs wait on a human because of tier, two of
them false positives. Extract both decisions into a pure, unit-tested module
(`scripts/tier-escalation.mjs`), count only review-surface additions, require
an incident cue for keyword escalation, and replay old-vs-new over the last
300 PRs before changing behaviour.

## Run scale and slug

Feature run, slug `tier-escalation-false-positives`, re-entering at Idea.

## Decisions already made (from the issue)

- Module: `scripts/tier-escalation.mjs` + `scripts/__tests__/tier-escalation.test.mjs`,
  called from `.github/workflows/tier-classifier.yml` instead of inline logic.
- Size rule: exclude paths the classifier rates T1-generated (`**/llms.txt`,
  `**/llms-full.txt`, `pnpm-lock.yaml`, `**/registry.json`,
  `infrastructure/worker/dep-graph.json`,
  `docs/architecture/dependency-graph.md`, `**/generated*`); decide `*.md`
  explicitly — recommendation (take as default): exclude `docs/features/**`
  run artifacts, keep other docs counting.
- Keyword rule: escalate only on an actual incident/rotation signal (keyword
  in the title, or in a sentence with an incident cue); keep the existing
  "sensitive path already matched" hard-set gate.
- Replay 300 PRs old-vs-new before changing behaviour; pin each changed case
  with a test; table goes in the implementation PR description.
- Acceptance: #6610 → T3, #6591 → stays T4, #6541 → no keyword escalation;
  "we leaked the Stripe key and must rotate it" → still T4; existing workflow
  tests stay green; `pnpm lint && pnpm typecheck && pnpm test` pass.
- Patterns: BYPASS_PHRASE/REQUEST_CUE mention-vs-request fix (#3919→#3921);
  pure decision extracted from a workflow (`scripts/merge-queue-eligibility.mjs`).

## Tracker

Run is seeded from issue #6655; the Conductor owns that issue's lifecycle
(labels, close at merge). No tracker export from this run — no new issues, no
per-item mirroring.

## Release authorization

None. Prepare-and-stop default stands, and the run stops at Decompose
(`stop-after` above) regardless. This session never pushes and never opens a
PR; it keeps `pr-body.md` (uncommitted, worktree root) current for the
Conductor.

## Reserved identifiers

prd 8, adr 110-112, wo 76-85 — used only if the stage conventions call for
them; this repo's `docs/adr/` sequence is at ADR-026, so an ADR here would
take a reserved number only at merge time if the T4 gate demands one.

## Pre-flight record (protocol: open PRs first / work in flight)

Could not run: this session has no GitHub credential and no `gh`/network
tools (Bash is restricted to python3, git add/commit/status/diff/log, and the
conductor gate). Reported as not-run, not as clean.
