import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Deliberately do NOT mock "@fastify/otel" or "fastify" — this test exercises
// the real FastifyOtelInstrumentation + real Fastify() interaction that
// reproduces FST_ERR_DEC_ALREADY_PRESENT ("The decorator 'opentelemetry' has
// already been added!") when initTelemetry() runs more than once in the same
// process. Everything else (network exporters, Langfuse, NodeSDK itself) is
// mocked to keep this a fast, side-effect-free unit test.
vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.start = vi.fn();
    this.shutdown = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
  OTLPMetricExporter: vi.fn(),
}));

vi.mock("@opentelemetry/sdk-metrics", () => ({
  PeriodicExportingMetricReader: vi.fn(),
}));

vi.mock("@opentelemetry/instrumentation-http", () => ({
  HttpInstrumentation: vi.fn(),
}));

vi.mock("@opentelemetry/instrumentation-pino", () => ({
  PinoInstrumentation: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: vi.fn().mockReturnValue({}),
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
  ATTR_SERVICE_VERSION: "service.version",
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: "deployment.environment",
}));

vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: vi.fn(),
}));

import Fastify from "fastify";

describe("initTelemetry idempotency", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.OTEL_SDK_DISABLED;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not double-decorate a fresh Fastify instance when called more than once", async () => {
    const { initTelemetry } = await import("./sdk.js");

    // Simulates initTelemetry() being invoked more than once in the same
    // process (hot-reload / multiple bootstrap paths) — each call used to
    // construct its own FastifyOtelInstrumentation, and each constructed
    // instance auto-subscribes to Fastify's global 'fastify.initialization'
    // diagnostics channel. The next Fastify() instance created anywhere in
    // the process then gets decorated once per subscriber, and the second
    // decorate throws.
    initTelemetry({ serviceName: "test-service" });
    initTelemetry({ serviceName: "test-service" });

    const app = Fastify();
    expect(app.hasRequestDecorator("opentelemetry")).toBe(true);
    await app.close();
  });
});
