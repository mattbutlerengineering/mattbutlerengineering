import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "node:http";
import { shouldIgnoreRequest } from "./sdk.js";

// Mock the Langfuse span processor module
vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.onStart = vi.fn();
    this.onEnd = vi.fn();
    this.shutdown = vi.fn().mockResolvedValue(undefined);
    this.forceFlush = vi.fn().mockResolvedValue(undefined);
  }),
}));

// Mock OTel SDK to capture config
vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
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

vi.mock("@opentelemetry/instrumentation-fastify", () => ({
  FastifyInstrumentation: vi.fn(),
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

import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

function fakeRequest(url: string): IncomingMessage {
  return { url } as IncomingMessage;
}

describe("shouldIgnoreRequest", () => {
  it("ignores /health", () => {
    expect(shouldIgnoreRequest(fakeRequest("/health"))).toBe(true);
  });

  it("ignores /health sub-paths", () => {
    expect(shouldIgnoreRequest(fakeRequest("/health/ready"))).toBe(true);
  });

  it("ignores /docs", () => {
    expect(shouldIgnoreRequest(fakeRequest("/docs"))).toBe(true);
  });

  it("ignores /docs sub-paths (Swagger assets)", () => {
    expect(shouldIgnoreRequest(fakeRequest("/docs/json"))).toBe(true);
    expect(shouldIgnoreRequest(fakeRequest("/docs/static/index.html"))).toBe(
      true,
    );
  });

  it("ignores /reference", () => {
    expect(shouldIgnoreRequest(fakeRequest("/reference"))).toBe(true);
  });

  it("ignores /reference sub-paths (Scalar assets)", () => {
    expect(shouldIgnoreRequest(fakeRequest("/reference/theme.css"))).toBe(true);
  });

  it("does not ignore application routes", () => {
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/reservations"))).toBe(
      false,
    );
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/tables"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/"))).toBe(false);
  });

  it("does not ignore routes that only contain ignored prefixes as substrings", () => {
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/docs-upload"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/api/reference-data"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/healthy"))).toBe(false);
  });

  it("handles missing url gracefully", () => {
    expect(shouldIgnoreRequest({ url: undefined } as IncomingMessage)).toBe(
      false,
    );
  });
});

describe("initTelemetry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("adds LangfuseSpanProcessor when LANGFUSE_PUBLIC_KEY is set", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";

    const { initTelemetry } = await import("./sdk.js");
    initTelemetry({ serviceName: "test-service" });

    expect(LangfuseSpanProcessor).toHaveBeenCalledTimes(1);
    const sdkCall = vi.mocked(NodeSDK).mock.calls[0][0];
    expect(sdkCall?.spanProcessors).toBeDefined();
    expect(sdkCall?.spanProcessors).toHaveLength(1);
  });

  it("does NOT add LangfuseSpanProcessor when LANGFUSE_PUBLIC_KEY is unset", async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;

    const { initTelemetry } = await import("./sdk.js");
    initTelemetry({ serviceName: "test-service" });

    expect(LangfuseSpanProcessor).not.toHaveBeenCalled();
  });

  it("does NOT add LangfuseSpanProcessor when OTEL_SDK_DISABLED is true", async () => {
    process.env.OTEL_SDK_DISABLED = "true";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";

    const { initTelemetry } = await import("./sdk.js");
    initTelemetry({ serviceName: "test-service" });

    expect(LangfuseSpanProcessor).not.toHaveBeenCalled();
  });
});
