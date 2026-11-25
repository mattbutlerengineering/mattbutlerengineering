import { describe, it, expect, vi, type Mock } from "vitest";
import {
  ANY_TIME_MINUTE,
  createLostDemandService,
  limitingReason,
  type NoSlotSearchKey,
} from "./lost-demand.js";

const SEARCH: NoSlotSearchKey = {
  venueId: "venue_1",
  date: "2026-12-05",
  requestedMinute: 19 * 60 + 30,
  partySize: 4,
};

const GUEST = { sessionId: "sess-a", ip: "203.0.113.9", userAgent: "Mozilla/5.0" };

type IncrementMock = Mock<(key: NoSlotSearchKey) => Promise<void>>;

function setup(overrides: { store?: { increment: IncrementMock } } = {}) {
  const store = overrides.store ?? {
    increment: vi.fn<(key: NoSlotSearchKey) => Promise<void>>().mockResolvedValue(undefined),
  };
  let nowMs = 1_000_000;
  const logger = { warn: vi.fn() };
  const service = createLostDemandService({ store, now: () => nowMs, logger });
  return {
    store,
    logger,
    service,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("lostDemandService.recordNoSlotSearch", () => {
  it("increments the counter for a no-slot search", async () => {
    const { service, store } = setup();
    expect(await service.recordNoSlotSearch(SEARCH, GUEST)).toBe("recorded");
    expect(store.increment).toHaveBeenCalledTimes(1);
    expect(store.increment).toHaveBeenCalledWith(SEARCH);
  });

  it("counts a repeated search from the same session once", async () => {
    const { service, store } = setup();
    await service.recordNoSlotSearch(SEARCH, GUEST);
    expect(await service.recordNoSlotSearch(SEARCH, GUEST)).toBe("duplicate");
    expect(store.increment).toHaveBeenCalledTimes(1);
  });

  it("counts the same search again from a different session", async () => {
    const { service, store } = setup();
    await service.recordNoSlotSearch(SEARCH, GUEST);
    await service.recordNoSlotSearch(SEARCH, { ...GUEST, sessionId: "sess-b" });
    expect(store.increment).toHaveBeenCalledTimes(2);
  });

  it("counts the same session again once the dedupe window has passed", async () => {
    const { service, store, advance } = setup();
    await service.recordNoSlotSearch(SEARCH, GUEST);
    advance(31 * 60 * 1000);
    await service.recordNoSlotSearch(SEARCH, GUEST);
    expect(store.increment).toHaveBeenCalledTimes(2);
  });

  it("falls back to a hash of ip and user agent when there is no session id", async () => {
    const { service, store } = setup();
    const anonymous = { ip: "203.0.113.9", userAgent: "Mozilla/5.0" };
    await service.recordNoSlotSearch(SEARCH, anonymous);
    expect(await service.recordNoSlotSearch(SEARCH, anonymous)).toBe("duplicate");
    expect(store.increment).toHaveBeenCalledTimes(1);
  });

  it("stores only venue, date, minute and party size: no identifier reaches the store", async () => {
    const { service, store } = setup();
    await service.recordNoSlotSearch(SEARCH, GUEST);
    const stored: object = store.increment.mock.calls[0]?.[0] ?? {};
    expect(Object.keys(stored).sort()).toEqual(["date", "partySize", "requestedMinute", "venueId"]);
    const serialised = JSON.stringify(stored);
    expect(serialised).not.toContain(GUEST.ip);
    expect(serialised).not.toContain(GUEST.userAgent);
    expect(serialised).not.toContain(GUEST.sessionId);
  });

  it("does not count bot-like volume from one client", async () => {
    const { service, store } = setup();
    const results: string[] = [];
    for (let minute = 0; minute < 40; minute += 1) {
      results.push(await service.recordNoSlotSearch({ ...SEARCH, requestedMinute: minute }, GUEST));
    }
    expect(results.filter((r) => r === "recorded")).toHaveLength(20);
    expect(results.at(-1)).toBe("rate-limited");
    expect(store.increment).toHaveBeenCalledTimes(20);
  });

  // A fresh x-session-id (or user agent) per request must not reset the bot limit.
  it("caps one IP that rotates its session id on every search", async () => {
    const { service, store } = setup();
    const results: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      results.push(
        await service.recordNoSlotSearch(
          { ...SEARCH, requestedMinute: i },
          { ...GUEST, sessionId: `sess-${i}`, userAgent: `bot-${i}` }
        )
      );
    }
    expect(results.filter((r) => r === "recorded")).toHaveLength(60);
    expect(results.at(-1)).toBe("rate-limited");
    expect(store.increment).toHaveBeenCalledTimes(60);
  });

  it("swallows a store failure, logs it, and reports failed", async () => {
    const store = {
      increment: vi
        .fn<(key: NoSlotSearchKey) => Promise<void>>()
        .mockRejectedValue(new Error("db down")),
    };
    const { service, logger } = setup({ store });
    await expect(service.recordNoSlotSearch(SEARCH, GUEST)).resolves.toBe("failed");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("uses the any-time sentinel for a search that named no time", () => {
    expect(ANY_TIME_MINUTE).toBe(-1);
  });
});

describe("limitingReason (#9621)", () => {
  const at = (hh: number, mm = 0) => hh * 60 + mm;

  it("is closure when the date is closed, whatever else is true", () => {
    expect(
      limitingReason({
        requestedMinute: at(19),
        closure: true,
        hasSeatings: true,
        refusals: [{ minute: at(19), reason: "pacing" }],
      })
    ).toBe("closure");
  });

  it("is hours when the venue has no online seating that day", () => {
    expect(
      limitingReason({ requestedMinute: ANY_TIME_MINUTE, hasSeatings: false, refusals: [] })
    ).toBe("hours");
  });

  it("is hours when no seating exists at the requested minute", () => {
    expect(
      limitingReason({
        requestedMinute: at(15, 10),
        hasSeatings: true,
        refusals: [{ minute: at(19), reason: "tables" }],
      })
    ).toBe("hours");
  });

  it("uses the engine's refusal at the requested minute", () => {
    const refusals = [
      { minute: at(19), reason: "pacing" as const },
      { minute: at(19, 30), reason: "tables" as const },
    ];
    expect(limitingReason({ requestedMinute: at(19), hasSeatings: true, refusals })).toBe("pacing");
    expect(limitingReason({ requestedMinute: at(19, 30), hasSeatings: true, refusals })).toBe(
      "tables"
    );
  });

  it("for an any-time search prefers tables over pacing", () => {
    expect(
      limitingReason({
        requestedMinute: ANY_TIME_MINUTE,
        hasSeatings: true,
        refusals: [
          { minute: at(19), reason: "pacing" },
          { minute: at(20), reason: "tables" },
        ],
      })
    ).toBe("tables");
    expect(
      limitingReason({
        requestedMinute: ANY_TIME_MINUTE,
        hasSeatings: true,
        refusals: [{ minute: at(19), reason: "pacing" }],
      })
    ).toBe("pacing");
  });
});

describe("recordNoSlotSearch carries the limiting reason (#9621)", () => {
  it("passes the reason to the store", async () => {
    const { service, store } = setup();
    await service.recordNoSlotSearch({ ...SEARCH, reason: "pacing" }, GUEST);
    expect(store.increment).toHaveBeenCalledWith({ ...SEARCH, reason: "pacing" });
  });

  it("dedupes the same search even when the reason is the same", async () => {
    const { service, store } = setup();
    await service.recordNoSlotSearch({ ...SEARCH, reason: "tables" }, GUEST);
    expect(await service.recordNoSlotSearch({ ...SEARCH, reason: "tables" }, GUEST)).toBe(
      "duplicate"
    );
    expect(store.increment).toHaveBeenCalledTimes(1);
  });
});
