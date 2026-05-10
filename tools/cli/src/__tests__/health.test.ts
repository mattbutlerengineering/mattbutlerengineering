import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("health command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit called with ${code}`);
    });
  });

  async function runHealth(args: string[]): Promise<void> {
    const { healthCommand } = await import("../commands/health.js");
    await healthCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("displays system health", async () => {
    const mockData = {
      status: "healthy",
      timestamp: "2026-05-08T12:00:00Z",
      services: {
        api: { status: "ok", version: "1.0.0", latency: 50 },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    await runHealth([]);

    // eslint-disable-next-line no-control-regex
    const logOutput = logSpy.mock.calls.flat().join(" ").replace(/\x1b\[[0-9;]*m/g, "");
    expect(logOutput).toContain("System: HEALTHY");
    expect(logOutput).toContain("api");
  });
});
