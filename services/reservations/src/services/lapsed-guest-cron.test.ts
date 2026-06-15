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

describe("createLapsedGuestMonitor — concurrent scanning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scans all venues concurrently (Promise.allSettled — one failure does not abort others)", async () => {
    const order: string[] = [];

    const getVenueIds = vi.fn<() => Promise<string[]>>().mockResolvedValue(["v1", "v2", "v3"]);
    const runScan = vi
      .fn<(venueId: string) => Promise<LapsingGuest[]>>()
      .mockImplementation((venueId) => {
        if (venueId === "v2") {
          return Promise.reject(new Error("v2 db error"));
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            order.push(venueId);
            resolve([]);
          }, 10);
        });
      });

    const log = makeLogger();
    const monitor = createLapsedGuestMonitor({
      getVenueIds,
      runScan,
      startupDelayMs: 0,
      intervalMs: 10000,
    });

    monitor.start(log);
    // Wait long enough for all concurrent scans to finish (all 10ms timers + buffer)
    await new Promise((r) => setTimeout(r, 50));
    monitor.stop();

    // All three scans were launched (v2 rejects, v1 and v3 succeed)
    expect(runScan).toHaveBeenCalledTimes(3);
    // v1 and v3 both completed despite v2 failing
    expect(order).toContain("v1");
    expect(order).toContain("v3");
    // v2's error was logged individually, not swallowed
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v2", err: expect.any(Error) }),
      "lapsed guest scan: venue error"
    );
    // The top-level scan did NOT error (allSettled absorbs individual failures)
    expect(log.error).not.toHaveBeenCalledWith(
      expect.objectContaining({}),
      "lapsed guest scan: error"
    );
  });

  it("logs per-venue error individually without aborting sibling scans", async () => {
    const getVenueIds = vi.fn<() => Promise<string[]>>().mockResolvedValue(["va", "vb"]);
    const runScan = vi
      .fn<(venueId: string) => Promise<LapsingGuest[]>>()
      .mockImplementation((venueId) => {
        if (venueId === "va") return Promise.reject(new Error("va failure"));
        return Promise.resolve([]);
      });

    const log = makeLogger();
    const monitor = createLapsedGuestMonitor({
      getVenueIds,
      runScan,
      startupDelayMs: 0,
      intervalMs: 10000,
    });

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 20));
    monitor.stop();

    // vb was still scanned even though va failed
    expect(runScan).toHaveBeenCalledWith("vb");
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "va" }),
      "lapsed guest scan: venue error"
    );
    // No top-level crash
    expect(log.error).not.toHaveBeenCalledWith(expect.anything(), "lapsed guest scan: error");
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
