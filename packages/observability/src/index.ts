export { initTelemetry } from "./sdk.js";
export type { OtelConfig } from "./sdk.js";

export { createRequestIdMiddleware, getRequestId, logWithRequestId } from "./request-id.js";

export { createReadinessTracker, registerStandardChecks } from "./readiness.js";

export { errorRatePlugin_, createErrorRateTracker, createErrorRateHealthCheck } from "./error-rates.js";
export type { EndpointErrorRate, ErrorRateSnapshot, ErrorRateHealthCheckResult } from "./error-rates.js";
export type {
  ReadinessTracker,
  ReadinessSnapshot,
  ReadinessCheckResult,
  ReadinessCheckFn,
  PrismaLike,
  StandardChecksOptions,
} from "./readiness.js";

export { createRateLimitMonitor } from "./rate-limit-monitor.js";
export type {
  RateLimitMonitor,
  RateLimitMonitorConfig,
  RateLimitHit,
  RateLimitHealthStats,
  RateLimitSnapshot,
} from "./rate-limit-monitor.js";
