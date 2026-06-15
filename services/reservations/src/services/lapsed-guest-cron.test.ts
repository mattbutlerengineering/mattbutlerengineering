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

type MockPrisma = {
  venue: { findMany: ReturnType<typeof vi.fn> };
  guest: { findMany: ReturnType<typeof vi.fn> };
};

function makePrisma(overrides: Partial<MockPrisma> = {}): MockPrisma {
  return {
    venue: { findMany: vi.fn().mockResolvedValue([{ id: "venue-1" }]) },
    guest: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe("createLapsedGuestMonitor (prisma interface)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries venues and guests using prisma client", async () => {
    const prisma = makePrisma();
    const monitor = createLapsedGuestMonitor({
      prisma: prisma as never,
      startupDelayMs: 0,
      intervalMs: 100,
    });
    const log = makeLogger();

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(prisma.venue.findMany).toHaveBeenCalledWith({ select: { id: true } });
    expect(prisma.guest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ venueId: "venue-1", visitCount: { gte: 3 } }),
      })
    );
  });

  it("logs when lapsing guests are found via prisma", async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

    // Guest with visits that trigger lapse detection
    const lapsingGuest = {
      id: "g-1",
      name: "Jane",
      email: "jane@example.com",
      phone: null,
      communicationPreference: "both",
      reservations: [
        { startTime: daysAgo(35) },
        { startTime: daysAgo(28) },
        { startTime: daysAgo(21) },
      ],
    };

    const prisma = makePrisma({
      guest: { findMany: vi.fn().mockResolvedValue([lapsingGuest]) },
    });
    const monitor = createLapsedGuestMonitor({
      prisma: prisma as never,
      startupDelayMs: 0,
      intervalMs: 100,
    });
    const log = makeLogger();

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(log.info).toHaveBeenCalledWith(
      { venueId: "venue-1", count: 1 },
      "lapsed guest scan: found lapsing guests"
    );
  });

  it("logs error when prisma query throws", async () => {
    const err = new Error("db failure");
    const prisma = makePrisma({
      venue: { findMany: vi.fn().mockRejectedValue(err) },
    });
    const monitor = createLapsedGuestMonitor({
      prisma: prisma as never,
      startupDelayMs: 0,
      intervalMs: 100,
    });
    const log = makeLogger();

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(log.error).toHaveBeenCalledWith({ err }, "lapsed guest scan: error");
  });

  it("stop() prevents further scans from running", async () => {
    const prisma = makePrisma();
    const monitor = createLapsedGuestMonitor({
      prisma: prisma as never,
      startupDelayMs: 0,
      intervalMs: 50,
    });
    const log = makeLogger();

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    const callsAfterStop = (prisma.venue.findMany as ReturnType<typeof vi.fn>).mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect((prisma.venue.findMany as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsAfterStop
    );
  });

  it("guest query selects required fields and filters by COMPLETED reservations", async () => {
    const prisma = makePrisma();
    const monitor = createLapsedGuestMonitor({
      prisma: prisma as never,
      startupDelayMs: 0,
      intervalMs: 100,
    });
    const log = makeLogger();

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    const call = (prisma.guest.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.select).toMatchObject({
      id: true,
      name: true,
      email: true,
      phone: true,
      communicationPreference: true,
      reservations: expect.objectContaining({
        where: { status: "COMPLETED" },
        select: { startTime: true },
      }),
    });
  });
});

// Retain legacy callback-based tests for the function signature (backwards-compat reference)
function makeDeps(overrides: Partial<Parameters<typeof createLapsedGuestMonitor>[0]> = {}) {
  return {
    getVenueIds: vi.fn<() => Promise<string[]>>().mockResolvedValue(["venue-1"]),
    runScan: vi.fn<(venueId: string) => Promise<LapsingGuest[]>>().mockResolvedValue([]),
    startupDelayMs: 0,
    intervalMs: 100,
    ...overrides,
  };
}

describe("createLapsedGuestMonitor (legacy callback interface)", () => {
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
