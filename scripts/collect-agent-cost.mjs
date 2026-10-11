/**
 * Per-issue attribution collector for the single spend sink,
 * .claude/agent-spend/sessions.jsonl (owned by agent-core's recordSpend seam,
 * #2974). The legacy sibling .claude/agent-spend.jsonl file has been removed.
 *
 * The sink now captures every agent run (claude/gemini/opencode) recorded by
 * agent-core, so per-issue attribution is more complete than the old
 * mbe-agent-run-only file. For ground-truth Claude spend totals, still use the
 * ccusage sensor (`collectCcusageSensor`).
 *
 * This collector is intentionally scoped to per-issue attribution:
 *   - Which issues consumed how much budget?
 *   - How many attributed sessions ran this week?
 *   - What is the average cost per attributed session?
 *
 * DO NOT use the returned `spend_*_usd` fields as total Claude spend.
 *
 * Record schema (see SpendEntry in @mbe/agent-core spend-recorder.ts):
 *   { date, timestamp, costUsd, model, adapter, status,
 *     issueNumber?, sessionId?, inputTokens?, outputTokens?, numTurns? }
 *
 * BACKWARD-COMPAT: records without token/turn fields parse fine; those
 * fields default to 0 in aggregates.
 */

import { readFileSync, existsSync } from "node:fs";

/**
 * Parse a JSONL file, silently skipping malformed lines.
 * @param {string} filePath
 * @returns {unknown[]}
 */
function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Aggregate `/implement-queue` worker usage from queue-telemetry rows (#5885).
 *
 * Queue workers are Claude Code Agent-tool subagents: they never enter
 * agent-core, so `recordSpend` cannot see them and they never appear in the
 * spend sink. Their per-worker usage is the queue-telemetry row the
 * orchestrator already writes (`subagent_tokens`, `cost_usd`). It is read
 * here rather than copied into the sink, so each source owns its own rows
 * and nothing is counted twice.
 *
 * Cost is never estimated: the Agent tool reports tokens, not dollars, so
 * `cost_7d_usd` is null unless at least one row recorded a real `cost_usd`.
 *
 * @param {Array<object>|null|undefined} rows - queue-telemetry rows.
 * @param {Date} [now]
 * @returns {object|null} null when no in-window row carries usage.
 */
export function summarizeQueueSpend(rows, now = new Date()) {
  const since = now.getTime() - MS_PER_WEEK;
  const inWindow = (rows ?? []).filter(
    (r) => Date.parse(r?.claimed_at ?? r?.merged_at ?? "") >= since
  );
  const withUsage = inWindow.filter(
    (r) => typeof r.subagent_tokens === "number" || typeof r.cost_usd === "number"
  );
  if (withUsage.length === 0) return null;

  const costs = withUsage.filter((r) => typeof r.cost_usd === "number").map((r) => r.cost_usd);
  const costSum = costs.reduce((sum, c) => sum + c, 0);
  return {
    sessions_7d: withUsage.length,
    sessions_without_usage_7d: inWindow.length - withUsage.length,
    tokens_7d: withUsage.reduce((sum, r) => sum + (r.subagent_tokens ?? 0), 0),
    cost_7d_usd: costs.length > 0 ? Math.round(costSum * 100) / 100 : null,
    cost_known_sessions_7d: costs.length,
  };
}

/**
 * Aggregate per-issue attribution data from the spend sink.
 *
 * The returned `spend_*_usd` fields reflect the recorded agent-core runs
 * (per-issue attribution), NOT total Claude spend. `queue` — present only
 * when queue-telemetry rows carry usage — attributes `/implement-queue`
 * workers (#5885). Ground-truth totals come from the ccusage sensor.
 *
 * @param {string} spendPath - Absolute path to .claude/agent-spend/sessions.jsonl.
 * @param {Date} [now] - Reference timestamp (defaults to current time; injectable for tests).
 * @param {Array<object>|null} [queueRows] - queue-telemetry rows (#5885).
 * @returns {object} Aggregated attribution metrics or { available: false } when no data.
 */
export function collectAgentCost(spendPath, now = new Date(), queueRows = []) {
  const sevenDaysAgo = new Date(now - MS_PER_WEEK);
  const entries = readJsonl(spendPath);
  const queue = summarizeQueueSpend(queueRows, now);

  const sevenDayEntries = entries.filter((e) => {
    const entryDate = new Date(e.date || e.timestamp);
    return entryDate >= sevenDaysAgo;
  });

  if (sevenDayEntries.length === 0 && queue === null) return { available: false };

  const todayStr = now.toISOString().slice(0, 10);
  const todayEntries = entries.filter((e) => (e.date || e.timestamp || "").startsWith(todayStr));

  const totalSpend7d = sevenDayEntries.reduce((sum, e) => sum + (e.costUsd ?? e.cost_usd ?? 0), 0);
  const todaySpend = todayEntries.reduce((sum, e) => sum + (e.costUsd ?? e.cost_usd ?? 0), 0);

  // Token / turn aggregates — default 0 for legacy cost-only records
  const totalInputTokens7d = sevenDayEntries.reduce((sum, e) => sum + (e.inputTokens ?? 0), 0);
  const totalOutputTokens7d = sevenDayEntries.reduce((sum, e) => sum + (e.outputTokens ?? 0), 0);
  const totalTurns7d = sevenDayEntries.reduce((sum, e) => sum + (e.numTurns ?? 0), 0);

  return {
    available: true,
    // attribution_only signals that spend values cover only mbe-agent-run sessions.
    // For ground-truth total Claude spend, use the ccusage sensor.
    attribution_only: true,
    spend_today_usd: Math.round(todaySpend * 100) / 100,
    spend_7d_usd: Math.round(totalSpend7d * 100) / 100,
    sessions_7d: sevenDayEntries.length,
    avg_cost_per_session:
      sevenDayEntries.length > 0
        ? Math.round((totalSpend7d / sevenDayEntries.length) * 100) / 100
        : 0,
    total_input_tokens_7d: totalInputTokens7d,
    total_output_tokens_7d: totalOutputTokens7d,
    avg_turns_per_session: sevenDayEntries.length > 0 ? totalTurns7d / sevenDayEntries.length : 0,
    ...(queue ? { queue } : {}),
  };
}
