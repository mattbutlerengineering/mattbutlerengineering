import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { IncomingMessage } from "node:http";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { resolveTelemetryPlan } from "./otel-config.js";

export interface OtelConfig {
  readonly serviceName: string;
  readonly serviceVersion?: string;
}

/**
 * Paths that generate trace spam with no diagnostic value.
 * Swagger UI (/docs), Scalar API Reference (/reference), and health checks.
 */
const IGNORED_PATH_PREFIXES: readonly string[] = ["/health", "/docs", "/reference"] as const;

/**
 * Returns true when the incoming request URL matches a path that should
 * be excluded from tracing (documentation assets, health checks, etc.).
 */
export function shouldIgnoreRequest(req: IncomingMessage): boolean {
  const url = req.url ?? "";
  return IGNORED_PATH_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
}

/**
 * Module-level cache so repeated initTelemetry() calls in the same process
 * (hot-reload, or a second bootstrap path) reuse the same NodeSDK instead of
 * constructing a second FastifyOtelInstrumentation. Each instrumentation
 * instance auto-subscribes to Fastify's global 'fastify.initialization'
 * diagnostics channel on construction, so two instances both fire on the
 * next Fastify() call and the second decorate throws
 * FST_ERR_DEC_ALREADY_PRESENT ("The decorator 'opentelemetry' has already
 * been added!").
 */
let telemetrySdk: NodeSDK | undefined;

/**
 * Initialize OpenTelemetry with OTLP/HTTP exporters and selective instrumentation.
 *
 * Must be called BEFORE importing any Fastify or HTTP modules — the SDK
 * monkey-patches Node's HTTP stack during registration.
 *
 * Idempotent: a second call in the same process returns the SDK created by
 * the first call rather than constructing a new one. See `telemetrySdk`.
 *
 * Uses OTLP/HTTP (not gRPC) to avoid the 8-12 MB overhead of @grpc/grpc-js.
 * Only instruments http, fastify, and pino — not the full auto-instrumentation
 * suite which adds DNS/net/fs noise and ~8 MB of unnecessary heap.
 *
 * Configuration via standard OTel env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT — Grafana Cloud OTLP gateway URL
 *   OTEL_EXPORTER_OTLP_HEADERS  — "Authorization=Basic <base64>"
 *   OTEL_SDK_DISABLED            — set to "true" to disable (e.g., in tests)
 *   LANGFUSE_PUBLIC_KEY          — enables Langfuse trace export (optional)
 *   LANGFUSE_SECRET_KEY          — Langfuse API secret (required with public key)
 *   LANGFUSE_BASEURL             — Langfuse endpoint (defaults to cloud.langfuse.com)
 *
 * An enabled SDK with no OTLP endpoint set is its own mode ("unconfigured"),
 * not a variant of enabled — see resolveTelemetryPlan and the comment on the
 * NodeSDK options below.
 */
export function initTelemetry(config: OtelConfig): NodeSDK {
  if (telemetrySdk) {
    return telemetrySdk;
  }

  const plan = resolveTelemetryPlan(process.env);
  const isDisabled = plan.mode === "disabled";

  // One line, every boot, every mode. The defect this package just fixed was
  // invisible precisely because an unconfigured process and a healthy one
  // rendered identically — nothing said which state the service was in until
  // an export failed. Emitted for `disabled` too, so an absent line always
  // means "initTelemetry did not run", never "it ran and had nothing to say".
  //
  // `console.info` rather than `diag` from @opentelemetry/api: diag is silent unless
  // OTEL_LOG_LEVEL is set, so it would say nothing in exactly the deployment
  // that needs it. This runs before Fastify, so pino does not exist yet;
  // start-service-server.ts already writes to console at the same stage. `info`
  // specifically because the repo eslint config allows only warn/error/info.
  // `plan.reason` names the KEY that decided the mode and never its value,
  // following validateStartupConfig's describeShape discipline.
  console.info(`[telemetry] mode=${plan.mode} — ${plan.reason}`);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion ?? "0.0.0",
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? "development",
    "deploy.sha": process.env.DEPLOY_SHA ?? "unknown",
    "deploy.pr_number": process.env.DEPLOY_PR_NUMBER ?? "",
    "deploy.author": process.env.DEPLOY_AUTHOR ?? "",
  });

  const spanProcessors: SpanProcessor[] = [];
  if (!isDisabled && process.env.LANGFUSE_PUBLIC_KEY) {
    spanProcessors.push(new LangfuseSpanProcessor());
  }

  // The empty collections below are load-bearing, and `undefined` is NOT an
  // equivalent way to write them. Measured against @opentelemetry/sdk-node
  // @0.221.0: when `spanProcessors` is absent and `traceExporter` is undefined,
  // NodeSDK.start() falls through to getSpanProcessorsFromEnv() (sdk.js:213),
  // which reads an unset OTEL_TRACES_EXPORTER as "otlp" (utils.js:133) and
  // rebuilds an exporter pointed at http://localhost:4318 — the very defect
  // this code exists to remove. The metric path falls through identically in
  // the constructor (sdk.js:147, defaulting OTEL_METRICS_EXPORTER at :29-32).
  // An empty array is truthy, so it takes the caller-supplied branch instead
  // (sdk.js:202 for spans, :132 for metrics) and yields a collection start()
  // then declines to register (:217, :182-184). Nothing is exported and
  // nothing is constructed. Re-read those lines on any sdk-node bump.
  //
  // `spanProcessors` is omitted — not emptied — only when there is a real
  // trace destination and no Langfuse processor, so NodeSDK builds its own
  // batch processor via createBatchSpanProcessorFromEnv (sdk.js:208-212) and
  // the OTEL_BSP_* tuning variables keep working. That is today's behaviour.
  //
  // The exporters are constructed with NO arguments on purpose: endpoint,
  // headers, timeout, compression and the /v1/traces vs /v1/metrics suffix all
  // stay owned by the OTel SDK's own env resolution. This module decides
  // *whether* to export, never *where* to.
  const omitSpanProcessors = spanProcessors.length === 0 && plan.exportTraces;

  const sdk = new NodeSDK({
    resource,
    ...(omitSpanProcessors ? {} : { spanProcessors }),
    ...(plan.exportTraces ? { traceExporter: new OTLPTraceExporter() } : {}),
    metricReaders: plan.exportMetrics
      ? [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
            exportIntervalMillis: 30_000,
          }),
        ]
      : [],
    instrumentations: isDisabled
      ? []
      : [
          new HttpInstrumentation({
            ignoreIncomingRequestHook: shouldIgnoreRequest,
          }),
          new FastifyOtelInstrumentation({ registerOnInitialization: true }),
          new PinoInstrumentation(),
        ],
  });

  telemetrySdk = sdk;
  return sdk;
}
