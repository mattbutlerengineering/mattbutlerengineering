/**
 * Pure collector for ccusage ground-truth token spend.
 *
 * Reads real Claude session spend via ccusage CLI (`npx -y ccusage@latest daily --json`)
 * and emits a structured spend shape into the sensor-report pipeline.
 *
 * ccusage JSON shape (daily command):
 *   {
 *     daily: [{
 *       period: "YYYY-MM-DD",
 *       totalCost: number,
 *       cacheReadTokens: number,
 *       inputTokens: number,
 *       cacheCreationTokens: number,
 *       outputTokens: number,
 *       modelBreakdowns: [{
 *         modelName: string,
 *         cost: number,
 *         inputTokens: number,
 *         outputTokens: number,
 *         cacheReadTokens: number,
 *         cacheCreationTokens: number,
 *       }]
 *     }]
 *   }
 *
 * The `readCcusage` reader is injected so the collector is unit-testable
 * without spawning ccusage. Degrades gracefully (available:false) when
 * ccusage or logs are absent — never throws.
 */

import { execFileSync } from "node:child_process";

/**
 * Default reader: spawns ccusage and returns parsed JSON or null on failure.
 * @returns {object|null}
 */
function defaultReadCcusage() {
  try {
    const raw = execFileSync("npx", ["-y", "ccusage@latest", "daily", "--json", "--no-cost"], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Collect ground-truth token spend from ccusage.
 *
 * @param {() => object|null} readCcusage - Injected reader (defaults to spawning ccusage).
 * @param {Date} [now] - Reference timestamp (defaults to current time; injectable for tests).
 * @returns {object} Aggregated spend metrics or { available: false } when ccusage is unavailable.
 */
export function collectCcusageSensor(readCcusage = defaultReadCcusage, now = new Date()) {
  let data;
  try {
    data = readCcusage();
  } catch {
    return { available: false };
  }

  if (!data || !Array.isArray(data.daily) || data.daily.length === 0) {
    return { available: false };
  }

  const todayStr = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const within30d = data.daily.filter((e) => {
    const d = new Date(e.period);
    return d >= thirtyDaysAgo;
  });

  const within7d = within30d.filter((e) => new Date(e.period) >= sevenDaysAgo);
  const today = within30d.filter((e) => e.period === todayStr);

  const sum = (entries, field) => entries.reduce((acc, e) => acc + (e[field] ?? 0), 0);

  const spend_today_usd = Math.round(sum(today, "totalCost") * 10000) / 10000;
  const spend_7d_usd = Math.round(sum(within7d, "totalCost") * 10000) / 10000;
  const spend_30d_usd = Math.round(sum(within30d, "totalCost") * 10000) / 10000;

  const cache_read_tokens = sum(within30d, "cacheReadTokens");
  const output_tokens = sum(within30d, "outputTokens");
  const cache_creation_tokens = sum(within30d, "cacheCreationTokens");
  const input_tokens = sum(within30d, "inputTokens");

  const tokenDenominator = cache_read_tokens + input_tokens + cache_creation_tokens;
  const cache_hit_rate =
    tokenDenominator > 0 ? Math.round((cache_read_tokens / tokenDenominator) * 10000) / 10000 : 0;

  // Aggregate per-model stats from modelBreakdowns within 30d window.
  const by_model = {};
  for (const entry of within30d) {
    for (const mb of entry.modelBreakdowns ?? []) {
      const name = mb.modelName;
      if (!name) continue;
      if (!by_model[name]) {
        by_model[name] = {
          cost: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
        };
      }
      const m = by_model[name];
      by_model[name] = {
        cost: m.cost + (mb.cost ?? 0),
        input_tokens: m.input_tokens + (mb.inputTokens ?? 0),
        output_tokens: m.output_tokens + (mb.outputTokens ?? 0),
        cache_read_tokens: m.cache_read_tokens + (mb.cacheReadTokens ?? 0),
        cache_creation_tokens: m.cache_creation_tokens + (mb.cacheCreationTokens ?? 0),
      };
    }
  }

  return {
    available: true,
    spend_today_usd,
    spend_7d_usd,
    spend_30d_usd,
    cache_read_tokens,
    output_tokens,
    cache_creation_tokens,
    cache_hit_rate,
    by_model,
  };
}
