import { describe, it, expect, vi, afterEach } from "vitest";
import { createLapsedGuestMonitor } from "./lapsed-guest-cron.js";
import type { LapsingGuest } from "@mbe/types";
import type { FastifyBaseLogger } from "fastify";

function makeLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    level: "info",
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

function makeDeps(overrides: Partial<Parameters<typeof createLapsedGuestMonitor>[0]> = {}) {
  return {
    getVenueIds: vi.fn<() => Promise<string[]>>().mockResolvedValue(["venue-1"]),
    runScan: vi.fn<(venueId: string) => Promise<LapsingGuest[]>>().mockResolvedValue([]),
    startupDelayMs: 0,
    intervalMs: 100,
    ...overrides,
  };
}

describe("createLapsedGuestMonitor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls runScan for each venue after startup", async () => {
    const deps = makeDeps({ startupDelayMs: 0 });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(deps.getVenueIds).toHaveBeenCalledTimes(1);
    expect(deps.runScan).toHaveBeenCalledWith("venue-1");
  });

  it("logs when lapsing guests are found", async () => {
    const lapsingGuest = { guestId: "g-1" } as LapsingGuest;
    const deps = makeDeps({
      startupDelayMs: 0,
      runScan: vi.fn().mockResolvedValue([lapsingGuest]),
    });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(log.info).toHaveBeenCalledWith(
      { venueId: "venue-1", count: 1 },
      "lapsed guest scan: found lapsing guests"
    );
  });

  it("logs error when scan throws", async () => {
    const err = new Error("db failure");
    const deps = makeDeps({
      startupDelayMs: 0,
      getVenueIds: vi.fn().mockRejectedValue(err),
    });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(log.error).toHaveBeenCalledWith({ err }, "lapsed guest scan: error");
  });

  it("stop() prevents further scans from running", async () => {
    const runScan = vi.fn<(venueId: string) => Promise<LapsingGuest[]>>().mockResolvedValue([]);
    const deps = makeDeps({ startupDelayMs: 0, intervalMs: 50, runScan });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    const callsAfterStop = runScan.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(runScan.mock.calls.length).toBe(callsAfterStop);
  });
});
