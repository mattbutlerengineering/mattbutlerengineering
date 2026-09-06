import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock @mbe/observability — must be static so vi.mock hoists correctly
vi.mock("@mbe/observability", () => ({
  initTelemetry: vi.fn().mockReturnValue({
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock @mbe/sentry/node
vi.mock("@mbe/sentry/node", () => ({
  initSentry: vi.fn(),
}));

// Import AFTER mocks are set up
const { startServiceServer } = await import("./start-service-server.js");
const { initTelemetry } = await import("@mbe/observability");
const { initSentry } = await import("@mbe/sentry/node");

function makeMockFastify(listenError?: Error): FastifyInstance {
  return {
    listen: listenError
      ? vi.fn().mockRejectedValue(listenError)
      : vi.fn().mockResolvedValue(undefined),
    log: {
      info: vi.fn(),
      error: vi.fn(),
    },
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as FastifyInstance;
}

describe("startServiceServer", () => {
  let originalProcessOn: typeof process.on;
  let originalProcessExit: typeof process.exit;
  const sigTermHandlers: Array<() => void> = [];
  const sigIntHandlers: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    sigTermHandlers.length = 0;
    sigIntHandlers.length = 0;

    originalProcessOn = process.on.bind(process);
    originalProcessExit = process.exit.bind(process);

    // Capture SIGTERM/SIGINT handlers instead of registering them
    vi.spyOn(process, "on").mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (event === "SIGTERM") {
          sigTermHandlers.push(handler as () => void);
        }
        if (event === "SIGINT") {
          sigIntHandlers.push(handler as () => void);
        }
        return process;
      }
    );

    vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      return undefined as never;
    });
  });

  afterEach(() => {
    process.on = originalProcessOn;
    process.exit = originalProcessExit;
    vi.restoreAllMocks();
  });

  it("calls initTelemetry with the correct serviceName", async () => {
    const mockFastify = makeMockFastify();
    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    expect(initTelemetry).toHaveBeenCalledWith({ serviceName: "test-api" });
  });

  it("calls sdk.start() after initTelemetry", async () => {
    const mockSdk = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(initTelemetry).mockReturnValueOnce(mockSdk);

    const mockFastify = makeMockFastify();
    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    expect(mockSdk.start).toHaveBeenCalledTimes(1);
  });

  it("calls initSentry with the correct serviceName", async () => {
    const mockFastify = makeMockFastify();
    await startServiceServer({
      serviceName: "my-service",
      port: 9001,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    expect(initSentry).toHaveBeenCalledWith({ serviceName: "my-service" });
  });

  it("calls buildApp() and listens on the given port", async () => {
    const mockFastify = makeMockFastify();
    const buildApp = vi.fn().mockResolvedValue(mockFastify);

    await startServiceServer({
      serviceName: "test-api",
      port: 3999,
      buildApp,
    });

    expect(buildApp).toHaveBeenCalledTimes(1);
    expect(mockFastify.listen).toHaveBeenCalledWith(expect.objectContaining({ port: 3999 }));
  });

  it("uses HOST env variable when set", async () => {
    const originalHost = process.env.HOST;
    process.env.HOST = "127.0.0.1";

    try {
      const mockFastify = makeMockFastify();
      await startServiceServer({
        serviceName: "test-api",
        port: 9000,
        buildApp: vi.fn().mockResolvedValue(mockFastify),
      });

      expect(mockFastify.listen).toHaveBeenCalledWith(
        expect.objectContaining({ host: "127.0.0.1" })
      );
    } finally {
      if (originalHost === undefined) {
        delete process.env.HOST;
      } else {
        process.env.HOST = originalHost;
      }
    }
  });

  it("defaults HOST to 0.0.0.0 when not set", async () => {
    const originalHost = process.env.HOST;
    delete process.env.HOST;

    try {
      const mockFastify = makeMockFastify();
      await startServiceServer({
        serviceName: "test-api",
        port: 9000,
        buildApp: vi.fn().mockResolvedValue(mockFastify),
      });

      expect(mockFastify.listen).toHaveBeenCalledWith(expect.objectContaining({ host: "0.0.0.0" }));
    } finally {
      if (originalHost !== undefined) {
        process.env.HOST = originalHost;
      }
    }
  });

  it("registers a SIGTERM handler", async () => {
    const mockFastify = makeMockFastify();
    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    expect(sigTermHandlers.length).toBeGreaterThan(0);
  });

  it("SIGTERM handler calls fastify.close() before sdk.shutdown()", async () => {
    const callOrder: string[] = [];
    const mockSdk = {
      start: vi.fn(),
      shutdown: vi.fn().mockImplementation(async () => {
        callOrder.push("sdk.shutdown");
      }),
    };
    vi.mocked(initTelemetry).mockReturnValueOnce(mockSdk);

    const mockFastify = makeMockFastify();
    vi.mocked(mockFastify.close).mockImplementation(async () => {
      callOrder.push("fastify.close");
    });

    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    // Trigger SIGTERM
    await Promise.all(sigTermHandlers.map((h) => h()));

    expect(mockSdk.shutdown).toHaveBeenCalledTimes(1);
    expect(mockFastify.close).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["fastify.close", "sdk.shutdown"]);
  });

  it("SIGTERM handler calls optional beforeShutdown before fastify.close() and sdk.shutdown()", async () => {
    const callOrder: string[] = [];
    const mockSdk = {
      start: vi.fn(),
      shutdown: vi.fn().mockImplementation(async () => {
        callOrder.push("sdk.shutdown");
      }),
    };
    vi.mocked(initTelemetry).mockReturnValueOnce(mockSdk);

    const beforeShutdown = vi.fn().mockImplementation(async () => {
      callOrder.push("beforeShutdown");
    });

    const mockFastify = makeMockFastify();
    vi.mocked(mockFastify.close).mockImplementation(async () => {
      callOrder.push("fastify.close");
    });

    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
      beforeShutdown,
    });

    await Promise.all(sigTermHandlers.map((h) => h()));

    expect(beforeShutdown).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["beforeShutdown", "fastify.close", "sdk.shutdown"]);
  });

  it("exits 0 after a clean shutdown", async () => {
    const mockFastify = makeMockFastify();
    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    await Promise.all(sigTermHandlers.map((h) => h()));
    // Allow the shutdown promise chain's .then() to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("registers a SIGINT handler and it behaves the same as SIGTERM", async () => {
    const callOrder: string[] = [];
    const mockSdk = {
      start: vi.fn(),
      shutdown: vi.fn().mockImplementation(async () => {
        callOrder.push("sdk.shutdown");
      }),
    };
    vi.mocked(initTelemetry).mockReturnValueOnce(mockSdk);

    const mockFastify = makeMockFastify();
    vi.mocked(mockFastify.close).mockImplementation(async () => {
      callOrder.push("fastify.close");
    });

    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    expect(sigIntHandlers.length).toBeGreaterThan(0);

    await Promise.all(sigIntHandlers.map((h) => h()));
    await Promise.resolve();
    await Promise.resolve();

    expect(callOrder).toEqual(["fastify.close", "sdk.shutdown"]);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("a rejecting sdk.shutdown() still exits with a non-zero code instead of hanging", async () => {
    const mockSdk = {
      start: vi.fn(),
      shutdown: vi.fn().mockRejectedValue(new Error("otlp exporter unreachable")),
    };
    vi.mocked(initTelemetry).mockReturnValueOnce(mockSdk);

    const mockFastify = makeMockFastify();
    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    await Promise.all(sigTermHandlers.map((h) => h()));
    // Allow the rejection to propagate through the shutdown promise chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(process.exit).not.toHaveBeenCalledWith(0);
    expect(mockFastify.log.error).toHaveBeenCalled();
  });

  it("a second signal while shutdown is in flight is a no-op", async () => {
    const mockSdk = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(initTelemetry).mockReturnValueOnce(mockSdk);

    const mockFastify = makeMockFastify();
    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    // First SIGTERM, then SIGINT, both before the first shutdown resolves.
    sigTermHandlers.forEach((h) => h());
    sigIntHandlers.forEach((h) => h());
    // And a second SIGTERM for good measure.
    sigTermHandlers.forEach((h) => h());

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFastify.close).toHaveBeenCalledTimes(1);
    expect(mockSdk.shutdown).toHaveBeenCalledTimes(1);
  });

  it("force-exits with a non-zero code if shutdown overruns the hard timeout", async () => {
    vi.useFakeTimers();
    try {
      const mockSdk = {
        start: vi.fn(),
        // Never resolves — simulates a hung sdk.shutdown().
        shutdown: vi.fn().mockImplementation(() => new Promise(() => {})),
      };
      vi.mocked(initTelemetry).mockReturnValueOnce(mockSdk);

      const mockFastify = makeMockFastify();
      await startServiceServer({
        serviceName: "test-api",
        port: 9000,
        buildApp: vi.fn().mockResolvedValue(mockFastify),
      });

      sigTermHandlers.forEach((h) => h());

      await vi.advanceTimersByTimeAsync(15_000);

      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips beforeShutdown when not provided", async () => {
    const mockFastify = makeMockFastify();
    // Should not throw when beforeShutdown is omitted
    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    await Promise.all(sigTermHandlers.map((h) => h()));
    expect(mockFastify.close).toHaveBeenCalledTimes(1);
  });

  it("calls process.exit(1) on startup error", async () => {
    const buildApp = vi.fn().mockRejectedValue(new Error("startup boom"));

    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp,
    });

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when fastify.listen fails", async () => {
    const mockFastify = makeMockFastify(new Error("port in use"));

    await startServiceServer({
      serviceName: "test-api",
      port: 9000,
      buildApp: vi.fn().mockResolvedValue(mockFastify),
    });

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
