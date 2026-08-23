---
stage: operate
run: feature:tape-chart-overlaps
date: 2026-08-22
assumptions:
  - "Written roughly a day after release rather than after a breathing period. The operate skill warns that a retro written straight after shipping reflects hopes rather than outcomes; that caveat applies to the adoption question below, which has no signal yet. It does not apply to the rendering outcomes, which are measured against the deployed page rather than predicted."
  - "G2 — the design-system owner's yes/no verdict — had not been rendered when this was written. It is recorded as unmet rather than inferred from the measured criteria passing. The run is closed with that criterion open, which is a deliberate choice to close honestly rather than wait indefinitely or quietly restate G1 as if it covered G2."
---

# Retro: TapeChart overlaps — per-row lanes with conflict state

## Outcomes vs. intent

### Primary: "no bar can hide another, and a genuine conflict reads as a conflict rather than as ordinary side-by-side stacking"

**First half: met, measured.** Read off the deployed page in a real browser
(Playwright/Chromium against
`https://mattbutlerengineering.com/rialto/components/tape-chart`):
`occludedBars: []` in both demo charts — every bar's rect is non-empty and
overlaps no sibling's rect in the same row. Nine bars render per chart where
the pre-fix build drew nine and showed five.

**Second half: rendered, but unverified by the one person whose judgement the
criterion names.** The conflict treatment is present and distinguishable —
8 × `conflict` in the default chart, 5 × `conflict` / 3 × `shared` under
`classifyDormAsShared`, and the one non-overlapping reservation carries no
`data-overlap` in either. Whether it _reads_ as a conflict is G2, and G2 was
never answered.

- **Signal strength: measured** for occlusion and markup; **absent** for the
  aesthetic half.

### Per-row growth, not global

Met, measured. Row heights on the live page: `64, 94, 139, 139` px against
lane counts `2, 3, 3, 1`. Different rows are different heights, which is the
whole claim — a global `maxLanes` would have made them uniform.

- **Signal strength: measured.**

### Gates: lint, typecheck, test, visual

Met. The full library and showcase suites are green, and the change shipped
through `CI Gate` without an override.

**But the visual gate deserves an asterisk, and it is the most useful thing
this run learned.** `maxDiffPixelRatio: 0.01` was wide enough to absorb a 45px
row-height growth _and_ a macOS-rendered baseline that had been sitting on
`main` — its first column read "Wed 14" for `startDate="2026-01-15"`, which a
Linux runner renders as "Thu 15". A passing visual test was weak evidence and
nobody knew. Filed as #4450.

- **Signal strength: measured**, and unflattering.

### G2 — the design-system owner records a yes/no verdict on the deployed page

**Not met.** Screenshots of both charts were produced and surfaced; no verdict
was given. Recorded here as open rather than closed, because the alternative
is to let a criterion the PRD deliberately made human quietly evaporate into
"well, the measurable ones passed."

Worth naming _why_ it slipped: it could not be checked before merge, because
the PR preview URL this repo advertises did not resolve —
`preview-deploy.yml` composed a `workers.dev` host without the account
subdomain. So the only way to look at the change was to ship it first. That
defect is now fixed (#4452, merged twenty hours before this release), which
means the next run of this shape can get its aesthetic verdict _before_ merge
instead of after.

- **Signal strength: none.**

## Run retrospective

**Keep — verifying in a real browser against the deployed page.** This repo
has shipped multiple defects that every local gate passed: a CSP refusal
produces no status code, no server log, and no Sentry event, because it blocks
Sentry too. The post-release browser probe is the only step that can see that
class, and it is cheap. It is also what turned "the feature works" from an
assertion into `occludedBars: []`.

**Keep — fixing review findings that land on the thing the run exists to
produce.** F3 (each demo chart sharing one selection card, so clicking a red
"conflict" bar produced a card reading "Shared occupancy" underneath it) was
fixed before merge rather than filed. The run existed to produce a
demonstration; shipping a self-contradicting demo and a follow-up issue would
have been a worse outcome than a slightly later merge.

**Change — re-read tracker state before writing it down.** `release.md`
asserted all four follow-ups were open and labelled `ready`. #4451 had been
closed for twenty hours. The claim came from remembering having filed them
rather than re-reading, inside the one artifact that spends a section
cataloguing stale claims. Corrected in #4473. The repo's own instruction
covers this exactly — _trust live output, re-run source-of-truth checks
instead of recalling earlier summaries_ — and it was not followed.

**Change — never infer a CI rollup state from a zero count.** A poll filtered
on `state == "PENDING"` and missed that `gh` reports running checks as
`IN_PROGRESS`. Zero-pending / zero-failure / no-`CI Gate` is indistinguishable
from the #3969 `gate-missing` state, and was briefly reported as such. The
repo already owns `classifyCiGateStatus()` in `scripts/ci-gate-status.mjs`,
written for precisely this; hand-rolling a substitute reintroduced the bug it
exists to prevent.

**Change — stage agents need a liveness contract.** Three of the pipeline's
stage subagents died mid-run: two stalled waiting on background monitors and
one hit an API quota limit. None had written or committed anything, so each
failure was recoverable — but a stalled reviewer is the dangerous shape,
because it returns nothing and reads exactly like a clean pass. Ship and
Review were ultimately run inline for this reason.

**Stop — treating a green visual suite as evidence of visual correctness** at
the current tolerance. Until #4450 lands, `pnpm test:visual` passing means
"nothing changed by more than 1% of pixels", which is a much weaker claim than
it looks and was actively concealing a wrong-platform baseline.

## Idea seeds

- Route every ad-hoc CI-rollup poll through `classifyCiGateStatus()` rather than hand-rolling a filter — a hand-rolled one omitted `IN_PROGRESS` and briefly read "still running" as "never ran", two states with opposite correct responses (from: feature:tape-chart-overlaps)
- Never let `git push` reach a pipe — `git push … | tail` masks the exit code, and a failed push twice reported success this session, once surfacing only when a later `gh pr create` failed with "No commits between" (from: feature:tape-chart-overlaps)
- Give pipeline stage agents a liveness contract — three died mid-stage in one run (two stall-watchdog, one API quota), and a stalled reviewer fails open: it returns nothing and is indistinguishable from a clean pass (from: feature:tape-chart-overlaps)
- Make a human-judgement acceptance criterion block the merge it gates, or drop it — G2 was written into the PRD, could not be checked pre-merge because preview URLs were broken, and was still unanswered at run close (from: feature:tape-chart-overlaps)

## Run complete

Closed 2026-08-22, with **G2 open**. Every measurable criterion is met and
verified against production; the one criterion the PRD deliberately reserved
for a human was never answered, and this document does not pretend otherwise.

Shipped: PR #4442 (`e4c308085`), deployed via run `32609414271`.
Follow-ups #4448, #4449, #4450 remain open; #4451 was fixed by #4452.
Seeds above are the input to the next Idea-stage run.
