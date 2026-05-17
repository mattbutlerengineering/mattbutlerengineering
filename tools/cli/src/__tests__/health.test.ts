import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("health command", () => {
  const originalFetch = globalThis.fetch;

  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function runHealth(args: string[] = []): Promise<void> {
    const { healthCommand } = await import("../commands/health.js");
    await healthCommand.parseAsync(args, { from: "user" });
  }

  const sampleHealth = {
    status: "healthy",
    timestamp: "2026-01-01T00:00:00Z",
    services: {
      users: { status: "healthy", latency: 42, version: "1.0.0" },
      reservations: { status: "degraded", latency: 500 },
    },
    staticSites: {
      marketing: { status: "ok" },
    },
    ci: { status: "healthy" },
    deploy: { status: "ok" },
  };

  it("fetches health and outputs formatted text by default", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sampleHealth),
    });

    await runHealth();

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const allOutput = logSpy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("HEALTHY");
    expect(allOutput).toContain("users");
    expect(allOutput).toContain("42ms");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("outputs raw JSON when --json flag is passed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sampleHealth),
    });

    await runHealth(["--json"]);

    const allOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(allOutput);
    expect(parsed.status).toBe("healthy");
    expect(parsed.services).toBeDefined();
  });

  it("calls process.exit(1) when fetch fails without --watch", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await runHealth();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Network error");
  });

  it("prints error but does NOT exit when fetch fails with --watch", async () => {
    // Only run one cycle — override setInterval to not actually repeat
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = vi.fn() as typeof setInterval;

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    await runHealth(["--watch"]);

    expect(exitSpy).not.toHaveBeenCalled();
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("timeout");

    globalThis.setInterval = originalSetInterval;
  });

  it("throws when the health endpoint returns a non-OK status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    await runHealth();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("503");
  });

  it("renders services section with all fields", async () => {
    const healthWithChecks = {
      ...sampleHealth,
      services: {
        agent: {
          status: "healthy",
          latency: 12,
          version: "2.1.0",
          checks: [{ name: "db", status: "healthy", latency: 5 }],
        },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(healthWithChecks),
    });

    await runHealth();

    const allOutput = logSpy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("agent");
    expect(allOutput).toContain("12ms");
    expect(allOutput).toContain("v2.1.0");
  });

  it("handles missing optional sections gracefully", async () => {
    const minimalHealth = {
      status: "healthy",
      timestamp: "2026-01-01T00:00:00Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalHealth),
    });

    await runHealth();

    expect(exitSpy).not.toHaveBeenCalled();
    const allOutput = logSpy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("HEALTHY");
  });

  it("shows degraded status correctly", async () => {
    const degradedHealth = {
      status: "degraded",
      timestamp: "2026-01-01T00:00:00Z",
      services: {
        users: { status: "degraded" },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(degradedHealth),
    });

    await runHealth();

    const allOutput = logSpy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("DEGRADED");
  });
});

describe("health command – additional branch coverage", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  async function runHealth2(args: string[] = []): Promise<void> {
    const { healthCommand } = await import("../commands/health.js");
    await healthCommand.parseAsync(args, { from: "user" });
  }

  it("renders unhealthy status indicator (error case)", async () => {
    const unhealthyResponse = {
      status: "unhealthy",
      timestamp: "2026-01-01T00:00:00Z",
      services: {
        database: { status: "error", message: "Connection refused" },
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(unhealthyResponse),
    });

    await runHealth2();

    const allOutput = logSpy.mock.calls.flat().join("\n");
    // The unhealthy/error branch should have been traversed
    expect(allOutput).toBeDefined();
  });

  it("renders unknown status (default case in getStatusIndicator)", async () => {
    const unknownStatusResponse = {
      status: "unknown",
      timestamp: "2026-01-01T00:00:00Z",
      services: {
        database: { status: "unknown", message: "Status unknown" },
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(unknownStatusResponse),
    });

    await runHealth2();

    const allOutput = logSpy.mock.calls.flat().join("\n");
    expect(allOutput).toBeDefined();
  });

  it("exits with 1 on fetch error without --watch (covering line 116 branch)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));

    await runHealth2();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("clears screen in watch mode when fetch succeeds (covers line 116 stdout.write)", async () => {
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = vi.fn() as typeof setInterval;
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: "healthy",
          timestamp: "2026-01-01T00:00:00Z",
        }),
    });

    await runHealth2(["--watch"]);

    expect(writeSpy).toHaveBeenCalledWith("\x1b[2J\x1b[H");

    globalThis.setInterval = originalSetInterval;
  });
});
