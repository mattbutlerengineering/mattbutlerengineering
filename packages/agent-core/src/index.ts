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
  runVerification,
} from "./worktree-manager.js";
export type {
  CreateWorktreeOptions,
  VerificationResult as PrePushVerification,
} from "./worktree-manager.js";

// Worktree cleanup-failure reaper
export { scheduleWorktreeReap } from "./worktree-reaper.js";
export type { ScheduleWorktreeReapOptions, ReapOutcome, ReaperLogger } from "./worktree-reaper.js";

// PR creation
export { createPullRequest, buildPrTitle, buildPrBody, buildFailurePrBody } from "./pr-creator.js";

// Dependency bump direct-merge
export { isTrivialDepBump, mergeDirectly } from "./dep-bump-merger.js";
export type { TrivialDepBumpResult } from "./dep-bump-merger.js";

// Prompt building
export { buildSystemPrompt, loadProjectContext, loadSourceFiles } from "./prompt-builder.js";
export type { SourceFileEntry } from "./prompt-builder.js";

// Tool permissions
export { createToolPermissionHandler, normalizeBashCommand } from "./tool-permissions.js";

// Cost tracking
export { extractTokenUsage, extractCost, buildSessionResult } from "./cost-tracker.js";

// Stuck detection
export { createStuckDetector, DEFAULT_STUCK_CONFIG } from "./stuck-detector.js";
export type {
  StuckDetector,
  StuckDetectorConfig,
  StuckPattern,
  StuckPatternType,
  StuckSeverity,
} from "./stuck-detector.js";

// Success evaluation
export { evaluateSuccess, getGitDiff, DEFAULT_EVALUATION_CONFIG } from "./success-evaluator.js";
export type {
  EvaluationResult,
  EvaluationConfig,
  EvaluateSuccessConfig,
} from "./success-evaluator.js";

// Evaluation skip policy (pure)
export { evaluationSkipDecision, countDiffLines } from "./evaluation-skip-policy.js";
export type { SkipPolicyInput, SkipReason, SkipDecision } from "./evaluation-skip-policy.js";

// Evaluation prompt builder (pure)
export {
  buildEvaluationPrompt,
  extractAcceptanceCriteria,
  extractExpectedFiles,
} from "./evaluation-prompt-builder.js";

// Diff review (AI code review before auto-merge)
export { reviewDiff, DEFAULT_REVIEW_CONFIG } from "./diff-reviewer.js";
export type { ReviewResult, ReviewConfig } from "./diff-reviewer.js";

// Failure memory
export {
  recordFailure,
  queryPastFailures,
  buildFailureContext,
  loadMemory as loadFailureMemory,
} from "./failure-memory.js";
export type { FailureRecord, FailureMemory } from "./failure-memory.js";

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
export { pollForFeedback, fetchUnresolvedComments, fetchCIFailures } from "./pr-feedback-poller.js";
export type {
  ReviewComment,
  CIFailure,
  FeedbackContext,
  PollResult,
} from "./pr-feedback-poller.js";

export { buildReviewFixPrompt } from "./feedback-prompt-builder.js";

// Feedback loop (PR review + CI fix cycle)
export { runFeedbackLoop } from "./feedback-loop.js";
export type { FeedbackLoopParams, FeedbackLoopResult } from "./feedback-loop.js";

// Event mapping
export { mapSdkMessage } from "./event-mapper.js";
export type {
  MappedEvent,
  ToolUseEvent,
  ToolResultEvent,
  AssistantTextEvent,
  TurnMetricsEvent,
} from "./event-mapper.js";

// Observability — failure categorization, OTel spans, metrics builders
export {
  categorizeFailure,
  buildTurnMetricsList,
  buildToolCallMetricsList,
  withModelSelectionSpan,
  withToolPermissionSpan,
  withStuckDetectionSpan,
  withSuccessEvaluationSpan,
  observabilityTracer,
} from "./observability.js";

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
  FeedbackLoopConfig,
  FailureCategory,
  TurnMetrics,
  ToolCallMetrics,
  HeartbeatConfig,
} from "./types.js";

export {
  DEFAULT_SESSION_CONFIG,
  DEFAULT_FEEDBACK_LOOP_CONFIG,
  DEFAULT_HEARTBEAT_CONFIG,
} from "./types.js";

// Orchestrator
export { runOrchestrator } from "./orchestrator.js";

// Task decomposer (orchestrator config + prompt)
export { buildOrchestratorPrompt } from "./task-decomposer.js";

export type { OrchestratorConfig, OrchestratorResult } from "./task-decomposer.js";

export { DEFAULT_ORCHESTRATOR_CONFIG } from "./task-decomposer.js";

// Task signal registry (unified keyword classification: tier/domains/bundles)
export { classifyTask } from "./task-signal-registry.js";
export type { TaskTier, TaskDomain, TaskSignals } from "./task-signal-registry.js";

// Source file resolution (parses task descriptions for file paths)
export { resolveSourceFiles, classifyTaskContexts } from "./source-resolver.js";

// Budget and model calculation (scales budget/model based on task complexity)
export {
  resolveBudget,
  resolveModel,
  fetchRecentPrExamples,
  formatPrExamples,
} from "./budget-calculator.js";

// Intent extraction
export { extractIssueIntent, IssueIntentSchema } from "./intent-extractor.js";
export type { IssueIntent } from "./intent-extractor.js";

// Model routing
export {
  routeModel,
  routeModelWithReason,
  resolveModelId,
  getFeedbackLoopModel,
} from "./model-router.js";
export type { ModelTier, IssueInput, ModelRoutingResult, RoutingContext } from "./model-router.js";

// Model registry (canonical IDs + tier defaults)
export { MODEL_IDS, TIER_DOWNGRADE } from "./model-registry.js";

// PR risk classification
export { isLowRiskPR, reviewersForDiff } from "./pr-risk-classifier.js";

// Change-type classification (ship-loop phase gating)
export {
  classifyChanges,
  shouldSkipPhase,
  formatClassification,
} from "./change-type-classifier.js";
export type { ChangeType, ChangeClassification, SkippablePhase } from "./change-type-classifier.js";

// Static diff analysis (fast pre-check)
export { analyzeDiff, formatViolations, ANALYSIS_RULES } from "./diff-static-analyzer.js";
export type { StaticAnalysisResult, Violation, AnalysisRule } from "./diff-static-analyzer.js";

// Circuit breaker (API call protection)
export { CircuitBreaker } from "./circuit-breaker.js";
export { CircuitState } from "./circuit-breaker.js";
export type { CircuitBreakerOptions } from "./circuit-breaker.js";

// Retry utilities
export {
  withRetry,
  isTransientError,
  isContextWindowExhausted,
  calculateDelay,
  ContextWindowExhaustedError,
  DEFAULT_RETRY_CONFIG,
} from "./retry.js";
export type { RetryConfig, RetryResult } from "./retry.js";

// QA tuning — adaptive thresholds from .github/auto-qa-tuning.json
export { loadQaTuning, parseThresholds, applyTuningDefaults } from "./qa-tuning-loader.js";
export type { QaTuningThresholds, QaTuningConfig } from "./qa-tuning-loader.js";

// Output sanitization (XSS prevention for AI-generated content)
export { escapeHtml, sanitizeStreamChunk, createSanitizedStream } from "./sanitize-output.js";

// Bundle size tracking
export {
  measureAppBundleSize,
  measureAllBundles,
  loadBaseline,
  saveBaseline,
  compareWithBaseline,
  formatReport,
} from "./bundle-size-tracker.js";
export type {
  BundleSizeEntry,
  FileSize,
  BundleSizeBaseline,
  BundleSizeComparison,
  BundleSizeReport,
} from "./bundle-size-tracker.js";

// Synthetic bug seeding (chaos-agent testing)
export {
  seedSyntheticBug,
  cleanupSyntheticBugBranch,
  createLintViolationBug,
  createDeadLinkBug,
  createA11yBug,
} from "./synthetic-bug-seeder.js";
export type { BugType, SyntheticBugConfig, BugSeedResult } from "./synthetic-bug-seeder.js";

// Revert detection (revert-rca-loop)
export {
  detectRecentReverts,
  detectAiAuthorReverts,
  isPrAiAuthor,
  extractPrNumberFromMessage,
  getCommitDetails,
  formatRevertForIssue,
} from "./revert-detector.js";
export type { RevertCommit, RevertedPR } from "./revert-detector.js";

// Quality gate interface, runner, and built-in gate implementations
export { GateRunner } from "./gate-runner.js";
export type { GateRunResult, QualityGate } from "./gate-runner.js";
export { StaticAnalysisGate } from "./gates/static-analysis-gate.js";
export { LlmEvaluationGate } from "./gates/llm-evaluation-gate.js";
export { SecurityReviewGate } from "./gates/security-review-gate.js";

// Golden-task eval harness — run fixed benchmark tasks through the agent and score them
export { loadSuite } from "./eval/golden-task-set.js";
export { scoreTask } from "./eval/task-scorer.js";
export { runEvalSuite } from "./eval/eval-harness.js";
export type { RunEvalSuiteOptions } from "./eval/eval-harness.js";
export { taskSchema, rubricSchema, taskBudgetSchema, TASK_CATEGORIES } from "./eval/types.js";
export type {
  Task,
  TaskCategory,
  Rubric,
  TaskBudget,
  DeterministicChecks,
  TaskRunResult,
  TaskScore,
  TaskRunner,
  EvalAggregate,
  EvalReport,
} from "./eval/types.js";

// Reviewer contract (multi-agent quality gates)
export type {
  ReviewInput,
  ReviewIssue,
  ReviewIssueCategory,
  ReviewScore,
  ReviewVerdict,
  ReviewOutcome,
  ReviewRetryAction,
  ReviewRetryPolicy,
} from "./reviewer-contract.js";

export { PASS_THRESHOLD, DEFAULT_REVIEW_RETRY_POLICY } from "./reviewer-contract.js";
