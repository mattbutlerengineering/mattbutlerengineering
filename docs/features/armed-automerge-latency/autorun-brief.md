---
kind: autorun-brief
run: feature:armed-automerge-latency
date: 2026-10-15
stop-after: decompose
---

# Autorun brief: make armed Dependabot auto-merges actually complete

Not an artifact — this file never counts toward orientation or active-run
discovery. It is the single source of interview answers for every stage of
this run. Where it is silent, a stage takes its skill's recommended default
and logs it under `assumptions:`; where no default exists, it stops and
surfaces.

`stop-after: decompose` — this run is driven up to the blueprint gate
(`breakdown.md` committed) and stops there. Implement onward belongs to a
later session.

## Origin

Conductor item for issue #6651 (part 8 of 8 of the **sdlc-speed** feature,
tracking #6637), batch `conductor/b20261014c-6651`. The issue body — written
by `/decompose` — is the verbatim source for every answer below. Depends on
#6650 (part 7, run `feature:dependabot-auto-merge` in this same docs tree),
which built the arming machinery whose completion this run audits.

**Pre-flight (open PRs first): could not run.** This environment carries no
GitHub credential — every `gh` command is forbidden and pushes fail — so the
open-PR list and the in-flight duplication check are both unrunnable here.
Recorded per protocol as "the check could not run", not as a clean result.
The issue's own "Parallel-safe: yes with parts 1–6" line and the conductor
batch plan are the standing mitigation.

## What and why

PR #6577 (Dependabot `dev-deps` group) had GitHub auto-merge **armed at
2026-10-13T22:10:19Z** — 11 s after opening — yet merged at
2026-10-14T22:20:43Z, ~24 h later. Labels: `dependencies`, `tier:sensitive`,
`agent-authored`. `main` is non-strict (`{"strict": false, "contexts":
["CI Gate"]}`, measured 2026-10-14), so being behind main should not have
blocked it. If whatever held #6577 also holds part 7's newly auto-merged
groups (official-actions, types), part 7 delivers nothing: arming is not
merging. Diagnose the hold from the PR's timeline and check runs, then
either fix the cause (pure function + test if logic changes) or record the
hold as intended in `.claude/rules/gotchas.md`.

## Run scale and slug

Feature run, slug `armed-automerge-latency`. Artifact depth scales down:
this is a diagnosis plus (at most) a small CI-machinery fix.

## Idea-stage inputs

- **Problem, sufferer's view:** Matt (and the autonomous SDLC acting for
  him) arms auto-merge and walks away believing the PR will land on green
  CI; a day later it is still open, and the sdlc-speed p90 that part 7 was
  built to fix is unchanged. The failure is silent — an armed-but-stuck PR
  looks identical to one waiting legitimately on CI.
- **Who / coping today:** Matt, the only human merge path; coping is batch
  hand-merging when he notices — exactly the behavior parts 7–8 exist to
  retire. It is not yet established whether #6577's eventual merge WAS a
  hand-merge; finding that out is part of the diagnosis.
- **Why now:** part 7 just widened the armed population (official-actions,
  types groups). Every one of those PRs inherits this hold if it is
  systemic, so part 7's value is gated on part 8's answer.
- **Evidence:** the #6577 timestamps and labels above (from issue #6651,
  cited verbatim — this session cannot re-measure, no GitHub credential);
  the non-strict branch-protection measurement of 2026-10-14.
- **Solution hunch (not a design):** classify the hold using the repo's own
  rollup classifier (`scripts/ci-gate-status.mjs`: `gate-missing` /
  `gate-unattributed` / `action_required` parks) against #6577's head-SHA
  check runs and the `auto-merge.yml` / `tier-classifier.yml` /
  `merge-queue.yml` run history; known candidate mechanisms are already
  documented in gotchas § CI (Dependabot-event token limits, the
  `action_required` approval park #3684, `gate-unattributed` #4023, and
  `automation-pr-rescue.yml`'s scope being `automation/*` branches only —
  Dependabot branches are `dependabot/**` and carry no `auto-merge` label,
  so no rescue path covers them).
- **Success, one sentence:** the next armed Dependabot auto-merge PR merges
  within one CI cycle of `CI Gate` going green, with the root cause of
  #6577's 24 h hold stated with evidence on issue #6651.
- **Biggest unknowns / ways this dies:** the hold may be unreproducible
  one-off GitHub weirdness (then the deliverable is the gotchas entry +
  observation criterion, not a code fix); the evidence may show the merge
  was completed by a human or routine rather than GitHub auto-merge, which
  changes the mechanism entirely; diagnosis requires GitHub API access this
  session does not have, so all evidence work lands in Implement-stage work
  orders for a credentialed session.

## Scope boundaries

- **In:** root-cause diagnosis of #6577's hold; at most one small fix in
  `.github/workflows/auto-merge.yml` / `.github/workflows/merge-queue.yml` /
  `scripts/merge-queue-eligibility.mjs` (+ test) or a rescue-scope change,
  whichever the evidence names; a gotchas entry when the hold is intended;
  recording the finding on issue #6651.
- **Out:** changing tier policy or review gates (a `tier:sensitive` label
  must keep exactly its documented meaning); touching part 7's policy
  module or `dependabot.yml` groups; any merge-queue redesign; fixing
  unrelated stuck-PR classes (`automation/*` rescue already exists).

## Constraints / already decided

- Any logic change ships as a pure function + unit test (repo mandate,
  issue AC) following the `scripts/merge-queue-eligibility.mjs` pattern.
- Evidence before mechanism: no fix is written until the timeline/check-run
  evidence names the cause (issue AC: "root cause stated with evidence").
- Gates: `pnpm lint && pnpm typecheck && pnpm test` on affected packages.

## Tracker

Yes — the run mirrors issue #6651 (ADR-0026 import): work items carry
`(tracker: #6651)`, no new issues are created, and #6651 closes at the
implementation PR. The finding itself must be posted on #6651 (issue AC).

## User-facing surface

None — CI/merge automation only. Expect `ux: not-applicable` at PRD time.

## Release authorization

Prepare-and-stop (default; moot here — the run stops after Decompose).
Reserved id block for this conductor item: prd 5, adr 101–103, wo 46–55.
Never edit `.claude-plugin/plugin.json`'s version.
