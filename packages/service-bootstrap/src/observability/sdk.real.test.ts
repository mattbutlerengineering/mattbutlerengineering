import { createRequire, syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { metrics, trace } from "@opentelemetry/api";

// Deliberately mocks NOTHING in the OTel stack. sdk.test.ts mocks NodeSDK, so
// it can only check the constructor arguments; it cannot see the exporters
// NodeSDK.start() builds from env for every signal the caller leaves unset
// (the logs signal once exported to http://localhost:4318/v1/logs this way).
//
// Detection is by behaviour, not construction: emit one span, metric and log
// record through the real global providers, flush, and assert that nothing
// tried to open a connection. Outbound transport is stubbed so the test can
// never reach the network, even when the defect is present.
//
// `@opentelemetry/api-logs` is a transitive dependency of sdk-node, so it is
// resolved from sdk-node's own location rather than added to package.json.
const requireFromSdk = createRequire(
  createRequire(import.meta.url).resolve("@opentelemetry/sdk-node")
);
// Minimal structural type: api-logs is not a direct dependency, so tsc cannot
// resolve its types from this package.
const { logs } = requireFromSdk("@opentelemetry/api-logs") as {
  readonly logs: {
    getLogger(name: string): { emit(record: { body: string }): void };
  };
};

const OTEL_KEYS = Object.keys(process.env).filter(
  (key) => key.startsWith("OTEL_") || key.startsWith("LANGFUSE_")
);

describe.each([
  { mode: "unconfigured", env: {} },
  { mode: "disabled", env: { OTEL_SDK_DISABLED: "true" } },
] as const)("real NodeSDK in $mode mode", ({ mode, env }) => {
  const originalEnv = process.env;
  let attempts: string[];

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...env };
    for (const key of OTEL_KEYS) {
      if (!(key in env)) delete process.env[key];
    }
    attempts = [];
    const block =
      (label: string) =>
      (...args: unknown[]): never => {
        attempts.push(`${label} ${JSON.stringify(args[0] ?? "")}`);
        throw new Error(`network blocked in test (${label})`);
      };
    vi.spyOn(http, "request").mockImplementation(block("http.request"));
    vi.spyOn(https, "request").mockImplementation(block("https.request"));
    // The OTLP transport reads `request` from a dynamic import("http"), i.e.
    // the ESM namespace, which only sees a spy after this sync.
    syncBuiltinESMExports();
    vi.stubGlobal("fetch", vi.fn(block("fetch")));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    syncBuiltinESMExports();
  });

  it("opens no exporter and attempts no outbound request", async () => {
    const { initTelemetry } = await import("./sdk.js");
    const sdk = initTelemetry({ serviceName: "sdk-real-test" });
    sdk.start();

    try {
      trace.getTracer("t").startSpan("s").end();
      metrics.getMeter("m").createCounter("c").add(1);
      logs.getLogger("l").emit({ body: "probe" });
    } finally {
      // shutdown() flushes every registered processor and reader; an exporter
      // that exists tries to connect here.
      await sdk.shutdown();
    }

    expect(attempts, `${mode}: unexpected outbound attempts`).toEqual([]);
  });
});
