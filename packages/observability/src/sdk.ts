import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import type { IncomingMessage } from "node:http";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

export interface OtelConfig {
  readonly serviceName: string;
  readonly serviceVersion?: string;
}

/**
 * Paths that generate trace spam with no diagnostic value.
 * Swagger UI (/docs), Scalar API Reference (/reference), and health checks.
 */
const IGNORED_PATH_PREFIXES: readonly string[] = [
  "/health",
  "/docs",
  "/reference",
] as const;

/**
 * Returns true when the incoming request URL matches a path that should
 * be excluded from tracing (documentation assets, health checks, etc.).
 */
export function shouldIgnoreRequest(req: IncomingMessage): boolean {
  const url = req.url ?? "";
  return IGNORED_PATH_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`),
  );
}

/**
 * Initialize OpenTelemetry with OTLP/HTTP exporters and selective instrumentation.
 *
 * Must be called BEFORE importing any Fastify or HTTP modules — the SDK
 * monkey-patches Node's HTTP stack during registration.
 *
 * Uses OTLP/HTTP (not gRPC) to avoid the 8-12 MB overhead of @grpc/grpc-js.
 * Only instruments http, fastify, and pino — not the full auto-instrumentation
 * suite which adds DNS/net/fs noise and ~8 MB of unnecessary heap.
 *
 * Configuration via standard OTel env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT — Grafana Cloud OTLP gateway URL
 *   OTEL_EXPORTER_OTLP_HEADERS  — "Authorization=Basic <base64>"
 *   OTEL_SDK_DISABLED            — set to "true" to disable (e.g., in tests)
 */
export function initTelemetry(config: OtelConfig): NodeSDK {
  const isDisabled = process.env.OTEL_SDK_DISABLED === "true";

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion ?? "0.0.0",
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? "development",
    "deploy.sha": process.env.DEPLOY_SHA ?? "unknown",
    "deploy.pr_number": process.env.DEPLOY_PR_NUMBER ?? "",
    "deploy.author": process.env.DEPLOY_AUTHOR ?? "",
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: isDisabled ? undefined : new OTLPTraceExporter(),
    metricReader: isDisabled
      ? undefined
      : new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
          exportIntervalMillis: 30_000,
        }),
    instrumentations: isDisabled
      ? []
      : [
          new HttpInstrumentation({
            ignoreIncomingRequestHook: shouldIgnoreRequest,
          }),
          new FastifyInstrumentation(),
          new PinoInstrumentation(),
        ],
  });

  return sdk;
}
