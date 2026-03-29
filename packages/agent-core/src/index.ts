// Audit inventory
export {
  buildInventory,
  loadInventory,
  saveInventory,
  mergeInventory,
  mapFilesToSurfaces,
  isNonAuditableFile,
  allFilesNonAuditable,
  findStalestZone,
  updateSurfaceScore,
  detectRegression,
  ZONES,
  BASE_URL,
  INVENTORY_VERSION,
} from "./audit-inventory.js";
export type {
  AuditInventory,
  AuditSurface,
  LighthouseScores,
  ScoreEntry,
  Zone,
  Regression,
} from "./audit-inventory.js";

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
export type { CreateWorktreeOptions } from "./worktree-manager.js";

// PR creation
export {
  createPullRequest,
  buildPrTitle,
  buildPrBody,
  buildFailurePrBody,
} from "./pr-creator.js";

// Dependency bump direct-merge
export { isTrivialDepBump, mergeDirectly } from "./dep-bump-merger.js";
export type { TrivialDepBumpResult } from "./dep-bump-merger.js";

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

// Stuck detection
export { createStuckDetector, DEFAULT_STUCK_CONFIG } from "./stuck-detector.js";
export type {
  StuckDetector,
  StuckDetectorConfig,
  StuckPattern,
  StuckPatternType,
} from "./stuck-detector.js";

// Success evaluation
export {
  evaluateSuccess,
  getGitDiff,
  shouldEvaluate,
  DEFAULT_EVALUATION_CONFIG,
} from "./success-evaluator.js";
export type {
  EvaluationResult,
  EvaluationConfig,
  ShouldEvaluateConfig,
} from "./success-evaluator.js";

// Failure memory
export {
  recordFailure,
  queryPastFailures,
  buildFailureContext,
  loadMemory as loadFailureMemory,
} from "./failure-memory.js";
export type {
  FailureRecord,
  FailureMemory,
} from "./failure-memory.js";

// Deploy verification
export {
  verifyDeployment,
  rollbackCloudflareWorker,
  getCloudflareWorkerVersion,
  DEFAULT_HEALTH_CHECKS,
  DEFAULT_VERIFICATION_CONFIG,
} from "./deploy-verifier.js";
export type {
  HealthCheck,
  HealthCheckResult,
  VerificationResult,
  VerificationConfig,
} from "./deploy-verifier.js";

// PR feedback loop
export {
  pollForFeedback,
  fetchUnresolvedComments,
  fetchCIFailures,
} from "./pr-feedback-poller.js";
export type {
  ReviewComment,
  CIFailure,
  FeedbackContext,
  PollResult,
} from "./pr-feedback-poller.js";

export { buildReviewFixPrompt } from "./feedback-prompt-builder.js";

// Event mapping
export { mapSdkMessage } from "./event-mapper.js";
export type {
  MappedEvent,
  ToolUseEvent,
  ToolResultEvent,
  AssistantTextEvent,
} from "./event-mapper.js";

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
  WorktreeMode,
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
