import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// ── Types ───────────────────────────────────────────────────────────

export interface FailureRecord {
  readonly taskDescription: string;
  readonly timestamp: string;
  readonly stuckPattern?: string;
  readonly errors: readonly string[];
  readonly approach: string;
}

export interface FailureMemory {
  readonly records: readonly FailureRecord[];
}

// ── Storage ─────────────────────────────────────────────────────────

const DEFAULT_MEMORY_PATH = ".agent-memory/failures.json";

async function loadMemory(repoPath: string): Promise<FailureMemory> {
  const filePath = join(repoPath, DEFAULT_MEMORY_PATH);
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as FailureMemory;
  } catch {
    return { records: [] };
  }
}

async function saveMemory(
  repoPath: string,
  memory: FailureMemory
): Promise<void> {
  const filePath = join(repoPath, DEFAULT_MEMORY_PATH);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(memory, null, 2));
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Record a failed session for future reference.
 * Keeps the most recent 100 records to prevent unbounded growth.
 */
export async function recordFailure(
  repoPath: string,
  record: FailureRecord
): Promise<void> {
  const memory = await loadMemory(repoPath);
  const updatedRecords = [...memory.records, record].slice(-100);
  await saveMemory(repoPath, { records: updatedRecords });
}

/**
 * Find past failures with similar task descriptions.
 * Uses simple word overlap scoring — good enough for our use case.
 */
export function queryPastFailures(
  memory: FailureMemory,
  taskDescription: string,
  maxResults = 3
): readonly FailureRecord[] {
  const queryWords = new Set(
    taskDescription.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  if (queryWords.size === 0) return [];

  const scored = memory.records.map((record) => {
    const recordWords = new Set(
      record.taskDescription.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );
    const overlap = [...queryWords].filter((w) => recordWords.has(w)).length;
    const score = overlap / Math.max(queryWords.size, recordWords.size);
    return { record, score };
  });

  return scored
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.record);
}

/**
 * Build a system prompt appendix from past failures.
 */
export function buildFailureContext(
  pastFailures: readonly FailureRecord[]
): string {
  if (pastFailures.length === 0) return "";

  const lines = [
    "",
    "## Past Failure Context",
    "",
    "Previous attempts at similar tasks failed. Learn from these and try a different approach:",
    "",
  ];

  for (const failure of pastFailures) {
    lines.push(`- **Task**: ${failure.taskDescription}`);
    if (failure.stuckPattern) {
      lines.push(`  - Stuck pattern: ${failure.stuckPattern}`);
    }
    if (failure.errors.length > 0) {
      lines.push(`  - Errors: ${failure.errors.join("; ")}`);
    }
    if (failure.approach) {
      lines.push(`  - Approach tried: ${failure.approach}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export { loadMemory };
