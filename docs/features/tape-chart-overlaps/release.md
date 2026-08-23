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
  #4451.
- **Probe the deployed page with a real browser**, not curl. A CSP refusal
  is client-side only: no 4xx, no server log, and Sentry is itself blocked
  by it. This repo has shipped two such defects that every local gate
  passed.

## Open follow-ups

Filed as tracker issues, all labelled `ready`. None is a blocker for this
release; none should be auto-closed by this merge.

| Issue                                                                               | Origin          | What                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#4448](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4448) | review F1       | `classifyOverlap`'s published JSDoc promises "earlier start first", but window-clipped pairs sort by span and can arrive reversed. Doc and code disagree; either may be the thing that moves.                     |
| [#4449](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4449) | review F2       | `pack.ts`'s `statementsPerFile = 2` let two new private helpers evict the exported hook from the llms context bundles. Deterministic, Integrity-green, and invisible — the class matters more than this instance. |
| [#4450](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4450) | verify + review | `maxDiffPixelRatio: 0.01` absorbed a 45px row-height growth **and** a macOS-rendered baseline sitting on `main`. A passing visual test is currently weak evidence.                                                |
| [#4451](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4451) | verify + review | PR preview URLs have never resolved (above). Workflow green, comment posted, link dead.                                                                                                                           |

Deliberately not filed: the five refreshed `dark/*` baselines and the
stress-baseline column-label change are accepted as documented deviations,
adjudicated in `review.md`.

## Outcome

Recorded below after execution.
