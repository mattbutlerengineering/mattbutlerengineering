---
stage: ship
run: feature:tape-chart-overlaps
date: 2026-08-22
assumptions:
  - "Ship ran inline in the orchestrator rather than in a dispatched stage subagent: two consecutive subagents died mid-stage (one on an API quota error, one on a 600s stall watchdog), and the release steps are short, sequential, and irreversible enough that a third silent death mid-merge was the worse risk. The protocol permits inline execution; artifacts remain the only state carried between stages."
  - "The run record is dated 2026-08-22 while every predecessor artifact is dated 2026-08-21 — the run crossed midnight local during the implement/verify phase. No stage was re-run."
---

# Release: TapeChart overlaps — per-row lanes with conflict state

Shipping the rendering half of a defect that had been latent since the
component was written: `useTapeChartLayout` computed `bar.lane` and
`maxLanes`, and no renderer consumed either, so two reservations overlapping
in one room drew on top of each other — the earlier bar invisible and
unclickable beneath the later one.

- **Change:** 37 files, +2,746 / −196, across 18 commits on
  `feat/tape-chart-overlaps`.
- **Vehicle:** PR #4442 → squash-merge to `main`.
- **Deploys:** `deploy-static.yml` publishes the rialto-web showcase on
  merge to `main`. That is the only externally visible effect.
- **Does NOT deploy:** `@mattbutlerengineering/rialto` stays at **0.2.0**.
  No changeset, no version bump, no npm publish — deliberately withheld per
  the run's release authorization. Consumer apps take the change through
  `workspace:*`; external registry consumers do not receive it until a
  separate, human-decided release.

## Pre-flight

- [x] **Verification green.** `verification.md`: 16 PASS · 0 FAIL · 1
      PENDING-HUMAN. The pending item is G2 (the design-system owner's
      yes/no on the deployed page), which is unmeetable before merge — see
      Post-release.
- [x] **Review clean.** `review.md`: 0 critical · 0 major · 3 minor · 3 nit.
      Verdict SHIP-WITH-FOLLOWUPS. F3 and F4 were fixed in `3a0020c34`
      before shipping rather than deferred, because both landed on the
      demo page this run exists to produce. F1 and F2 are deferred to
      tracker issues (below).
- [x] **No secrets in diff.** `Gitleaks Secret Scan` → SUCCESS, `CodeQL` →
      SUCCESS on `3a0020c34`.
- [x] **No migrations or data changes.** `git diff --name-only main...HEAD`
      matches no `migration` / `prisma` / `.sql` path. Nothing to roll
      forward.
- [x] **Generated artifacts clean.** `pnpm regen --check` → exit 0,
      "All generated artifacts are up to date." Independently corroborated
      by the CI `Integrity` job passing on the same SHA and by the pre-push
      hook, which runs the same check.
- [x] **Target config present.** No new environment variable, secret, or
      binding. The change is component code, fixtures, and a demo page.
- [x] **CI green on the head SHA.** `gh pr checks 4442` on `3a0020c34`:
      42 SUCCESS · 0 FAILURE · 0 PENDING · 6 SKIPPED · 1 NEUTRAL.
      **`CI Gate` → SUCCESS**, present twice (the check run plus the commit
      status published per the #4025 fix), asserted by name rather than
      inferred from a zero-failure count.
- [x] **Rollback plan concrete.** Below.

## Rollback plan

The change ships as one squash commit and touches no persistent state, so
reverting the commit fully reverts the release.

```bash
# 1. Identify the squash commit on main
git checkout main && git pull
git log --oneline -5          # find "feat(rialto): render tape chart overlaps…"

# 2. Revert it
git revert <squash-sha>
git push origin main
```

Merging that revert re-runs `deploy-static.yml`, which redeploys the
showcase from the reverted tree. No further action is required:

- **No npm unpublish needed** — the package was never published.
- **No migration to reverse** — none exist.
- **No feature flag to flip** — the behaviour is unconditional.
- **No cache purge needed** — the static sites deploy as Cloudflare Workers
  with Service Bindings specifically so the CDN never holds stale HTML.

Partial rollback is also available and cheaper if only the demo is at
fault: revert `apps/rialto-web/src/pages/data/TapeChartPage.tsx` alone,
leaving the library fix in place.

## Release log

1. `git status --short` → clean (only `review.md` / `verification.md`
   untracked, both committed in step 3; `docs/fixes/e2e-behind-edge-csp/`
   left untracked, unrelated to this run).
2. `pnpm build --filter @mbe/cli...` → exit 0 (FULL TURBO, 6 cached).
3. `pnpm regen --check` → exit 0, "All generated artifacts are up to date."
4. `gh pr checks 4442` → `CI Gate` SUCCESS on `3a0020c34`; 42 pass, 0 fail,
   0 pending.
5. Committed the outstanding run artifacts (`verification.md`,
   `review.md`, `release.md`) by explicit path.
6. Pushed; confirmed `git ls-remote origin feat/tape-chart-overlaps` matches
   local `HEAD`.
7. Waited for CI to conclude on the new head SHA (the docs commit
   retriggers the full workflow set) and re-asserted `CI Gate` SUCCESS.
8. `gh pr ready 4442` — took the PR out of draft.
9. `gh pr merge 4442 --auto --squash --delete-branch` — enabled auto-merge.
   This repo has no merge queue available (personal account; the
   `merge_queue` ruleset returns 422), so auto-merge is the mechanism.

Results for steps 5–9 are recorded in the Outcome section below, written
after they executed.

## Post-release checks

- **Deploy fired.** `deploy-static.yml` runs on merge to `main` with a
  `paths` filter covering `apps/rialto-web`. Recorded in Outcome.
- **G2 — PENDING HUMAN.** The last open success criterion is the
  design-system owner's yes/no on the live Overlaps section at
  <https://mattbutlerengineering.com/rialto/components/tape-chart>. This
  could not be checked before merge, and the reason is itself a defect
  worth naming: **the PR preview URL this repo advertises does not
  resolve.** `preview-deploy.yml:140-146` composes
  `https://mbe-preview-<PR>-rialto-web.workers.dev`, omitting the account
  subdomain that a real `workers.dev` host requires. Verified on #4442 —
  `curl` cannot resolve it and `dig @1.1.1.1` returns nothing. Filed as
  #4451 — **already fixed and closed** by #4452 (`959490792`, merged
  2026-08-22T05:23:51Z), which reads the real URL back from `wrangler deploy`
  output instead of hand-composing one. That landed ~20 hours before this
  release merged, so preview URLs resolve now; the defect is recorded here
  only because it is why G2 could not be checked pre-merge on #4442.
- **Probe the deployed page with a real browser**, not curl. A CSP refusal
  is client-side only: no 4xx, no server log, and Sentry is itself blocked
  by it. This repo has shipped two such defects that every local gate
  passed.

## Open follow-ups

Filed as tracker issues. None is a blocker for this release; none should be
auto-closed by this merge. State re-read from the tracker on 2026-08-22
rather than reported from memory — the first version of this section asserted
all four were open and `ready`, which was already false for #4451.

| Issue                                                                                              | Origin          | What                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#4448](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4448)                | review F1       | `classifyOverlap`'s published JSDoc promises "earlier start first", but window-clipped pairs sort by span and can arrive reversed. Doc and code disagree; either may be the thing that moves.                     |
| [#4449](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4449)                | review F2       | `pack.ts`'s `statementsPerFile = 2` let two new private helpers evict the exported hook from the llms context bundles. Deterministic, Integrity-green, and invisible — the class matters more than this instance. |
| [#4450](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4450)                | verify + review | `maxDiffPixelRatio: 0.01` absorbed a 45px row-height growth **and** a macOS-rendered baseline sitting on `main`. A passing visual test is currently weak evidence.                                                |
| ~~[#4451](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4451)~~ **CLOSED** | verify + review | PR preview URLs had never resolved (above). Fixed by #4452 before this release merged. Left in the table because it is the reason G2 was unverifiable on #4442, not because it is outstanding.                    |

Deliberately not filed: the five refreshed `dark/*` baselines and the
stress-baseline column-label change are accepted as documented deviations,
adjudicated in `review.md`.

## Outcome

Merged and deployed. The success criterion — "no bar can hide another,
conflicts read as conflicts" — is confirmed in production, measured in a
real browser against the live page, not asserted.

### Merge

|            |                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------- |
| PR         | [#4442](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4442), squash     |
| Commit     | `e4c30808511496f3ecd134e8ed09f82d0cf3d677`                                                    |
| Merged     | 2026-08-22 18:03:12 −0700 (2026-08-23T01:03:12Z) by `mattbutlerengineering`                   |
| Final diff | 40 files, +3,816 / −196                                                                       |
| Branch     | `feat/tape-chart-overlaps` deleted (`git ls-remote origin feat/tape-chart-overlaps` → 0 rows) |

The final diff is larger than the 37-file / +2,746 figure quoted at the top
of this document. That figure was accurate when the pre-flight ran; the three
run artifacts (`verification.md`, `review.md`, this file) were committed
after it was taken. Nothing else was added.

### Deploy

`Deploy Static Sites` run
[32609414271](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/32609414271)
on `e4c308085` — **success**, 01:03:14Z → 01:05:31Z (2m 17s).

```
success  Circuit Breaker Check        success  Deploy Hospitality
success  Detect Changes               success  Deploy Marketing
success  Deploy Rialto Web            success  Post-Deploy Verification
success  Report Deploy Health         skipped  Rollback Failed Deploys
skipped  Deploy Blocked
```

`Rollback Failed Deploys` skipped is the healthy outcome — it runs only on a
failed deploy. No rollback was executed and none is pending.

### Post-release verification (real browser)

Playwright/Chromium against
<https://mattbutlerengineering.com/rialto/components/tape-chart>, reading the
rendered DOM. Curl was deliberately not used: a CSP refusal produces no
status code, no server log, and no Sentry event, so only a real browser can
see one.

| Measure                          | Default chart                    | `classifyDormAsShared` chart           |
| -------------------------------- | -------------------------------- | -------------------------------------- |
| Section present                  | yes                              | yes                                    |
| Bars rendered                    | 9                                | 9                                      |
| `data-overlap`                   | 8 × `conflict`, 1 absent         | 5 × `conflict`, 3 × `shared`, 1 absent |
| Conflict glyphs                  | 8                                | —                                      |
| Lane indices                     | `0,1,0,1,2,0,1,2,0`              | —                                      |
| `--tapechart-lane-count` per row | `2, 3, 3, 1`                     | —                                      |
| Row heights (px)                 | `64, 94, 139, 139` (+ header 49) | —                                      |
| **Occluded bars**                | **`[]`**                         | **`[]`**                               |

`occludedBars: []` is the criterion: every bar's rect is non-empty and
overlaps no sibling's rect in the same row. The one bar with no
`data-overlap` attribute in each chart is room 203's single reservation,
which overlaps nothing and is therefore drawn in normal styling — the
control case that proves the conflict treatment is not applied blanketly.

Per-row heights differ (`64` vs `94` vs `139`), confirming the height is
per-row and not a single global `maxLanes`.

**Console: 1 error, ruled out as local.**
`net::ERR_CONNECTION_REFUSED` on `static.cloudflareinsights.com/beacon.min.js`.
That is this machine's LAN DNS sinkhole, not a production defect:

```
dig +short static.cloudflareinsights.com          → 0.0.0.0
dig @1.1.1.1 +short static.cloudflareinsights.com → 104.16.79.73, 104.16.80.73
```

No CSP violation, no other console error, no failed request attributable to
the change.

### Hiccups

Recorded because a clean release log that omits the retry misleads the next
release.

1. **`git push` timed out at 120 s.** The pre-push hook re-runs
   `pnpm regen --check`, which takes ~20 minutes on this repo — far past the
   tool timeout. Before retrying, `git ls-remote` was checked to confirm the
   push had _not_ landed (remote still at `3a0020c34`); the retry then ran
   backgrounded and succeeded. Re-pushing without that check risks acting on
   a push that already completed.
2. **A CI poll was read wrong and briefly reported as `gate-missing`.** The
   filter counted only `state == "PENDING"`, but `gh` reports running checks
   as `IN_PROGRESS`. The zero-pending / zero-failure / no-`CI Gate` result
   looked exactly like the #3969 `gate-missing` state; listing every check
   showed `Build` and `Test (Node 22)` still `IN_PROGRESS` and the gate simply
   not yet created. Corrected and re-polled counting
   `PENDING|IN_PROGRESS|QUEUED`. **A pending-count filter that omits
   `IN_PROGRESS` cannot distinguish "still running" from "never ran"** — and
   those two states have opposite responses.
3. **This file failed `prettier --check` on first write.** Written via a
   Bash heredoc, which bypasses the PostToolUse formatting hook. Fixed with
   `prettier --write --config .prettierrc.js`; the resolved config must be
   passed explicitly, or prettier silently falls back to defaults
   (`printWidth` 80 instead of 100) and reflows the whole file.
4. **Ship ran inline.** Two consecutive stage subagents died — one on an API
   quota error, one on a 600 s stall watchdog — neither having written or
   committed anything. Logged in this document's frontmatter.

### Release authorization — honoured

| Action                             | Status                                    |
| ---------------------------------- | ----------------------------------------- |
| Merge to `main` via CI auto-merge  | done, as authorized                       |
| Deploy rialto-web showcase         | done, automatic on merge                  |
| npm publish                        | **not done** — not authorized             |
| Changeset / version bump / tag     | **not done** — not authorized             |
| Manual `wrangler` / `doctl` deploy | **not done** — deploys go through CI only |

`@mattbutlerengineering/rialto` remains at **0.2.0**. `.changeset/` was never
touched.

### Still open

- **G2 — the design-system owner's yes/no on the live Overlaps section.**
  The only unmet success criterion. Everything measurable is green; this one
  is an aesthetic judgement and is not the assistant's to make.
- **Operate.** This run stays active until `retro.md` exists.
- Follow-ups #4448, #4449 and #4450 are open and labelled `ready`; none is
  blocked by this release. #4451 is already closed — fixed by #4452 twenty
  hours before this release merged.
