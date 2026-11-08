---
stage: capture
run: maintenance:fast-path-decision
date: 2026-11-07
re-entry: implement
intake: "#3989, #4063, docs/features/ship-pr/review.md § Minor 2"
assumptions:
  - "Maintenance run from a condition brief; no live user input."
---

# Defect: the "may this PR merge without review" decision has no executable home

## Condition (what is degraded)

The decision is a five-step ordering that exists only as prose, in two
instruction files that each restate it:

1. run `scripts/agent-core-build-freshness.mjs check`; exit 1 → no fast path and
   every specialist reviewer applies;
2. `needs-review` label → no fast path;
3. any changed file matches a gate path → hold for a human merge (ADR-0087);
4. `qualifiesForLowRiskFastPath(changedFiles)`;
5. `reviewersForDiff(changedFiles)` for the specialists.

Agents re-assemble it by hand every run. Steps 4 and 5 have no code caller:
each run writes its own `node --input-type=module -e "import … dist/index.js"`.

## Evidence

- `.claude/implement-queue.md` § fast-path and § reviewers, and
  `.claude/skills/ship-pr/SKILL.md` steps 2 and 4 restate the ordering.
- #3989: a stale dist silently narrowed `reviewersForDiff` to `[]`; the
  freshness check exists, but only a human-composed sequence calls it before
  the classifiers.
- #4063: `isLowRiskPR` alone enqueued a specialist-matched PR; `qualifiesForLowRiskFastPath`
  was added, again with no caller outside prose.
- `docs/features/ship-pr/review.md` § "Minor 2" recorded the gap as deferred:
  "one invocation (or a small CLI in the freshness script's style) recorded
  once in the profile's § fast-path, with the skill pointing to it".
- Zero code callers of `qualifiesForLowRiskFastPath` / `reviewersForDiff`
  outside the package's own tests.

## Target state

- `scripts/fast-path-decision.mjs` exports a pure `decideFastPath` and a CLI
  `check --pr <N> | --files a,b` that prints one JSON line
  `{fastPath, reviewers, holdForHuman, reason}`; exit 0 on any decision, 2 usage,
  1 when `gh` fails.
- It fails closed (no fast path, every specialist) when the dist is
  untrusted or unloadable; the fallback reviewer list is pinned by a test to
  `DIFF_REVIEWERS` in `pr-risk-classifier.ts`.
- The queue profile and ship-pr skill call it once and branch on the JSON;
  the hand-composed steps are gone, the WHY paragraphs stay.

## Work items

- [x] Failing tests first: `scripts/__tests__/fast-path-decision.test.mjs`
- [x] `scripts/fast-path-decision.mjs` (`decideFastPath`, `parseArgs`, `main`, CLI)
- [x] Single-source pin for the full-specialist fallback list
- [x] `.claude/implement-queue.md` § fast-path and § reviewers call the CLI
- [x] `.claude/skills/ship-pr/SKILL.md` steps 2 and 4 point to it
- [x] Register `fast-path-decision.mjs` in `knip.jsonc` scripts entry
- [x] Smoke against real merged PRs (#8424, #8459) and `--files docs/adr/x.md`
