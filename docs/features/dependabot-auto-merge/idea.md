---
stage: idea
run: feature:dependabot-auto-merge
date: 2026-10-14
assumptions:
  - "Evidence is adopted from issue #6650's 2026-10-14 measurement verbatim, not re-measured: this environment has no GitHub credential (no gh, no API), so the 30-PR sample and the p50/p90 figures are cited, labelled as the issue's own measurement."
  - "The open-PR pre-flight and the in-flight duplication check could not run (same credential gap). Recorded visibly per protocol; the issue's own 'Parallel-safe: yes with parts 1–6' line and the conductor batch plan are the standing mitigation."
---

# Idea: stop hand-merging Dependabot bumps that need no judgement

## Problem, from the sufferer's view

Matt wakes up to a row of Dependabot PRs — `actions/setup-node` 7.0.0→7.1.0,
`@types/node` patch — and merges them by hand, hours or days after they
opened. Each one is a decision he has already made in principle; the repo
just has no way to remember it. Measured 2026-10-14 over the last 30 merged
Dependabot PRs (issue #6650): the repo-wide median open→merge is ~33 min, the
p90 is ~24 h, and **every** slow PR is Dependabot — official-action
patch/minor bumps (#5845 at 248 h, #4785 at 27 h, #6572–#6575 at 24 h each)
and `@types/*` bumps (#4794 at 216 h, #4795 at 215 h, #5365 at 108 h, #6070
at 81 h, #6578 at 24 h).

## Who has it, and how they cope today

Matt, as the only human merge path in an otherwise autonomous SDLC. Coping is
batch hand-merging when he notices, which is exactly what the p90 measures.
The existing `dependabot-auto-merge.yml` was built to do this job and
silently covers almost none of it — see the hunch.

## Why now

Part 7 of 8 of the **sdlc-speed** feature (tracking #6637): the 2026-10-14
measurement identified Dependabot stalls as the dominant p90 contributor,
and Matt recorded the auto-merge policy the same day. The decision exists;
only the wiring is missing.

## Evidence the problem is real

The issue's measured PR list above — a real 30-PR sample with per-PR
latencies, not anecdote. (Cited, not re-measured: no tracker access from
this session — see frontmatter.)

## The hunch (shape of a solution, not a design)

Two config gaps make the existing workflow a near-no-op, and one policy
hiding in YAML makes it untestable:

1. The `github-actions` ecosystem has no `groups`, so `fetch-metadata`
   returns an empty `dependency-group` and every action bump — including
   `actions/*` — falls into the "requires manual review" branch.
2. The npm `dev-deps` group requires `dependency-type: "development"`, so a
   `@types/*` package declared under `dependencies` matches no group at all.

So: group official actions (`actions/*`, `github/*`) and `@types/*` in
`dependabot.yml`; move the merge/manual decision out of workflow `if:`
expressions into a pure, unit-tested `decideDependabotMerge()` the workflow
calls via CLI (the `merge-queue-eligibility.mjs` pattern); keep third-party
actions, production npm deps, and all semver-major bumps manual.

## Success, in one sentence

An official-action or `@types/*` patch/minor Dependabot PR merges on green
CI with no human touch, while third-party actions, production npm deps, and
semver-major bumps still wait for Matt.

## Biggest unknowns / ways this dies

- **Supply-chain surface:** the workflow runs on `pull_request_target` with
  write permissions — any change must keep the actor gate and never check
  out PR head code, or it dies in review (rightly).
- **Metadata shape:** the decision inputs come from
  `dependabot/fetch-metadata` outputs; if a needed output (ecosystem, group,
  names) isn't what we assume for grouped PRs, the policy's wiring — not its
  rules — needs rework at Implement.
- **Group-matching semantics:** Dependabot group `patterns`/`exclude`
  interactions have bitten this repo before (the `vitest*` vs `@vitest/*`
  comment in `dependabot.yml`); a wrong pattern silently reroutes packages
  between groups.
