## 2026-05-02

**Sensors:** 5/7 available
**Regressions:** 0 detected, 0 issues created
**Verifications:** 15 checked (placeholder - full verification pending)
**Skill proposals:** 0 (not Friday)
**Issue status:** 4 open, 0 ready
**Threshold notes:** ACMM cached state missing (score=0). Lighthouse config missing. Agent cost log missing.

## 2026-06-20

**Sensors:** 6/8 available (agentCost, issueFeedback unavailable)
**Regressions:** 0 detected, 0 issues created (status: Healthy — ACMM L5 110/114, CI 89%, Lighthouse 4 surfaces)
**Verifications:** 5 checked, 3 verified (#2451/#2450 ACMM auto-rollback, +1), 2 failed → reopened #2473 + #2458 (deploy health still low)
**Skill proposals:** 0 (Saturday — Friday-only)
**Threshold notes:** fix-effectiveness 60% (>50%, healthy); audit threshold auto-tuned 1→1.03; collect-ai-issue-feedback.mjs errored on its gh query (printed field list then "Failed to query GitHub issues") → default budget 3 used. #2473 reopened despite merged fix #2498 (deploy retry) — annotated + `ready` removed (awaiting a successful deploy to clear the metric, no new code).

## 2026-07-05

**queueEfficiency:** composite 0.744 (baseline n/a) — healthy
**Difficulty distribution:** size:m:12, size:xs:5, size:l:10, size:xl:5, size:s:7
**Issues filed:** 0

## 2026-07-30

**Sensors:** 5/15 available (acmm, prMetrics, ccusageCost, sessionLogs, codeChurn) — ciHealth, lighthouse, issues, issueFeedback, prCategoryMetrics, agentCost, mutationScore, flakyTests, e2eStability, queueEfficiency unavailable
**Regressions:** 0 detected, 0 issues created (status: Healthy — ACMM L5 96/114, code churn 27.5%)
**Verifications:** 0 checked (no sensor-labeled issues closed in last 48h)
**Sentry triage:** skipped (MCP disconnected mid-run)
**Skill proposals:** 0 (Thursday — Friday-only)
**Threshold notes:** no verifications.jsonl yet, so false-positive/fix-effectiveness rates not computable this run. `collect-ai-issue-feedback.mjs` failed ("Failed to query GitHub issues") — recurring gap already noted 2026-06-20: `@mbe/gh-client` shells out to the `gh` binary via `execFileSync`, which is not installed in this Claude Code Remote scheduled-session environment (only GitHub MCP tools are). This is the root cause for 10/15 sensors + the feedback budgets being permanently unavailable here, not a new regression. No action taken since it's pre-existing and didn't block this run (zero regressions to triage).

## 2026-07-31

**Sensors:** 5/15 available (acmm, prMetrics, ccusageCost, sessionLogs, codeChurn) — ciHealth, lighthouse, issues, issueFeedback, prCategoryMetrics, agentCost, mutationScore, flakyTests, e2eStability, queueEfficiency unavailable
**Regressions:** 0 detected, 0 issues created (status: Healthy — ACMM L5 96/114 unchanged from 2026-07-30, code churn 18.8%, down from 27.5%)
**Verifications:** 0 checked (no sensor-labeled issues closed in last 48h)
**Sentry triage:** skipped (MCP disconnected mid-run, same as 2026-07-30)
**Skill proposals:** 0 (Friday, but sessionLogs shows 0 sessions/0 commits in the last 7d — no pattern data to mine)
**Threshold notes:** `verifications.jsonl` still doesn't exist, so false-positive/fix-effectiveness rates remain non-computable. `collect-ai-issue-feedback.mjs` failed again on its `gh` query — same pre-existing `gh`-CLI-unavailable gap noted 2026-06-20 and 2026-07-30, not a new regression. No action taken.

## 2026-08-01

**Sensors:** 5/15 available (acmm, prMetrics, ccusageCost, sessionLogs, codeChurn) — ciHealth, lighthouse, issues, issueFeedback, prCategoryMetrics, agentCost, mutationScore, flakyTests, e2eStability, queueEfficiency unavailable
**Regressions:** 0 detected, 0 issues created (status: Healthy — ACMM L5 96/114 unchanged since 2026-07-30, code churn 0.4%, sessionLogs 0/7d)
**Verifications:** 0 checked (no sensor-labeled issues closed in last 48h)
**Sentry triage:** skipped (MCP disconnected mid-run, same as 2026-07-30/07-31)
**Skill proposals:** 0 (Saturday — Friday-only)
**Threshold notes:** `verifications.jsonl` still doesn't exist, so false-positive/fix-effectiveness rates remain non-computable. `collect-ai-issue-feedback.mjs` failed again on its `gh` query — same pre-existing `gh`-CLI-unavailable gap noted 2026-06-20, 2026-07-30, 2026-07-31 (third consecutive run); root cause remains `@mbe/gh-client` shelling out to the `gh` binary, absent in this scheduled-session environment (only GitHub MCP tools present). No action taken — pre-existing, non-blocking, zero regressions to triage.
