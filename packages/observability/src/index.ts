export { initTelemetry } from "./sdk.js";
export type { OtelConfig } from "./sdk.js";

export {
  createRequestIdMiddleware,
  getRequestId,
  logWithRequestId,
} from "./request-id.js";

export {
  createBaggageContext,
  extractAgentBaggage,
  BAGGAGE_KEYS,
} from "./baggage.js";
export type { AgentBaggage } from "./baggage.js";

export { createReadinessTracker } from "./readiness.js";

export { errorRatePlugin_, createErrorRateTracker } from "./error-rates.js";
export type {
  EndpointErrorRate,
  ErrorRateSnapshot,
} from "./error-rates.js";
export type {
  ReadinessTracker,
  ReadinessSnapshot,
  ReadinessCheckResult,
  ReadinessCheckFn,
} from "./readiness.js";

export { createRateLimitMonitor } from "./rate-limit-monitor.js";
export type {
  RateLimitMonitor,
  RateLimitMonitorConfig,
  RateLimitHit,
  RateLimitHealthStats,
  RateLimitSnapshot,
} from "./rate-limit-monitor.js";
