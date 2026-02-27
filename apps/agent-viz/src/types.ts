// ── Session types (mirrors @mbe/types but decoupled from backend) ────

export type SessionStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface Session {
  readonly id: string;
  readonly status: SessionStatus;
  readonly taskDescription: string;
  readonly branchName: string | null;
  readonly baseBranch: string;
  readonly model: string;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
  readonly prUrl: string | null;
  readonly prNumber: number | null;
  readonly resultText: string | null;
  readonly costUsd: number | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly numTurns: number | null;
  readonly durationMs: number | null;
  readonly errors: string[];
  readonly parentId: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SessionEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly createdAt: string;
}

// ── Visualizer-specific types ───────────────────────────────────────

export interface SessionTree {
  readonly parent: Session;
  readonly children: readonly Session[];
}

export type NodeId =
  | "orchestrator"
  | "session-api"
  | "agent-core"
  | "claude-sdk"
  | "git"
  | "github";

export interface MessageParticle {
  readonly id: string;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly color: string;
  readonly event: SessionEvent;
}
