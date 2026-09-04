import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "node:http";
import { shouldIgnoreRequest } from "./sdk.js";

// Mock the Langfuse span processor module
vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.onStart = vi.fn();
    this.onEnd = vi.fn();
    this.shutdown = vi.fn().mockResolvedValue(undefined);
    this.forceFlush = vi.fn().mockResolvedValue(undefined);
  }),
}));

// Mock OTel SDK to capture config
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

vi.mock("@fastify/otel", () => ({
  FastifyOtelInstrumentation: vi.fn(),
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
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

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
    expect(shouldIgnoreRequest(fakeRequest("/docs/static/index.html"))).toBe(true);
  });

  it("ignores /reference", () => {
    expect(shouldIgnoreRequest(fakeRequest("/reference"))).toBe(true);
  });

  it("ignores /reference sub-paths (Scalar assets)", () => {
    expect(shouldIgnoreRequest(fakeRequest("/reference/theme.css"))).toBe(true);
  });

  it("does not ignore application routes", () => {
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/reservations"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/tables"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/"))).toBe(false);
  });

  it("does not ignore routes that only contain ignored prefixes as substrings", () => {
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/docs-upload"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/api/reference-data"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/healthy"))).toBe(false);
  });

  it("handles missing url gracefully", () => {
    expect(shouldIgnoreRequest({ url: undefined } as IncomingMessage)).toBe(false);
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
    const sdkCall = vi.mocked(NodeSDK).mock.calls[0]?.[0];
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

  it("wires FastifyOtelInstrumentation with registerOnInitialization enabled", async () => {
    const { initTelemetry } = await import("./sdk.js");
    initTelemetry({ serviceName: "test-service" });

    expect(FastifyOtelInstrumentation).toHaveBeenCalledWith({
      registerOnInitialization: true,
    });
  });
});

/**
 * The NodeSDK constructor argument, per row of the telemetry mode table.
 *
 * Why the assertions below are on `spanProcessors: []` / `metricReaders: []`
 * specifically, and not on "no exporter was constructed": NodeSDK is mocked in
 * this file, so no test at this seam can observe the SDK's own env
 * fall-through. Measured against @opentelemetry/sdk-node@0.221.0,
 * `traceExporter: undefined` leaves `NodeSDK.start()` in the final `else`
 * branch (build/src/sdk.js:213) calling `getSpanProcessorsFromEnv()`, which
 * reads an unset OTEL_TRACES_EXPORTER as `otlp` (build/src/utils.js:133) and
 * rebuilds the very same http://localhost:4318 exporter. Metrics fall through
 * identically in the constructor (sdk.js:147). So a weaker assertion would
 * pass against an implementation that still exports to localhost. `[]` is
 * truthy, takes the caller-supplied branch (sdk.js:202, sdk.js:132), and
 * yields a collection start() then declines to register (sdk.js:217,
 * sdk.js:182-184).
 */
describe("initTelemetry — NodeSDK constructor shape per telemetry mode", () => {
  const originalEnv = process.env;

  const TELEMETRY_KEYS = [
    "OTEL_SDK_DISABLED",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
  ];

  const ENDPOINT = "https://collector.example.invalid:4318";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    for (const key of TELEMETRY_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function initAndCaptureConfig(): Promise<Record<string, unknown>> {
    const { initTelemetry } = await import("./sdk.js");
    initTelemetry({ serviceName: "test-service" });
    return (vi.mocked(NodeSDK).mock.calls[0]?.[0] ?? {}) as unknown as Record<string, unknown>;
  }

  describe("unconfigured — enabled, but no OTLP destination (the defect's mode)", () => {
    it("passes spanProcessors: [] and metricReaders: [], and no traceExporter key", async () => {
      const config = await initAndCaptureConfig();

      expect(config.spanProcessors).toEqual([]);
      expect(config.metricReaders).toEqual([]);
      expect(config).not.toHaveProperty("traceExporter");
      // The deprecated singular key must not survive either — a populated
      // `metricReader` would be read whenever `metricReaders` is absent.
      expect(config).not.toHaveProperty("metricReader");
    });

    it("constructs no OTLP exporter object at all", async () => {
      // Secondary evidence only. This assertion is NOT what proves the fix —
      // it passes against an implementation that writes `undefined` and lets
      // the SDK rebuild the localhost exporter itself. See the block comment.
      await initAndCaptureConfig();

      expect(OTLPTraceExporter).not.toHaveBeenCalled();
      expect(PeriodicExportingMetricReader).not.toHaveBeenCalled();
    });

    it("keeps the full instrumentation set", async () => {
      // FastifyOtelInstrumentation must stay constructed: @mbe/sentry sets
      // skipOpenTelemetrySetup on the premise that this package owns it.
      const config = await initAndCaptureConfig();

      expect(config.instrumentations).toHaveLength(3);
    });

    it("still carries the Langfuse processors when Langfuse is configured", async () => {
      process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
      process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";

      const config = await initAndCaptureConfig();

      expect(config.spanProcessors).toHaveLength(1);
      expect(config.metricReaders).toEqual([]);
      expect(config).not.toHaveProperty("traceExporter");
    });
  });

  describe("disabled", () => {
    it("passes empty collections, no traceExporter key, and no instrumentations", async () => {
      process.env.OTEL_SDK_DISABLED = "true";

      const config = await initAndCaptureConfig();

      expect(config.spanProcessors).toEqual([]);
      expect(config.metricReaders).toEqual([]);
      expect(config).not.toHaveProperty("traceExporter");
      expect(config).not.toHaveProperty("metricReader");
      expect(config.instrumentations).toEqual([]);
    });

    it("honours a trimmed, upper-cased 'true' the way the SDK's own reader does", async () => {
      process.env.OTEL_SDK_DISABLED = " TRUE ";

      const config = await initAndCaptureConfig();

      expect(config.instrumentations).toEqual([]);
      expect(config.spanProcessors).toEqual([]);
      expect(config.metricReaders).toEqual([]);
    });
  });

  describe("exporting", () => {
    it("omits spanProcessors when there are no Langfuse processors", async () => {
      // Deliberate: with the key absent NodeSDK builds the batch processor
      // itself via createBatchSpanProcessorFromEnv (sdk.js:208-212), so the
      // OTEL_BSP_* tuning variables keep working. Today's behaviour, preserved.
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ENDPOINT;

      const config = await initAndCaptureConfig();

      expect(config).not.toHaveProperty("spanProcessors");
      expect(config.traceExporter).toBeDefined();
    });

    it("passes a single PeriodicExportingMetricReader under the plural key", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ENDPOINT;

      const config = await initAndCaptureConfig();

      expect(config.metricReaders).toHaveLength(1);
      expect(config).not.toHaveProperty("metricReader");
      expect(PeriodicExportingMetricReader).toHaveBeenCalledWith({
        exporter: expect.anything(),
        exportIntervalMillis: 30_000,
      });
    });

    it("constructs the exporters with no arguments, so OTel owns endpoint resolution", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ENDPOINT;

      await initAndCaptureConfig();

      expect(OTLPTraceExporter).toHaveBeenCalledWith();
      expect(OTLPMetricExporter).toHaveBeenCalledWith();
    });

    it("passes the Langfuse processors under spanProcessors when Langfuse is configured", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ENDPOINT;
      process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
      process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";

      const config = await initAndCaptureConfig();

      expect(config.spanProcessors).toHaveLength(1);
      expect(config.traceExporter).toBeDefined();
    });

    it("exports traces only when only the traces endpoint is set", async () => {
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;

      const config = await initAndCaptureConfig();

      expect(config.traceExporter).toBeDefined();
      expect(config.metricReaders).toEqual([]);
    });

    it("exports metrics only when only the metrics endpoint is set", async () => {
      process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = ENDPOINT;

      const config = await initAndCaptureConfig();

      expect(config).not.toHaveProperty("traceExporter");
      expect(config.metricReaders).toHaveLength(1);
    });
  });

  /**
   * The third signal. Traces and metrics were the two the defect brief
   * enumerated, but NodeSDK exports LOGS by the same env fall-through, and
   * missing it leaves a third http://localhost:4318 exporter live in exactly
   * the mode this run exists to fix.
   *
   * Measured against @opentelemetry/sdk-node@0.221.0: when
   * `logRecordProcessors` is absent, the constructor never sets
   * `_loggerProviderConfig` (sdk.js:121-125), so start() calls
   * configureLoggerProviderFromEnv (sdk.js:231), which reads an unset
   * OTEL_LOGS_EXPORTER as "otlp" (sdk.js:262-264) and builds an exporter at
   * http://localhost:4318/v1/logs. Verified by running the real, unmocked SDK:
   * as shipped it registered that endpoint; with `logRecordProcessors: []` it
   * registered none. `[]` is truthy, so it takes the caller branch at
   * sdk.js:121 and start() skips the env path entirely.
   *
   * This one bites harder than the other two: PinoInstrumentation defaults
   * disableLogSending to false, so every Fastify log line feeds the exporter,
   * and BatchLogRecordProcessor's default scheduledDelayMillis is 1000 — a
   * once-per-second connection attempt under traffic, not once per 30s tick.
   */
  describe("the logs signal", () => {
    it("passes logRecordProcessors: [] when unconfigured", async () => {
      const config = await initAndCaptureConfig();

      expect(config.logRecordProcessors).toEqual([]);
      // The deprecated singular key must not survive either — sdk.js:126
      // reads `logRecordProcessor` whenever the plural key is absent.
      expect(config).not.toHaveProperty("logRecordProcessor");
    });

    it("passes logRecordProcessors: [] when disabled", async () => {
      process.env.OTEL_SDK_DISABLED = "true";

      const config = await initAndCaptureConfig();

      expect(config.logRecordProcessors).toEqual([]);
    });

    it("still passes logRecordProcessors: [] when an OTLP endpoint IS set", async () => {
      // Deliberate scope limit: this run fixes the unconfigured-default
      // defect. Turning log export ON is a separate decision nobody has
      // made, and shipping it silently here would be an unasked-for change.
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ENDPOINT;

      const config = await initAndCaptureConfig();

      expect(config.logRecordProcessors).toEqual([]);
    });
  });
});

/**
 * The boot notice exists because the failure this package just fixed was
 * invisible: an unconfigured process and a healthy one looked identical from
 * outside. One line at boot makes the mode observable without needing an
 * export to fail first.
 *
 * It must never print a configuration VALUE — only the key that decided the
 * mode — following validateStartupConfig's describeShape discipline.
 */
describe("initTelemetry — boot notice", () => {
  const originalEnv = process.env;
  const SENTINEL = "https://secret-collector.example.invalid:4318";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OTEL_SDK_DISABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  async function initAndCaptureNotice(): Promise<string[]> {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { initTelemetry } = await import("./sdk.js");
    initTelemetry({ serviceName: "test-service" });
    return spy.mock.calls.map((call) => call.join(" "));
  }

  it("emits exactly one notice, naming the mode", async () => {
    const lines = await initAndCaptureNotice();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("unconfigured");
  });

  it("names the keys that decided the mode", async () => {
    const lines = await initAndCaptureNotice();

    expect(lines[0]).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });

  it("prints the key but never the value", async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = SENTINEL;

    const lines = await initAndCaptureNotice();

    expect(lines[0]).toContain("exporting");
    expect(lines[0]).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
    expect(lines[0]).not.toContain(SENTINEL);
  });

  it("emits for the disabled mode too, so silence always means 'not booted'", async () => {
    process.env.OTEL_SDK_DISABLED = "true";

    const lines = await initAndCaptureNotice();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("disabled");
  });

  it("does not re-emit when initTelemetry is called a second time", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { initTelemetry } = await import("./sdk.js");
    initTelemetry({ serviceName: "test-service" });
    initTelemetry({ serviceName: "test-service" });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
