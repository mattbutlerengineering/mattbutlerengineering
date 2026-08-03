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

## 2026-08-02

### Metrics

| Metric                                 | Value                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Created (7d, audit+ci-fix)             | 35 (13 audit + 22 ci-fix)                                                                              |
| Closed (7d, audit+ci-fix)              | 22 (8 audit + 14 ci-fix)                                                                               |
| Closure Rate                           | ~63% (yellow, 50-80% band)                                                                             |
| Agent Success (has-pr / has-pr+failed) | n/a — 0 open in either bucket right now (queue currently clean, nothing stuck)                         |
| CI Pass (main)                         | 6/6 green observed this session (1 pre-existing + 5 merges this iteration)                             |
| Queue (ready)                          | 21 (22 before this iteration's claim of #3624)                                                         |
| Stale (ready>7d)                       | 0 (oldest ready issue, #3501, is ~4 days old)                                                          |
| Blocked (agent-failed)                 | 0                                                                                                      |
| Skipped (agent-skip)                   | 0                                                                                                      |
| Reverts (7d)                           | 1 (well under the >3/week alarm)                                                                       |
| Daily/7d Spend                         | not computable — `.claude/agent-spend/sessions.jsonl` is empty (0 bytes); ccusage not queried this run |

### Patterns

- **This iteration's implement-queue run did unusually heavy PR triage before any new issue work**: 5 pre-existing open PRs needed attention (4 clean+green → merged directly: #3636, #3637, #3638, #3640; 1 real merge conflict on generated `metrics/ai-antipattern-baselines.json` → resolved by regenerating via `check-ai-antipatterns.mjs --update` rather than hand-picking a count, gated, pushed). This is healthy churn, not backlog rot — all 5 PRs were same-day.
- **Zone-spread selector confirms its own known bug (#3629)**: ran `selectZoneSpreadBatch` for real against all 21 ready issues in priority order — 21/22 mapped to the GLOBAL zone (conventional-commit scopes like `ci`, `scripts`, `agents`, `build` aren't real workspace package dirs under `apps/packages/services`), so the "never co-schedule two globals" rule collapsed this iteration's batch to 1 issue even though 3 workers were available. This is the exact defect #3629 (already `ready`, not yet picked up) describes. Not a new regression — flagging as context for why this iteration's batch was 1, not 3.
- **`gh` CLI is unavailable in this environment** (confirmed again: `mbe check-model --issue`, `mbe issue transition` both fail with `spawn gh ENOENT`) — same root cause the `learning-loop` log has flagged since 2026-06-20. Worked around this run via `check-model <directive-text>` (no `--issue`) and `mcp__github__issue_write` directly for label transitions. Consider whether `@mbe/gh-client`/`mbe` CLI should grow a GitHub-MCP-backed code path for scheduled/remote sessions — this is now a confirmed recurring gap across at least 3 different skills (progress-tracker, learning-loop, implement-queue), not a one-off.

### Recommendations

- No new meta-improvement issue filed this run — both patterns above already have tracking issues open (`#3629` for zone-spread, and the `gh`-unavailable gap is called out repeatedly in the learning-loop log but has no dedicated issue yet). Recommend the _next_ `claude-automation-recommender` or `claude-md-improver` pass file a dedicated issue for "gh CLI unavailable in Claude Code Remote sessions" since it now spans 3+ skills and has been noted in the log 4+ times without a ticket.
- `.claude/agent-spend/sessions.jsonl` has been empty (0 bytes) for multiple runs — cost/spend metrics are structurally uncomputable until something writes to this file. Worth checking whether `recordSpend` is actually wired into the current agent invocation path.

### Skipped Issues

None (`agent-skip` count is 0).

## 2026-08-02

**queueEfficiency:** unavailable
**Issues filed:** 0

## 2026-08-02

**Sensors:** 5/15 available (acmm, prMetrics, ccusageCost, sessionLogs, codeChurn) — ciHealth, lighthouse, issues, issueFeedback, prCategoryMetrics, agentCost, mutationScore, flakyTests, e2eStability, queueEfficiency unavailable
**Regressions:** 0 detected, 0 issues created (status: Healthy — ACMM L5 95/114, code churn 0.3%)
**Verifications:** 0 checked (no sensor-labeled issues closed in last 48h)
**Sentry triage:** skipped (MCP server was mid-(re)connect for the duration of this run)
**Skill proposals:** 0 (Sunday — Friday-only)
**Threshold notes:** `verifications.jsonl` still doesn't exist, so false-positive/fix-effectiveness rates remain non-computable. `collect-ai-issue-feedback.mjs` failed again on its `gh` query ("Failed to query GitHub issues") — same pre-existing `gh`-CLI-unavailable gap noted 2026-06-20, 07-30, 07-31, 08-01 (fifth consecutive run); root cause remains `@mbe/gh-client` shelling out to the `gh` binary via `execFileSync`, absent in this scheduled-session environment. No action taken — pre-existing, non-blocking, zero regressions to triage. Also note: this checkout had no `node_modules` and no `packages/gh-client/dist` at run start — needed `pnpm install --frozen-lockfile` + `pnpm --dir packages/gh-client build` before `sensor-report.mjs` would load at all, consistent with the "fresh worktree" gotchas already documented for other scripts.

## 2026-08-03

### Metrics

| Metric                 | Value                                                                                                     | Target    | Status |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | --------- | ------ |
| Created (7d)           | 44 (audit+ci-fix)                                                                                         | -         | -      |
| Closed (7d)            | 30 (audit+ci-fix)                                                                                         | -         | -      |
| Closure Rate           | 68.2%                                                                                                     | >80%      | yellow |
| Time-to-Close          | mean 13.3h, max 94.2h                                                                                     | <24h      | green  |
| Agent Success          | has-pr:0 / agent-failed:0 at snapshot (queue was clean before this run's claim) — not meaningful this run | >70%      | n/a    |
| CI Pass                | 23/30 recent main runs success, 1 failure, 6 cancelled (superseded); 23/24 excl. cancelled = 95.8%        | >95%      | green  |
| Queue (ready)          | 38 open (41 before this run's implement-queue batch claim of 3)                                           | <5        | red    |
| Stale (>7d)            | 0 (oldest ready issue is 5 days old)                                                                      | 0         | green  |
| Blocked (agent-failed) | 0                                                                                                         | 0         | green  |
| Skipped (agent-skip)   | 0                                                                                                         | 0         | green  |
| Daily/7d Spend         | unavailable — `.claude/agent-spend/sessions.jsonl` is 0 bytes (empty since 2026-07-30)                    | <$10/<$50 | n/a    |
| Cost/Issue             | unavailable, same reason                                                                                  | <$2       | n/a    |
| Reverts (7d)           | 0 actual revert commits merged to main (2 grep hits were revert-_automation_ PRs, not real reverts)       | <3/wk     | green  |

### Patterns

- Backlog (`ready`) sits at 38 open, deep red against the <5 target — consistent with the 2026-08-02 weekly retro's "+49 backlog growth" note. This run's implement-queue iteration claimed 3 (#3634, #3635, #3641), all `ci-fix`, a small dent.
- Closure rate (68.2%) is below the 80% target but mean time-to-close is a healthy 13.3h — issues that do close, close fast; the gap is intake outpacing drain, not slow handling.
- `.claude/agent-spend/sessions.jsonl` is empty (0 bytes, unchanged since creation 2026-07-30) despite 90 PRs merged in the same 7d window. This exact symptom was already fixed twice before (#1830 closed 2026-06-19, #2974 closed 2026-07-03 — a single `recordSpend` seam in agent-core). The seam appears to have regressed, or the file was reset without repopulating. Filed a new meta-improvement issue (#3695) rather than reopening the closed ones, since this is a recurrence, not unfinished original work.
- `gh` CLI remains absent in this scheduled-session environment (confirmed again today: `mbe check-model`, `mbe issue transition` both failed with `spawn gh ENOENT`) — sixth+ consecutive occurrence of the gap first noted 2026-06-20. Already tracked by #3689 (filed 2026-08-02 by the weekly retro); worked around this run via GitHub MCP tools + manual label writes for the whole implement-queue iteration and the progress-tracker queries. Not re-filing.
- CI on main shows a ~20% cancellation rate in the last 30 runs (6/30) — likely concurrency-group supersession from rapid successive pushes on a fast-merging main, not real failures. Noting for trend-watching only, not actioned.
- Housekeeping note: a reviewer sub-agent dispatched against a PR diff checked out that PR's branch directly in the shared main checkout (`/home/user/mattbutlerengineering`) instead of using a disposable ref, leaving local `main` on a stray branch with an unrelated regenerated-timestamp diff twice during this run. Recovered both times by discarding the noise file and `git reset --hard origin/main` / `git checkout main` (verified clean/no unique local commits first). No repo state was affected (GitHub-side actions all went through the API/MCP tools, not local git), but future reviewer-agent prompts should tell them explicitly not to `git checkout` in the shared checkout.

### Recommendations

- Consider raising implement-queue's per-iteration batch size (currently capped at 3 by the evening routine) or running it more frequently — the queue backlog is ~8x the healthy target and closure rate is intake-bound, not throughput-bound.
- `#3689` (gh-client non-gh transport seam) is the single highest-leverage fix outstanding — it would restore `mbe check-model`, `mbe issue transition`, and the sensors this and other skills rely on, in one change. Still `ready`, deferred this run to keep the batch small/independent (ci-fix issues by age took priority).

### Skipped Issues

None (`agent-skip` count is 0).

### Meta-improvement filed

- #3695 — cost telemetry (`.claude/agent-spend/sessions.jsonl`) empty since 2026-07-30, third occurrence of a previously-fixed gap (#1830, #2974).

## 2026-08-03

**queueEfficiency:** unavailable
**Issues filed:** 0
