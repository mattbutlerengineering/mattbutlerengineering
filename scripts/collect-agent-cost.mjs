/**
 * Pure collector for agent cost telemetry from .claude/agent-spend.jsonl.
 *
 * Extracted from sensor-report.mjs so it can be unit-tested without the
 * @mbe/gh-client dependency and without triggering the sensor-report runner.
 *
 * Record schema (appended by log-agent-cost.js and mbe agent run):
 *   { date, timestamp, costUsd, issueNumber, model }          // legacy
 *   { date, timestamp, costUsd, issueNumber, model,           // v2 (this PR)
 *     inputTokens, outputTokens, numTurns }
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

/**
 * Aggregate agent cost telemetry from agent-spend.jsonl.
 *
 * @param {string} spendPath - Absolute path to the .claude/agent-spend.jsonl file.
 * @param {Date} [now] - Reference timestamp (defaults to current time; injectable for tests).
 * @returns {object} Aggregated metrics or { available: false } when no data.
 */
export function collectAgentCost(spendPath, now = new Date()) {
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const entries = readJsonl(spendPath);
  if (entries.length === 0) return { available: false };

  const sevenDayEntries = entries.filter((e) => {
    const entryDate = new Date(e.date || e.timestamp);
    return entryDate >= sevenDaysAgo;
  });

  if (sevenDayEntries.length === 0) return { available: false };

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
  };
}
