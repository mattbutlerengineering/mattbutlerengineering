---
stage: ship
run: feature:sentry-silence-alert
date: 2026-10-01
assumptions:
  - "Release mechanism is the brief's: squash-merge PR #5940 to `main`, then dispatch `sentry-heartbeat.yml` once on `main`. No deploy, tag or publish — the change is a scheduled workflow plus `scripts/`, and no deployed surface changes."
  - "This file is written before the release (pre-flight + plan) and finalized after it with the measured outcomes. Anything marked PENDING below had not happened at the time of this commit."
---

# Release: Sentry silence alert (daily heartbeat workflow)

## Pre-flight

- [x] **Verification green.** `verification.md`: no FAIL. Of 12 criteria, the
      ones not yet PASS are PENDING-SHIP (need the live run) or SC-4 PARTIAL
      (browser events report `environment: development`, no release — a
      pre-existing SDK-config fact, not a regression).
- [x] **Review: no unfixed critical.** `review.md` verdict "Ready to ship". M1
      and M2 fixed in-stage (`8cde07102`, `aa5288cae`). M3 and M4 deferred
      to this stage (see below). Repo `reviewer` subagent: PASS 7/10.
- [x] **No secrets in diff.** Gitleaks Secret Scan passed on head
      `c21b48bce`. The workflow reads `secrets.SENTRY_AUTH_TOKEN` and
      `github.token` only.
- [x] **Target config present.** `gh secret list` shows `SENTRY_AUTH_TOKEN`
      (set 2026-05-19, used daily by `sentry-triage.yml`). Label `sentry`
      exists. The workflow's permissions are `contents: read`,
      `issues: write`.
- [x] **Migrations / data changes.** None. No schema, no deployed app code,
      no new route (SC-10).
- [x] **Rollback plan concrete** (below).
- [ ] **M4 — token `project:read` scope.** Cannot be checked without the
      token; checked from the first dispatch's log instead (see Post-release).

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
git revert <merge-sha>        # on a branch, via PR; CI Gate must be green
```

## Release log

PENDING — filled in as each step runs.

## Post-release checks

PENDING.

## Outcome

PENDING.
