// Core session runner
export { runSession } from "./session-runner.js";

// Worktree management
export {
  createWorktree,
  removeWorktree,
  cleanupWorktrees,
  commitChanges,
  pushBranch,
  hasChanges,
} from "./worktree-manager.js";

// PR creation
export {
  createPullRequest,
  buildPrTitle,
  buildPrBody,
} from "./pr-creator.js";

// Prompt building
export {
  buildSystemPrompt,
  loadProjectContext,
} from "./prompt-builder.js";

// Tool permissions
export { createToolPermissionHandler } from "./tool-permissions.js";

// Cost tracking
export {
  extractTokenUsage,
  extractCost,
  buildSessionResult,
} from "./cost-tracker.js";

// Types
export type {
  SessionConfig,
  SessionResult,
  SessionStatus,
  SessionEvent,
  SessionEventType,
  SessionEventCallback,
  TokenUsage,
  WorktreeInfo,
  PrResult,
  PrOptions,
} from "./types.js";

export { DEFAULT_SESSION_CONFIG } from "./types.js";

// Orchestrator
export { runOrchestrator } from "./orchestrator.js";

// Task decomposer (orchestrator config + prompt)
export {
  buildOrchestratorPrompt,
} from "./task-decomposer.js";

export type {
  OrchestratorConfig,
  OrchestratorResult,
} from "./task-decomposer.js";

export { DEFAULT_ORCHESTRATOR_CONFIG } from "./task-decomposer.js";
