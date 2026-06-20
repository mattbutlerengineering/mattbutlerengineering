import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export interface CostEntry {
  readonly timestamp: string;
  readonly costUsd: number;
  readonly issueNumber?: number | null;
  readonly model?: string;
  readonly sessionId?: string;
  readonly status?: string;
}

export interface CostEntryInput {
  readonly costUsd: number;
  readonly issueNumber?: number | null;
  readonly model?: string;
  readonly sessionId?: string;
  readonly status?: string;
}

const SPEND_DIR = ".claude/agent-spend";
const SPEND_FILE = "sessions.jsonl";

/**
 * Append a cost entry to .claude/agent-spend/sessions.jsonl.
 *
 * Called automatically by runSession() after every session (success or fail)
 * so the progress-tracker and learning-loop sensors have accurate spend data.
 */
export function recordSessionCost(repoPath: string, input: CostEntryInput): void {
  const dir = join(repoPath, SPEND_DIR);
  const filePath = join(dir, SPEND_FILE);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const entry: CostEntry = {
    timestamp: new Date().toISOString(),
    costUsd: input.costUsd,
    ...(input.issueNumber !== undefined ? { issueNumber: input.issueNumber } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };

  appendFileSync(filePath, JSON.stringify(entry) + "\n");
}
