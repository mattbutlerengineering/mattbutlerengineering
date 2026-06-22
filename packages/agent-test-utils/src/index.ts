// Mock Claude client
export { createMockClaudeClient, createMockQueryStream } from "./mock-claude-client.js";
export type {
  MockMode,
  MockTokenUsage,
  MockResultMessage,
  MockClientOptions,
  MockCallRecord,
  MockClaudeClient,
} from "./mock-claude-client.js";

// Session event fixtures
export {
  buildMinimalSuccessFixture,
  buildBugFixFixture,
  buildFailureFixture,
  createFixturePlayer,
  extractToolCalls,
  compareToolCalls,
  loadFixtureFromFile,
  serializeFixture,
} from "./session-fixtures.js";
export type {
  ToolCallRecord,
  FixtureOptions,
  FixturePlayer,
  ToolCallDiff,
} from "./session-fixtures.js";

// Worktree simulation
export {
  createWorktreeSimulator,
  createWorktreeMocks,
  assertOperationCalled,
  assertOperationNotCalled,
  CLEAN_REPO_FILES,
  DIRTY_REPO_FILES,
  CONFLICTED_REPO_FILES,
} from "./worktree-simulator.js";
export type {
  RepoState,
  SimulatedFile,
  WorktreeSimulatorOptions,
  WorktreeSimulator,
  WorktreeCallRecord,
  VerificationResult,
} from "./worktree-simulator.js";

// Cost estimation
export {
  estimateTokenCount,
  estimatePromptTokens,
  calculateCost,
  estimateSessionCost,
  createCostProfiler,
  wouldExceedBudget,
  estimateLatency,
  simulateLatency,
  MODEL_PRICING,
  DEFAULT_LATENCY_PROFILE,
} from "./cost-estimator.js";
export type {
  ModelPricing,
  TokenUsageInput,
  CostBreakdown,
  SessionCostProfile,
  CostProfilerSummary,
  CostProfiler,
  LatencyProfile,
} from "./cost-estimator.js";
