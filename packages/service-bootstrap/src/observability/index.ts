export { initTelemetry } from "./sdk.js";
export type { OtelConfig } from "./sdk.js";

export { createRequestIdMiddleware } from "./request-id.js";

export { createReadinessTracker, registerStandardChecks } from "./readiness.js";
export {
  buildJwksUrl,
  resolveJwksUrl,
  probeJwks,
  AUTH0_UNCONFIGURED_MESSAGE,
} from "./auth0-jwks.js";

export {
  errorRatePlugin_,
  createErrorRateTracker,
  createErrorRateHealthCheck,
} from "./error-rates.js";
export type {
  EndpointErrorRate,
  ErrorRateSnapshot,
  ErrorRateHealthCheckResult,
} from "./error-rates.js";
export type {
  ReadinessTracker,
  ReadinessSnapshot,
  ReadinessCheckResult,
  ReadinessCheckFn,
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
