# Root cause: the `review_coverage` drop (0.286 → 0.167, 2026-10-28..30)

Written for issue #8187 (part 4/4 of proposal #7986). Docs only — no code
change. Companion issues: #8184 (detector), #8185 (fixture test), #8186
(wire the regression into `isRealRegression`/issue filing).

## Formula

`review_coverage` is computed per rolling window by `reviewCoverage()` in
`scripts/collect-queue-efficiency.mjs:261`:

```js
function reviewCoverage(windowPrs, windowRows) {
  const reviewed = windowRows.filter((r) => REAL_VERDICTS.has(r.reviewer_verdict)).length;
  const unknowable = windowRows.filter(
    (r) => !REAL_VERDICTS.has(r.reviewer_verdict) && r.unknown_reasons?.reviewer_verdict
  ).length;
  const denominator = windowPrs.length - unknowable;
  if (denominator <= 0) return { coverage: null, n: 0 };
  return { coverage: Math.round((reviewed / denominator) * 1000) / 1000, n: denominator };
}
```

- `windowPrs` = merged agent PRs in the window (`issues_merged`).
- `windowRows` = rows in `metrics/queue-telemetry.jsonl` matched to those PRs
  by `pr_number`.
- `reviewed` counts rows whose `reviewer_verdict` is `"pass"` or `"flag"`
  (`REAL_VERDICTS`).
- A row whose `reviewer_verdict` is null **and** carries
  `unknown_reasons.reviewer_verdict` (an honest "can't know") is excluded from
  the denominator entirely — it doesn't count against coverage.
- A PR with **no row at all**, or a row with a known-but-negative verdict
  (`skipped`/`error`), stays in the denominator and counts as uncovered.

So `review_coverage` can only ever register a PR as reviewed through one
channel: a telemetry row with `reviewer_verdict: "pass"` or `"flag"`.

## Observed data

From `metrics/process-metrics.jsonl` (`sensor: "queueEfficiency"`):

| date       | issues_merged | review_coverage | n (denominator) |
| ---------- | ------------- | --------------- | --------------- |
| 2026-10-26 | 94            | 0.5             | 8               |
| 2026-10-28 | 114           | **0.286**       | 21              |
| 2026-10-29 | 101           | **0.211**       | 19              |
| 2026-10-30 | 89            | **0.167**       | 18              |
| 2026-10-31 | 74            | 0.167           | 18              |
| 2026-11-02 | 65            | 0.188           | 16              |
| 2026-11-03 | 97            | 0.182           | 22              |

Composite dropped in step (0.918 → 0.914 → 0.910 over the same three days),
exactly the incident #8185/#8186 pin. The striking part is the gap between
`issues_merged` (65–114) and the denominator `n` (8–25): **the large majority
of each window's merged PRs are excluded from the denominator as
"unknowable"**, not counted as reviewed or unreviewed.

## Two channels write `reviewer_verdict`, and only one of them can ever write `pass`/`flag`

**Channel 1 — in-session write (the only source of `pass`/`flag`).**
`.claude/implement-queue.md` § telemetry: the orchestrating session calls
`appendTelemetryRow` directly after the Reviewer subagent returns, with
`reviewer_verdict: "pass" | "flag" | "skipped" | "error"`. This writes
straight to `metrics/queue-telemetry.jsonl`; nothing round-trips through
GitHub.

**Channel 2 — the GitHub backstop (`scripts/collect-queue-telemetry-from-github.mjs`),
which can only ever write `null`.** Its own header comment says so directly:

> Fidelity tradeoff: tokens, tool uses, duration, model tier and reviewer
> verdict only exist inside the worker session and cannot be reconstructed
> from GitHub, so they are written as null.

`reconcile-queue-telemetry.mjs` then tries to fill that `null` from GitHub via
`parseReviewerVerdict()` in `scripts/lib/queue-telemetry-github-source.mjs:19`,
which scans PR **issue comments** (`GET /issues/{n}/comments`) for:

```js
const VERDICT_RE = /Review gate[^*\n]*\*\*\s*(PASS|FLAG)\b/gi;
```

**No production code path ever posts a comment matching this regex.**
Searching the whole repo for `Review gate (inline)` finds it only in two
places, both test fixtures (`scripts/__tests__/queue-telemetry-github-source.test.mjs`
and the `queue-telemetry-github-source.mjs` module's own doc comment that
_describes_ the test fixture format it expects). No `.github/workflows/*.yml`,
no `.claude/agents/*.md`, no skill posts an issue comment or a GitHub PR
review in this shape — the Reviewer subagent's verdict is consumed in-process
by the orchestrator and never published to GitHub at all (confirmed against
`.claude/agents/reviewer.md`: "Not editing files, branches, or issues. You are
read-only; you return a verdict" — it has no tool to post anything).
`scripts/acmm/review-burden-metrics.js`'s native GitHub PR Review count (the
separate "rubber-stamp" sensor) independently shows **1–2 reviewers and 2–6
total reviews against 100 closed PRs/week** across late October — almost no
PRs carry a real GitHub-native review object either.

So for any PR whose session skipped the in-session `appendTelemetryRow` call,
`reviewer_verdict` is **structurally unrecoverable** — not unlikely to
recover, not recovered-this-time, but unrecoverable by any code path that
exists today. The reconciler still marks it `unknown_reasons.reviewer_verdict
= "no-verdict-comment"`, which is _correct_ per the field's semantics (an
honest "can't know"), and that row is then excluded from the denominator — it
never drags `review_coverage` down directly. The denominator shrinks instead.

## The real shift: the share of merged PRs with no in-session row at all has exploded

Measured directly against `metrics/queue-telemetry.jsonl` (933 rows). A
backstop-authored row is distinguishable from an in-session row because the
backstop writes `subagent_tokens: null` unconditionally (`collect-queue-telemetry-from-github.mjs:73-85`)
while every in-session row carries real token/tool-use counts:

| window                    | rows | backstop-derived (`subagent_tokens: null`) | share     |
| ------------------------- | ---- | ------------------------------------------ | --------- |
| `claimed_at` < 2026-10-01 | 440  | 68                                         | **15.5%** |
| `claimed_at` ≥ 2026-10-27 | 82   | 75                                         | **91.5%** |

Sampling five of the recent backstop rows' PRs (`gh api .../pulls/<n>`) shows
ordinary agent-authored fix PRs (`fix(rialto): widen framer-motion peer
range...`, `fix(hospitality): validate operating-hours open days...`, etc.),
each with a `🤖 Generated with Claude Code` footer — real agent work, not
bookkeeping or chaos-agent noise. These PRs merged without the orchestrating
session ever calling `appendTelemetryRow`, so the backstop (which only sees
GitHub, and whose only recovery regex matches nothing real) is the sole
source for their row, and it can never populate `reviewer_verdict` with
anything but `null`.

## Verdict: **mostly a measurement artifact, with one real contributing fact**

- **Artifact (confirmed):** the backstop's `reviewer_verdict` recovery path
  (`VERDICT_RE` against issue comments) targets a comment format nothing in
  the current pipeline posts. This makes `review_coverage` permanently blind
  to review activity on any PR lacking an in-session telemetry row — the
  metric cannot distinguish "reviewed but not recorded" from "not reviewed"
  for that population; today it undercounts by excluding them from the
  denominator rather than crediting them, so the number is conservative, but
  it is not measuring what its name claims once the excluded share gets this
  large.
- **Real (confirmed, not explained further here):** the share of merged
  agent PRs with **no in-session telemetry row** jumped from ~15% to ~92%
  between late September and the incident window. That is a genuine
  regression in how completely `metrics/queue-telemetry.jsonl` is populated —
  independent of whether those PRs were actually reviewed — and it also
  starves `cost_coverage_n` (same `subagent_tokens`/`cost_usd` gap) and any
  other sub-metric that depends on in-session rows. _Why_ sessions stopped
  writing the row (skipped Phase-4 commit, a routine that doesn't call
  `appendTelemetryRow` at all, an ephemeral checkout ending before the commit
  lands, etc.) was not investigated here — that is the real-regression
  follow-up below.

## Follow-ups (not filed here, per acceptance criteria)

1. **Dead detector:** either remove `parseReviewerVerdict`/`VERDICT_RE` and
   the issue-comment lookup from `queue-telemetry-github-source.mjs` (it
   never succeeds against a real PR), or make some orchestrator actually post
   a matching comment so the backstop channel becomes real. Removing is
   cheaper and more honest given channel 1 is the documented source of truth.
2. **Investigate the backstop-share regression:** find which recently-merged
   PRs' originating sessions never called `appendTelemetryRow` (or called it
   but never committed `metrics/queue-telemetry.jsonl` before the session
   ended) and why — candidates: a routine or skill that merges PRs without
   following `.claude/implement-queue.md` § telemetry (this routine,
   `mbe-daily-issue`, is itself one such candidate: its own prompt has no step
   that calls `appendTelemetryRow`), or ephemeral CCR sessions ending before
   the commit step runs. This is the metric's actual health problem; fixing
   item 1 alone will not move `review_coverage` while this stays broken.
