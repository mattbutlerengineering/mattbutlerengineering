// Test doubles for agent-core consumers. Exposed as `@mbe/agent-core/testing`;
// deliberately NOT re-exported from agent-core's root index.
export { createMockQueryStream } from "./mock-query-stream.js";
export { buildBugFixFixture } from "./session-fixtures.js";
export type { ToolCallRecord, FixtureOptions } from "./session-fixtures.js";
export { calculateCost, MODEL_PRICING } from "./cost-estimator.js";
export type { ModelPricing, TokenUsageInput, CostBreakdown } from "./cost-estimator.js";
