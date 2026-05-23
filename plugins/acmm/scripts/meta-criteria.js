import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function loadJsonl(filePath) {
  if (!existsSync(filePath)) return null;
  try {
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
  } catch {
    return null;
  }
}

function hasRecentEntries(entries, maxAgeMs) {
  if (!entries || entries.length === 0) return false;
  const cutoff = Date.now() - maxAgeMs;
  return entries.some((e) => {
    const ts = e.timestamp ?? e.date;
    return ts && new Date(ts).getTime() >= cutoff;
  });
}

export function checkThresholdTuning(root) {
  const entries = loadJsonl(join(root, "metrics", "threshold-changes.jsonl"));
  if (!entries) return { passed: false, evidence: "metrics/threshold-changes.jsonl not found" };
  if (!hasRecentEntries(entries, THIRTY_DAYS_MS)) {
    return { passed: false, evidence: `${entries.length} entries but none in last 30 days` };
  }
  const recent = entries.filter(
    (e) => new Date(e.date ?? e.timestamp).getTime() >= Date.now() - THIRTY_DAYS_MS
  );
  return { passed: true, evidence: `${recent.length} threshold adjustment(s) in last 30 days` };
}

export function checkInstructionEvolution(root) {
  const entries = loadJsonl(join(root, "metrics", "instruction-changes.jsonl"));
  if (!entries) return { passed: false, evidence: "metrics/instruction-changes.jsonl not found" };
  if (!hasRecentEntries(entries, THIRTY_DAYS_MS)) {
    return { passed: false, evidence: `${entries.length} entries but none in last 30 days` };
  }
  const recent = entries.filter(
    (e) => new Date(e.date ?? e.timestamp).getTime() >= Date.now() - THIRTY_DAYS_MS
  );
  return { passed: true, evidence: `${recent.length} instruction change(s) in last 30 days` };
}

export function checkProcessMetrics(root) {
  const entries = loadJsonl(join(root, "metrics", "process-metrics.jsonl"));
  if (!entries) return { passed: false, evidence: "metrics/process-metrics.jsonl not found" };
  if (!hasRecentEntries(entries, SEVEN_DAYS_MS)) {
    return { passed: false, evidence: `${entries.length} entries but none in last 7 days` };
  }
  return { passed: true, evidence: `process metrics collected within last 7 days` };
}

export function checkFpRate(root) {
  const entries = loadJsonl(join(root, "metrics", "process-metrics.jsonl"));
  if (!entries || entries.length === 0) {
    return { passed: false, evidence: "no process metrics available" };
  }
  const latest = entries[entries.length - 1];
  if (latest.fp_rate === null || latest.fp_rate === undefined) {
    return { passed: false, evidence: "latest FP rate is null" };
  }
  if (latest.fp_rate >= 30) {
    return { passed: false, evidence: `FP rate ${latest.fp_rate}% >= 30% threshold` };
  }
  return { passed: true, evidence: `FP rate ${latest.fp_rate}% < 30%` };
}

/**
 * Check whether at least one improvement-labeled issue or PR was closed/merged
 * in the last 30 days. Reads from `metrics/improvement-activity.jsonl` (populated
 * by `scripts/collect-improvement-activity.mjs`); falls back to querying the `gh`
 * CLI directly when the file is absent.
 *
 * @param {string} root - repo root
 * @param {{ execFileSyncFn?: Function }} [opts] - injectable for testing
 * @returns {{ passed: boolean, evidence: string }}
 */
export function checkProductImprovements(root, opts = {}) {
  // Fast path: read from pre-collected metrics file
  const metricsFile = join(root, "metrics", "improvement-activity.jsonl");
  const entries = loadJsonl(metricsFile);
  if (entries !== null) {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const recent = entries.filter((e) => {
      const ts = e.closedAt ?? e.mergedAt ?? e.date ?? e.timestamp;
      return ts && new Date(ts).getTime() >= cutoff;
    });
    if (recent.length === 0) {
      return {
        passed: false,
        evidence: `${entries.length} improvement entries found but none in last 30 days`,
      };
    }
    return {
      passed: true,
      evidence: `${recent.length} improvement(s) shipped in last 30 days`,
    };
  }

  // Fallback: query gh CLI directly
  const fn = opts.execFileSyncFn ?? execFileSync;
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const allItems = [];

  for (const [cmd, args] of [
    [
      "gh",
      [
        "issue",
        "list",
        "--label",
        "improvement",
        "--state",
        "closed",
        "--limit",
        "50",
        "--json",
        "number,title,closedAt,url",
      ],
    ],
    [
      "gh",
      [
        "pr",
        "list",
        "--label",
        "improvement",
        "--state",
        "merged",
        "--limit",
        "50",
        "--json",
        "number,title,mergedAt,url",
      ],
    ],
  ]) {
    try {
      const out = fn(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) allItems.push(...parsed);
    } catch {
      // gh unavailable or label not found — skip
    }
  }

  if (allItems.length === 0) {
    return { passed: false, evidence: "no improvement-labeled issues or PRs found via gh CLI" };
  }

  const recent = allItems.filter((item) => {
    const ts = item.closedAt ?? item.mergedAt;
    return ts && new Date(ts).getTime() >= cutoff;
  });

  if (recent.length === 0) {
    return {
      passed: false,
      evidence: `${allItems.length} improvement items found but none closed/merged in last 30 days`,
    };
  }

  return {
    passed: true,
    evidence: `${recent.length} improvement(s) shipped in last 30 days`,
  };
}

export const META_CRITERIA = [
  {
    id: "meta:threshold-tuning",
    source: "meta",
    level: 6,
    category: "self-improvement",
    name: "Threshold self-tuning",
    description: "System adjusted its own QA thresholds based on observed outcomes in last 30 days",
    scannable: false,
    detection: { type: "active", pattern: "metrics/threshold-changes.jsonl" },
    check: checkThresholdTuning,
  },
  {
    id: "meta:instruction-evolution",
    source: "meta",
    level: 6,
    category: "self-improvement",
    name: "Instruction evolution",
    description: "System updated its own instructions from learned patterns in last 30 days",
    scannable: false,
    detection: { type: "active", pattern: "metrics/instruction-changes.jsonl" },
    check: checkInstructionEvolution,
  },
  {
    id: "meta:process-metrics",
    source: "meta",
    level: 6,
    category: "self-improvement",
    name: "Process metrics tracked",
    description: "Operational metrics (FP rate, cost, time-to-fix) collected within last 7 days",
    scannable: false,
    detection: { type: "active", pattern: "metrics/process-metrics.jsonl" },
    check: checkProcessMetrics,
  },
  {
    id: "meta:fp-rate-healthy",
    source: "meta",
    level: 6,
    category: "self-improvement",
    name: "False positive rate healthy",
    description: "Latest false positive rate below 30%",
    scannable: false,
    detection: { type: "active", pattern: "metrics/process-metrics.jsonl" },
    check: checkFpRate,
  },
  {
    id: "meta:product-improvements",
    source: "meta",
    level: 6,
    category: "self-improvement",
    name: "Proactive product improvements shipped",
    description: "At least one improvement-labeled issue merged in last 30 days",
    scannable: false,
    detection: { type: "active", pattern: "metrics/improvement-activity.jsonl" },
    check: checkProductImprovements,
  },
];
