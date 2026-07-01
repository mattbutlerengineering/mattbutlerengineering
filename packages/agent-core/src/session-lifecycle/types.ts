import type { SessionConfig, SessionEvent, SessionResult, SessionStatus } from "../types.js";
import type { FeedbackLoopConfig } from "../types.js";

// ── Stored session ────────────────────────────────────────────────────

/** Inputs accepted when creating a new tracked session. */
export interface CreateSessionInput {
  readonly taskDescription: string;
  readonly baseBranch?: string;
  readonly model?: string;
  readonly maxTurns?: number;
  readonly maxBudgetUsd?: number;
  readonly createPr?: boolean;
  readonly userId?: string | null;
  readonly parentId?: string | null;
}

/** Terminal result fields merged into a session on a status transition. */
export interface SessionResultPatch {
  readonly branchName?: string;
  readonly prUrl?: string;
  readonly prNumber?: number;
  readonly resultText?: string;
  readonly costUsd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly numTurns?: number;
  readonly durationMs?: number;
  readonly errors?: readonly string[];
  readonly sdkSessionId?: string;
}

/** A persisted session as seen by the orchestrator (status is lowercase). */
export interface StoredSession {
  readonly id: string;
  readonly status: SessionStatus;
  readonly taskDescription: string;
  readonly baseBranch: string;
  readonly model: string;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
  readonly createPr: boolean;
  readonly userId?: string | null;
  readonly parentId?: string | null;
  readonly branchName?: string | null;
  readonly prUrl?: string | null;
  readonly prNumber?: number | null;
  readonly resultText?: string | null;
  readonly costUsd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly numTurns?: number;
  readonly durationMs?: number;
  readonly errors: readonly string[];
  readonly sdkSessionId?: string | null;
}

// ── Storage seam ──────────────────────────────────────────────────────

/**
 * The single injection point for persistence. A Prisma-backed adapter lives in
 * the service; an in-memory adapter ships here for the CLI and tests.
 */
export interface SessionLifecycleStore {
  /** Persist a new session in `pending` status and return it. */
  create(input: CreateSessionInput): Promise<StoredSession>;
  getById(id: string): Promise<StoredSession | null>;
  /**
   * Transition status and merge terminal result fields. Returns null if absent.
   *
   * When `opts.fromStatus` is given, the transition is a compare-and-swap: it
   * only applies if the session's current status is one of the given values.
   * A non-matching current status is a lost CAS — returns null without
   * mutating, instead of unconditionally overwriting.
   */
  updateStatus(
    id: string,
    status: SessionStatus,
    patch?: SessionResultPatch,
    opts?: { readonly fromStatus?: readonly SessionStatus[] }
  ): Promise<StoredSession | null>;
  /** Append a lifecycle/runtime event. Best-effort; never throws into the caller. */
  addEvent(id: string, type: string, data: Record<string, unknown>): Promise<void>;
}

// ── Event projection ──────────────────────────────────────────────────

export interface StoredEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

/** Projects a runtime SessionEvent to its stored shape, or null to drop it. */
export type EventProjector = (event: SessionEvent) => StoredEvent | null;

// ── Concurrency seam ──────────────────────────────────────────────────

/**
 * Structural subset of the service's SessionConcurrency. When injected,
 * `execute` reserves a slot on the pending→running edge and releases it on
 * every terminal edge.
 */
export interface ConcurrencyGate {
  readonly limit: number;
  acquire(sessionId: string): boolean;
  release(sessionId: string): void;
  activeCount(): number;
}

// ── Orchestrator ──────────────────────────────────────────────────────

export type RunSessionFn = (
  config: SessionConfig,
  onEvent?: (event: SessionEvent) => void
) => Promise<SessionResult>;

export interface SessionLifecycleDeps {
  readonly store: SessionLifecycleStore;
  readonly resolveRepoPath: () => string;
  /** Defaults to the real `runSession`. Injected as a fake in tests. */
  readonly runSession?: RunSessionFn;
  readonly concurrency?: ConcurrencyGate;
  /** Defaults to a passthrough projector. */
  readonly projectEvent?: EventProjector;
  readonly allowedTools?: readonly string[];
  readonly feedbackLoop?: FeedbackLoopConfig;
}

export interface SessionLifecycleOrchestrator {
  create(input: CreateSessionInput): Promise<StoredSession>;
  /**
   * Run a created session to a terminal state. Returns the SessionResult, or
   * null if the session is absent or was rejected by the concurrency gate.
   */
  execute(sessionId: string): Promise<SessionResult | null>;
  cancel(sessionId: string): Promise<boolean>;
  getActiveSessionCount(): number;
}
