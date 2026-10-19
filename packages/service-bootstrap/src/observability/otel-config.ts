/**
 * The three states a process can be in with respect to OpenTelemetry.
 *
 * `unconfigured` is the one this module exists to name: the SDK is enabled but
 * no OTLP destination is set, which is where all three production services
 * actually sat. Before this existed the code branched two ways and treated
 * "enabled" as "has somewhere to send", so an unconfigured process built
 * exporters pointed at http://localhost:4318 and retried a refused connection
 * on every export tick.
 */
export type TelemetryMode = "disabled" | "unconfigured" | "exporting";

export interface TelemetryPlan {
  readonly mode: TelemetryMode;
  readonly exportTraces: boolean;
  readonly exportMetrics: boolean;
  /** One log-safe line naming which KEY decided the mode. Never a value. */
  readonly reason: string;
}

const ENDPOINT_KEY = "OTEL_EXPORTER_OTLP_ENDPOINT";
const TRACES_ENDPOINT_KEY = "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT";
const METRICS_ENDPOINT_KEY = "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT";
const DISABLED_KEY = "OTEL_SDK_DISABLED";

/**
 * True when the key is present and not whitespace-only.
 *
 * Deliberately mirrors `getStringFromEnv` in @opentelemetry/core@2.10.0
 * (build/src/platform/node/environment.js:38-44), which returns `undefined`
 * for a whitespace-only value. If this predicate disagreed with the exporter's
 * own reading, the plan would report a mode the process is not in.
 */
function isSet(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key];
  return raw != null && raw.trim() !== "";
}

/**
 * True only for a trimmed, lowercased "true".
 *
 * Mirrors `getBooleanFromEnv` in the same file (lines 55-73), which does
 * `raw?.trim().toLowerCase()` and accepts only "true"/"false". This is wider
 * than the `=== "true"` it replaces: `OTEL_SDK_DISABLED=TRUE` used to make
 * NodeSDK's own `_disabled` true while our branch stayed false, so the two
 * disagreed about the mode the process was in.
 */
function isDisabled(env: NodeJS.ProcessEnv): boolean {
  return env[DISABLED_KEY]?.trim().toLowerCase() === "true";
}

/**
 * Turns an environment into the single answer to "what should this process do
 * with telemetry?". Pure: no I/O, no throw, total — every input yields a plan.
 *
 * Deliberately does NOT validate that an endpoint is reachable or well-formed.
 * A malformed URL is the exporter's problem and OTel already logs and falls
 * back on it. This decides *whether* there is a destination, never *where* —
 * endpoint, headers, timeout and path suffix stay owned by the OTel SDK's own
 * env resolution, including its rule that a signal-specific endpoint wins over
 * the generic one (@opentelemetry/otlp-exporter-base,
 * otlp-node-http-env-configuration.js:62-75).
 */
export function resolveTelemetryPlan(env: NodeJS.ProcessEnv = process.env): TelemetryPlan {
  if (isDisabled(env)) {
    return {
      mode: "disabled",
      exportTraces: false,
      exportMetrics: false,
      reason: `${DISABLED_KEY} is set`,
    };
  }

  const genericSet = isSet(env, ENDPOINT_KEY);
  const tracesKey = isSet(env, TRACES_ENDPOINT_KEY)
    ? TRACES_ENDPOINT_KEY
    : genericSet
      ? ENDPOINT_KEY
      : undefined;
  const metricsKey = isSet(env, METRICS_ENDPOINT_KEY)
    ? METRICS_ENDPOINT_KEY
    : genericSet
      ? ENDPOINT_KEY
      : undefined;

  if (tracesKey === undefined && metricsKey === undefined) {
    return {
      mode: "unconfigured",
      exportTraces: false,
      exportMetrics: false,
      reason: `no OTLP destination — ${ENDPOINT_KEY}, ${TRACES_ENDPOINT_KEY} and ${METRICS_ENDPOINT_KEY} are all unset`,
    };
  }

  return {
    mode: "exporting",
    exportTraces: tracesKey !== undefined,
    exportMetrics: metricsKey !== undefined,
    reason: `traces via ${tracesKey ?? "no key"}, metrics via ${metricsKey ?? "no key"}`,
  };
}
