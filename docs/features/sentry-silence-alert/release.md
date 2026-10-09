---
stage: ship
run: feature:sentry-silence-alert
date: 2026-10-01
assumptions:
  - "Release mechanism is the brief's: squash-merge PR #5940 to `main`, then dispatch `sentry-heartbeat.yml` once on `main`. No deploy, tag or publish — the change is a scheduled workflow plus `scripts/`, and no deployed surface changes."
  - "The pre-flight half of this file was committed to the PR branch before merge (`af6d5eeb0`); this version adds the measured outcomes and lands through a follow-up docs PR because the feature branch was deleted on merge."
  - 'The M3 deadline is computed from `scheduled-workflow-health.mjs` as merged: it counts only `event == "schedule"` runs (the manual dispatch below does not count), threshold 3, and its own cron is `0 8 * * *`. Heartbeat cron is `23 13 * * *`.'
---

# Release: Sentry silence alert (daily heartbeat workflow)

## Pre-flight

- [x] **Verification green.** `verification.md`: no FAIL. Of 12 criteria, the
      ones not yet PASS were PENDING-SHIP (need the live run) or SC-4 PARTIAL
      (browser events report `environment: development`, no release — a
      pre-existing SDK-config fact, not a regression).
- [x] **Review: no unfixed critical.** `review.md` verdict "Ready to ship". M1
      and M2 fixed in-stage (`8cde07102`, `aa5288cae`). M3 and M4 deferred
      to this stage (see below). Repo `reviewer` subagent: PASS 7/10.
- [x] **No secrets in diff.** Gitleaks Secret Scan passed. The workflow reads
      `secrets.SENTRY_AUTH_TOKEN` and `github.token` only.
- [x] **Target config present.** `gh secret list` shows `SENTRY_AUTH_TOKEN`
      (set 2026-05-19, used daily by `sentry-triage.yml`). Label `sentry`
      exists. Workflow permissions: `contents: read`, `issues: write`.
- [x] **Migrations / data changes.** None. No schema, no deployed app code,
      no new route (SC-10).
- [x] **Rollback plan concrete** (below).
- [x] **M4 — token `project:read` scope.** Could not be checked before
      merge (no local token). Checked from the first dispatch's log: every
      lookup succeeded and four projects confirmed, so the scope is present.

## Rollback plan

The release adds one scheduled workflow and new `scripts/`; nothing deployed
changes, so rollback means stopping the workflow and, if needed, reverting.

```
# 1. Stop it firing immediately (no code change needed):
gh workflow disable sentry-heartbeat.yml

# 2. Close any false alert issues it opened (body carries the marker
#    <!-- sentry-heartbeat project=<slug> -->):
gh issue list --label sentry --state open --search "sentry-heartbeat in:body"
gh issue close <N> --comment "False alert from sentry-heartbeat rollback; see docs/features/sentry-silence-alert/release.md"

# 3. Revert the squash commit (triage.mjs heartbeat filter goes with it):
git revert 6069e08041280d7221790eb9a288dfc4df7a1fed   # on a branch, via PR; CI Gate must be green
```

Rollback was not needed.

## Release log

1. Baseline before release: `gh issue list --label sentry --state open` →
   `[]` (zero open `sentry` issues).
2. Committed this file's pre-flight half to the PR branch → `af6d5eeb0`.
   Pre-push hook: ratchet "All patterns within baseline", regen check fast
   path. `git ls-remote` confirmed `af6d5eeb0` on
   `refs/heads/feat/sentry-silence-alert`. (Hiccup: the push ran past the
   Bash tool's 120 s foreground limit and the `verify-push-sha` hook fired
   early with "branch not found"; the push itself finished with `push_rc=0`
   and the SHA was confirmed on the remote before going further.)
3. `gh pr ready 5940` → "marked as ready for review" (05:13:36Z).
4. CI run `36818741630` (`pull_request`, head `af6d5eeb0`) → `completed
success`. Check run `CI Gate` on exactly `af6d5eeb0` → `completed success`
   (job `110232431134`). `mergeStateStatus` → `CLEAN`.
5. `gh pr merge 5940 --squash --delete-branch --match-head-commit af6d5eeb0…`
   → PR `MERGED` at 2026-10-01T05:26:25Z, merge commit
   **`6069e08041280d7221790eb9a288dfc4df7a1fed`**, which is `origin/main`'s
   tip. Remote branch deleted. (Hiccup: `gh` then failed its local cleanup
   with `fatal: 'main' is already used by worktree at …/booking-guest-reuse`
   — local-only, the merge and remote delete were unaffected.)
6. `gh workflow run sentry-heartbeat.yml --ref main` → rc 0 (05:26:36Z).
   Run located by workflow + `--branch main` + `headSha == 6069e0804…`:
   **run `36819787202`**, event `workflow_dispatch`.
7. Run `36819787202` → **`completed failure`**, by design (SC-6). Steps:
   Checkout, Setup workspace, Install Chromium, Run heartbeat, Reconcile
   alert issues all `success`; "Fail on any failing project" `failure`
   (`Process completed with exit code 1`).

Dispatched exactly once; no re-dispatch.

## Post-release checks

**Heartbeat verdicts** (job log, run `36819787202`):

```
| Project | Verdict | Targets |
| --- | --- | --- |
| users-api | PASS | users-api: confirmed |
| reservations-api | PASS | reservations-api: confirmed |
| agent-api | PASS | agent-api: confirmed |
| hospitality | PASS | hospitality: confirmed |
| mattbutlerengineering | FAIL | marketing: misrouted → hospitality; rialto-web: misrouted → hospitality |

hospitality detail:
CSP violation: script-src blocked eval from https://mattbutlerengineering.com/hospitality/assets/json-render-vendor-Czrj1zkF.js
```

- This is exactly Architect's prediction: marketing and rialto-web events
  land in the `hospitality` project because `deploy-static.yml` builds all
  three static apps with one `VITE_SENTRY_DSN`. A finding to file, not scope
  for this run (brief).
- The hospitality CSP `eval` line is the known pre-existing violation; it
  did not stop the hospitality round trip (confirmed).
- **M4 resolved:** no `error`, no `Sentry API returned 403`. The token reads
  the events endpoint, so it has `project:read`.
- **Review m7 resolved:** the undocumented `query` parameter works against
  the real endpoint — 4 projects matched their unique marker.
- **M1 in practice:** lookups ran serially (one "Looking up" line at a time,
  ~200 ms apart) and no target ended as `error`. (The log does not print
  retried 429s, so whether any were absorbed is not observable here.)
- Wall time of the heartbeat step: 05:27:42Z → 05:30:51Z (~3 min; the two
  misrouted targets polled the full window, then searched the other
  projects).

**Issues** (`gh issue list --label sentry --state open`):

- **#5941** "Sentry heartbeat failing: mattbutlerengineering" — opened
  2026-10-01T05:30:52Z, label `sentry`, body lists both misrouted targets,
  the run link and the hidden marker
  `<!-- sentry-heartbeat project=mattbutlerengineering -->`. Correct alert;
  left open. Reconcile log: `users-api: none`, `reservations-api: none`,
  `agent-api: none`, `hospitality: none`, `mattbutlerengineering: open`.
- No other `sentry` issue opened. No triage issue exists for the
  `HOSPITALITY-B` heartbeat Sentry issue (search
  `mbe-round-trip OR HOSPITALITY-B OR heartbeat`, state all, returns only
  #5941). The triage filter is now on `main`; its first live run is the
  next `sentry-triage.yml` schedule — confirm in Operate that it reports
  `heartbeat=N` and files nothing for heartbeat issues.

**SC-10 browser probe** (real Chromium via repo Playwright, scratch script,
before and after merge — identical results):

| Page                                             | HTTP | CSP violations |
| ------------------------------------------------ | ---- | -------------- |
| `https://mattbutlerengineering.com/`             | 200  | 0              |
| `https://mattbutlerengineering.com/rialto/`      | 200  | 0              |
| `https://mattbutlerengineering.com/hospitality/` | 200  | 0              |

The only console error on each page was a failed load of
`static.cloudflareinsights.com/beacon.min.js` (`ERR_CONNECTION_REFUSED`).
That host resolves to `0.0.0.0` on the local resolver and to
`104.16.79.73` via `dig @1.1.1.1` — the known LAN DNS sinkhole, not a prod
defect. No app code changed in this release, as expected.

## Deferred, needs Matt

- **M3 — deadline: before 2026-10-04 08:00Z.** Every scheduled heartbeat
  will be red until the DSN misrouting is fixed. Scheduled runs at 13:23Z on
  2026-10-01, 10-02 and 10-03 make three consecutive `schedule` failures;
  `scheduled-workflow-health` (08:00Z daily) then files a `ci-fix` + `ready`
  issue against the heartbeat on 2026-10-04, which implement-queue could
  "fix" by repointing marketing/rialto-web at `hospitality` in
  `sentry-heartbeat-targets.mjs` — silencing the real finding. Choose one:
  (a) fix the misrouting in `deploy-static.yml` (per-app DSN; the real
  cure; #5941 tracks it), or (b) exempt reported-finding workflows in
  `scheduled-workflow-health`. Until then, if the `ci-fix` issue appears,
  close it pointing to #5941.
- **#5941 is a real finding** — marketing and rialto-web errors go to the
  `hospitality` Sentry project. It closes itself on the first green run
  after the DSN fix.
- **SC-4 PARTIAL** stays: browser events report `environment: development`
  and no release.

## Outcome

Shipped cleanly. Merged as `6069e0804` after `CI Gate` passed on the final
head. The one dispatched run (`36819787202`) proved the round trip end to end
for 4 of 5 projects and correctly went red on the fifth, opening one
de-duplicated alert (#5941) for the known DSN misrouting. Two hiccups, both
local-tooling only (push outlived the foreground timeout; `gh` local branch
cleanup collided with another worktree's `main`). Next stage: Operate.
