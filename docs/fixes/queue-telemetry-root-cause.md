# queue-telemetry-freshness [1/5]: root cause (#5920)

Evidence gathered against `origin/main` at `07d76c940` (2026-10-10). Investigation only; the fix is #5921.

## Verdict

The premise in #5920 ("one commit in its entire history") is wrong, and the real fault is different.

1. **The pipe is not broken.** `metrics/queue-telemetry.jsonl` has 194 commits on `main` since it was added in `ea6854c92` (2026-07-28), 17 of them since 2026-09-21. The last row landed in `c985f28c5` (#6147, 2026-10-07 19:13 PDT). `198563827` (#5698), named in the issue as the one-time backfill, does not touch the file (it changes log.md, ai-health-trends.json, sensor-report.\*, process-metrics.jsonl). `446666e44` (#5718) and `0f9ae0e2f` (#5743) also do not touch it, which is correct: they are optimize/progress-tracker runs, not queue sessions.
2. **Write and commit are manual and session-bound.** `appendTelemetryRow` is called from a session (`scripts/orchestrate.mjs:51,186-195`, `.claude/skills/implement-queue/SKILL.md:135-166`). It is committed only by the prose step "Persist telemetry before stopping" (`SKILL.md:385`, added in `ea6854c92`). No workflow or scheduled job writes this file. The `chore(metrics): queue telemetry <date>` PRs are all session-opened (`git log -- metrics/queue-telemetry.jsonl`), so the claim that no such PR exists is also false. Rows exist only for days a session ran `/implement-queue` and followed Phase 4.
3. **Result: gaps equal days with no such session.** Row days (by `claimed_at`) since 2026-09-10: through 09-21, then 09-27, 09-28, 09-29, 09-30, 10-05, 10-07, 10-08. Nothing for 09-22 to 09-26, 10-01 to 10-04, 10-06, or 10-09 onward, although `main` took hundreds of first-parent commits in that window. `docs/routines/mbe-midday.md`, `mbe-night.md` and `mbe-evening.md` (step 1 of each) are the only scheduled callers of `/implement-queue`. Per Matt's memory note, mbe-midday and mbe-night were paused 2026-09-25 because their MCP auto-merge raced the local merge train; that is not recorded in the repo, so it is a strong but unverified contributor. The gap began 09-22, before the pause, so the pause is not the whole story.
4. **Structural, not a code bug.** Nothing is swallowed. `appendTelemetryRow` and `merge=union` (`.gitattributes:4`) work, and `metrics/**`-only PRs pass `isLowRiskPR` (`packages/agent-core/src/pr-risk-classifier.ts:22`), so the fast path does not drop them. The weakness is that persistence depends on a human-followed instruction in an ephemeral session, with no scheduled backstop and no freshness check (`queue-telemetry` is absent from `scripts/metrics-freshness.mjs`, which is #5922).

## The `review_coverage` trend is a second, separate fault

`metrics/process-metrics.jsonl` `queueEfficiency.sub_metrics.review_coverage` read 0.167 (09-22), 0.188 (09-23), 0 (09-24), and then the sensor stopped producing numbers: `available:false, reason:"credential_rejected"` on 09-27 to 09-30, and `reason:"query_error"` on 10-04 to 10-08. Those failures come from the sensor's GitHub query failing in the sessions that ran it (the `gh`-less or token-scoped class in `.claude/rules/gotchas.md` § Claude Code Remote), not from missing telemetry rows. Fixing row collection alone will not restore the metric.

## Reconcile path

Seven rows are still `merged:null` (issues 5259, 6030, 6093, 6065, 5955, 5840, 5981). Five post-date the last `/optimize-implement-queue` reconcile (10-07 and 10-08 claims); 5259 and 6093 are older stragglers. Reconcile is not the cause of missing rows.

## Implications for #5921

- Do not assume a dead pipe. The in-session append works and is committed whenever a session follows Phase 4.
- A scheduled collector (the `metrics-collectors.yml` pattern) closes the "no session ran" gap but cannot recover in-session fields (tokens, tool_uses, duration_ms), so those rows would be lower fidelity.
- Make Phase 4 persistence automatic rather than prose, and land #5922 so a gap becomes visible.
