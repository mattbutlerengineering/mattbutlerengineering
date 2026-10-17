/**
 * Cost / model-tier source for the queue-telemetry reconciler (#6919).
 *
 * Two ledgers hold real spend; this joins them per issue:
 *   - docs/factory/costs.jsonl: Conductor runs, `{ wo: "#N", model, cost, ... }`
 *   - .claude/agent-spend/sessions.jsonl: agent-core `SpendEntry` rows, usable
 *     only when they carry a numeric `issueNumber`
 *
 * Cost is never estimated: a row with tokens but no dollar figure contributes
 * nothing, and a tier is never guessed from an unfamiliar model name.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const TIERS = ["haiku", "sonnet", "opus"];

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);

function addRun(index, issueNumber, costUsd, model) {
  if (!Number.isInteger(issueNumber) || !isNumber(costUsd)) return;
  const entry = index.get(issueNumber) ?? { costUsd: 0, models: [] };
  entry.costUsd += costUsd;
  if (typeof model === "string" && model && !entry.models.includes(model)) {
    entry.models.push(model);
  }
  index.set(issueNumber, entry);
}

/**
 * @param {{ factoryCosts?: unknown[], spendSessions?: unknown[] }} sources
 * @returns {Map<number, { costUsd: number, models: string[] }>}
 */
export function buildCostIndex({ factoryCosts = [], spendSessions = [] } = {}) {
  const index = new Map();
  for (const row of factoryCosts) {
    if (!row || typeof row !== "object") continue;
    const match = /^#(\d+)$/.exec(typeof row.wo === "string" ? row.wo : "");
    if (!match) continue;
    addRun(index, Number(match[1]), row.cost, row.model);
  }
  for (const row of spendSessions) {
    if (!row || typeof row !== "object") continue;
    addRun(index, row.issueNumber, row.costUsd, row.model);
  }
  return index;
}

/**
 * @param {string[]} models
 * @returns {"haiku"|"sonnet"|"opus"|null} null for an unknown family or mixed tiers
 */
export function modelTierFor(models) {
  if (!Array.isArray(models) || models.length === 0) return null;
  const tiers = new Set();
  for (const model of models) {
    const tier = TIERS.find((t) => typeof model === "string" && model.includes(t));
    if (!tier) return null;
    tiers.add(tier);
  }
  return tiers.size === 1 ? [...tiers][0] : null;
}

/**
 * @param {Map<number, { costUsd: number, models: string[] }>} index
 * @param {number} issueNumber
 * @returns {{ costUsd: number|null, modelTier: string|null, reason?: string }}
 */
export function lookupCost(index, issueNumber) {
  const entry = index.get(issueNumber);
  if (!entry) return { costUsd: null, modelTier: null, reason: "no-ledger-row" };
  const modelTier = modelTierFor(entry.models);
  return modelTier
    ? { costUsd: entry.costUsd, modelTier }
    : { costUsd: entry.costUsd, modelTier: null, reason: "unmapped-model" };
}

function readJsonl(path, readFile) {
  let text;
  try {
    text = readFile(path, "utf-8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * @param {{ root?: string, readFile?: (path: string, enc: string) => string }} [opts]
 */
export function loadCostIndex({ root = process.cwd(), readFile = readFileSync } = {}) {
  return buildCostIndex({
    factoryCosts: readJsonl(join(root, "docs/factory/costs.jsonl"), readFile),
    spendSessions: readJsonl(join(root, ".claude/agent-spend/sessions.jsonl"), readFile),
  });
}
