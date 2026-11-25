import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;
}

function problem(status: number, detail = "Refused.") {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail },
  });
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

function entry(fields: Record<string, unknown> = {}) {
  return {
    id: "r1",
    date: "2026-11-02",
    startTime: "2026-11-02T02:30:00.000Z",
    endTime: "2026-11-02T04:30:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: "Window seat",
    guestName: "Ada Lovelace",
    guestId: "g1",
    occasion: "Birthday",
    seatingPreference: "Booth",
    tableId: "t1",
    table: { id: "t1", name: "Booth 2", tableNumber: "12" },
    guest: {
      id: "g1",
      name: "Ada Lovelace",
      visitCount: 7,
      lastVisit: "2026-09-01",
      dietaryRestrictions: ["nuts"],
      notes: "Likes quiet",
      staffNotes: [{ text: "Regular", createdBy: "u1", createdAt: "" }],
      tags: ["VIP"],
      communicationPreference: "email",
    },
    ...fields,
  };
}

// Every day: one Dinner service 22:00 to 02:00 (past midnight).
const lateConfig = {
  schedules: [{ id: "s1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "v1", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss1",
      scheduleId: "s1",
      venueServiceId: "v1",
      opensAt: 1320,
      lastSeatingAt: 1500,
      closesAt: 1560,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [{ id: "a1", scheduleId: "s1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 }],
  dateRules: [],
};

describe("get_night_summary chat tool", () => {
  let log: FastifyBaseLogger;
  let api: {
    reservations: { getEndOfServiceSummary: ReturnType<typeof vi.fn> };
    availability: { getConfig: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Nov 1 23:00 PST, inside that evening's service.
    vi.setSystemTime(new Date("2026-11-02T07:00:00.000Z"));
    log = createMockLogger();
    api = {
      availability: { getConfig: vi.fn().mockResolvedValue({ config: lateConfig, version: 1 }) },
      reservations: {
        getEndOfServiceSummary: vi.fn().mockResolvedValue({
          date: "2026-11-01",
          venueId: "v1",
          covers: 84,
          tableTurns: 31,
          noShows: 2,
          turnedAway: null,
        }),
      },
    };
  });

  afterEach(() => vi.useRealTimers());

  function run(
    input: Record<string, unknown>,
    options: { venueId?: string; timeZone?: string } = { venueId: "v1" }
  ) {
    const tools = createAgentTools(log, api as never, options);
    return tools.get_night_summary!.execute!(input as never, toolCtx);
  }

  it("is a read: not confirm-gated", () => {
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("get_night_summary");
  });

  it("reads the service day after midnight, not the calendar day", async () => {
    // 09:00Z on Nov 7 is Sat 01:00 PST: Friday's 22:00-02:00 service is still on.
    vi.setSystemTime(new Date("2026-11-07T09:00:00.000Z"));

    await run({}, { venueId: "v1", timeZone: "America/Los_Angeles" });

    expect(api.reservations.getEndOfServiceSummary).toHaveBeenCalledWith({
      venueId: "v1",
      date: "2026-11-06",
    });
  });

  it("reads the last night when asked before tonight opens", async () => {
    // Sat 10:00 PST: Friday's service has closed, tonight's has not opened.
    vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));

    await run({}, { venueId: "v1", timeZone: "America/Los_Angeles" });

    expect(api.reservations.getEndOfServiceSummary).toHaveBeenCalledWith({
      venueId: "v1",
      date: "2026-11-06",
    });
  });

  it("never guesses the calendar day when the hours can't be read", async () => {
    api.availability.getConfig.mockRejectedValue(new Error("boom"));

    const result = await run({}, { venueId: "v1", timeZone: "America/Los_Angeles" });

    expect(result).toMatchObject({ unknown: true, error: expect.stringMatching(/couldn't/i) });
    expect(api.reservations.getEndOfServiceSummary).not.toHaveBeenCalled();
  });

  it("does not read the hours when the user names the date", async () => {
    await run({ date: "2026-10-30" }, { venueId: "v1", timeZone: "America/Los_Angeles" });

    expect(api.availability.getConfig).not.toHaveBeenCalled();
  });

  it("reads the venue's own service day and returns the figures", async () => {
    const result = await run({}, { venueId: "v1", timeZone: "America/Los_Angeles" });

    // Nov 1 23:00 PST is inside that evening's service.
    expect(api.reservations.getEndOfServiceSummary).toHaveBeenCalledWith({
      venueId: "v1",
      date: "2026-11-01",
    });
    expect(result).toEqual({
      date: "2026-11-01",
      covers: 84,
      tableTurns: 31,
      noShows: 2,
    });
  });

  it("reads a given date and never takes the venue from the model", async () => {
    await run({ date: "2026-10-30", venueId: "other" });

    expect(api.reservations.getEndOfServiceSummary).toHaveBeenCalledWith({
      venueId: "v1",
      date: "2026-10-30",
    });
  });

  it("includes turned away only once the server reports it", async () => {
    api.reservations.getEndOfServiceSummary.mockResolvedValue({
      date: "2026-11-01",
      venueId: "v1",
      covers: 10,
      tableTurns: 4,
      noShows: 0,
      turnedAway: 3,
    });

    expect(await run({ date: "2026-11-01" })).toMatchObject({ turnedAway: 3 });
  });

  it("needs a selected venue", async () => {
    const result = await run({}, {});

    expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
    expect(api.reservations.getEndOfServiceSummary).not.toHaveBeenCalled();
  });

  it("refuses an unreadable date without calling the API", async () => {
    const result = await run({ date: "last night" });

    expect(result).toMatchObject({ rejected: true });
    expect(api.reservations.getEndOfServiceSummary).not.toHaveBeenCalled();
  });

  it("never turns a failed read into zeros", async () => {
    api.reservations.getEndOfServiceSummary.mockRejectedValue(new Error("boom"));

    const result = await run({ date: "2026-11-01" });

    expect(result).toMatchObject({ unknown: true, error: expect.stringMatching(/couldn't/i) });
    expect(result).not.toHaveProperty("covers");
  });
});

describe("get_turned_away_demand chat tool", () => {
  let log: FastifyBaseLogger;
  let api: { reservations: { getLostDemand: ReturnType<typeof vi.fn> } };

  const report = {
    venueId: "v1",
    from: "2026-10-05",
    to: "2026-11-01",
    total: 14,
    cells: [
      { weekday: 5, hour: 19, searches: 6 },
      { weekday: 6, hour: 20, searches: 4 },
      { weekday: 5, hour: 20, searches: 1 },
    ],
    anyTime: [{ weekday: 0, searches: 3 }],
  };

  beforeEach(() => {
    log = createMockLogger();
    api = { reservations: { getLostDemand: vi.fn().mockResolvedValue(report) } };
  });

  function run(
    input: Record<string, unknown>,
    options: { venueId?: string; timeZone?: string } = { venueId: "v1" }
  ) {
    const tools = createAgentTools(log, api as never, options);
    return tools.get_turned_away_demand!.execute!(input as never, toolCtx);
  }

  it("is a read: not confirm-gated", () => {
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("get_turned_away_demand");
  });

  it("pins the venue and passes only a valid window", async () => {
    await run({ venueId: "other", from: "2026-10-05", to: "2026-11-01" });

    expect(api.reservations.getLostDemand).toHaveBeenCalledWith({
      venueId: "v1",
      from: "2026-10-05",
      to: "2026-11-01",
    });
  });

  it("names the busiest weekday and hour, busiest first, with any-time misses apart", async () => {
    const result = await run({});

    expect(api.reservations.getLostDemand).toHaveBeenCalledWith({ venueId: "v1" });
    expect(result).toEqual({
      from: "2026-10-05",
      to: "2026-11-01",
      total: 14,
      busiest: [
        { weekday: "Friday", hour: "19:00", searches: 6 },
        { weekday: "Saturday", hour: "20:00", searches: 4 },
        { weekday: "Friday", hour: "20:00", searches: 1 },
      ],
      noTimeNamed: [{ weekday: "Sunday", searches: 3 }],
    });
  });

  it("says plainly when nobody was turned away", async () => {
    api.reservations.getLostDemand.mockResolvedValue({
      ...report,
      total: 0,
      cells: [],
      anyTime: [],
    });

    expect(await run({})).toMatchObject({ total: 0, busiest: [], noTimeNamed: [] });
  });

  it("needs a selected venue", async () => {
    expect(await run({}, {})).toMatchObject({ error: expect.stringContaining("No venue") });
    expect(api.reservations.getLostDemand).not.toHaveBeenCalled();
  });

  it("refuses an unreadable date without calling the API", async () => {
    expect(await run({ from: "last week" })).toMatchObject({ rejected: true });
    expect(api.reservations.getLostDemand).not.toHaveBeenCalled();
  });

  it("never turns a failed read into zeros", async () => {
    api.reservations.getLostDemand.mockRejectedValue(new Error("boom"));

    const result = await run({});

    expect(result).toMatchObject({ unknown: true, error: expect.stringMatching(/couldn't/i) });
    expect(result).not.toHaveProperty("total");
  });
});

describe("estimate_new_seating chat tool", () => {
  let log: FastifyBaseLogger;
  let api: { reservations: { getLostDemandWhatIf: ReturnType<typeof vi.fn> } };

  const estimate = {
    venueId: "v1",
    from: "2026-10-28",
    to: "2026-11-24",
    weekday: 2,
    minute: 21 * 60 + 30,
    outcome: "estimated",
    searches: 7,
    windowStart: 21 * 60,
    windowEnd: 22 * 60,
    minParty: null,
    maxParty: null,
    anyTimeSearches: 3,
  };

  beforeEach(() => {
    log = createMockLogger();
    api = { reservations: { getLostDemandWhatIf: vi.fn().mockResolvedValue(estimate) } };
  });

  function run(
    input: Record<string, unknown>,
    options: { venueId?: string; timeZone?: string } = { venueId: "v1" }
  ) {
    const tools = createAgentTools(log, api as never, options);
    return tools.estimate_new_seating!.execute!(input as never, toolCtx);
  }

  it("is a read: not confirm-gated, so it never changes availability", () => {
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("estimate_new_seating");
  });

  it("pins the venue and sends the weekday as its index and the time as given", async () => {
    await run({ venueId: "other", weekday: "Tuesday", time: "21:30", minParty: 2, maxParty: 4 });

    expect(api.reservations.getLostDemandWhatIf).toHaveBeenCalledWith({
      venueId: "v1",
      weekday: 2,
      time: "21:30",
      minParty: 2,
      maxParty: 4,
    });
  });

  it("returns the count labelled as an estimate with its method, whole-day misses apart", async () => {
    const result = await run({ weekday: "Tuesday", time: "21:30" });

    expect(result).toMatchObject({
      isEstimate: true,
      outcome: "estimated",
      weekday: "Tuesday",
      time: "21:30",
      searches: 7,
      window: { from: "21:00", to: "22:00" },
      noTimeNamedSearches: 3,
      lookback: { from: "2026-10-28", to: "2026-11-24" },
    });
    expect((result as { method: string }).method).toMatch(/estimate, not a forecast/i);
    expect((result as { method: string }).method).toMatch(/found no table/i);
  });

  it("reports an outcome with no number for a closed day", async () => {
    api.reservations.getLostDemandWhatIf.mockResolvedValue({
      ...estimate,
      outcome: "closed",
      searches: 0,
    });

    const result = await run({ weekday: "Tuesday", time: "21:30" });

    expect(result).toMatchObject({ outcome: "closed", isEstimate: true });
    expect(result).not.toHaveProperty("searches");
  });

  it("refuses an unreadable time or weekday without calling the API", async () => {
    expect(await run({ weekday: "Tuesday", time: "9:30pm" })).toMatchObject({ rejected: true });
    expect(await run({ weekday: "Someday", time: "21:30" })).toMatchObject({ rejected: true });
    expect(api.reservations.getLostDemandWhatIf).not.toHaveBeenCalled();
  });

  it("refuses a backwards party range", async () => {
    expect(
      await run({ weekday: "Tuesday", time: "21:30", minParty: 6, maxParty: 2 })
    ).toMatchObject({ rejected: true });
    expect(api.reservations.getLostDemandWhatIf).not.toHaveBeenCalled();
  });

  it("needs a selected venue", async () => {
    expect(await run({ weekday: "Tuesday", time: "21:30" }, {})).toMatchObject({
      error: expect.stringContaining("No venue"),
    });
  });

  it("never turns a failed read into zeros", async () => {
    api.reservations.getLostDemandWhatIf.mockRejectedValue(new Error("boom"));

    const result = await run({ weekday: "Tuesday", time: "21:30" });

    expect(result).toMatchObject({ unknown: true, error: expect.stringMatching(/couldn't/i) });
    expect(result).not.toHaveProperty("searches");
  });
});

describe("get_briefing chat tool", () => {
  let log: FastifyBaseLogger;
  let api: { briefing: { list: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T03:00:00.000Z"));
    log = createMockLogger();
    api = { briefing: { list: vi.fn().mockResolvedValue([entry()]) } };
  });

  afterEach(() => vi.useRealTimers());

  function run(
    input: Record<string, unknown>,
    options: { venueId?: string; timeZone?: string } = { venueId: "v1" }
  ) {
    const tools = createAgentTools(log, api as never, options);
    return tools.get_briefing!.execute!(input as never, toolCtx);
  }

  it("is a read: not confirm-gated", () => {
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("get_briefing");
  });

  it("reads the venue's own today, pinned to the selected venue", async () => {
    const result = await run({}, { venueId: "v1", timeZone: "America/Los_Angeles" });

    // 03:00Z on Nov 2 is still Nov 1 in Los Angeles.
    expect(api.briefing.list).toHaveBeenCalledWith({ venueId: "v1", date: "2026-11-01" });
    expect(result).toMatchObject({ date: "2026-11-01", count: 1, covers: 4 });
  });

  it("reads a given date and never takes the venue from the model", async () => {
    await run({ date: "2026-11-05", venueId: "other" });

    expect(api.briefing.list).toHaveBeenCalledWith({ venueId: "v1", date: "2026-11-05" });
  });

  it("gives each seating with local time, table, guest notes and dietary needs", async () => {
    const result = (await run({}, { venueId: "v1", timeZone: "America/Los_Angeles" })) as {
      entries: Record<string, unknown>[];
    };

    expect(result.entries[0]).toMatchObject({
      localTime: "18:30", // PST after the Nov 1 change
      partySize: 4,
      status: "CONFIRMED",
      guestName: "Ada Lovelace",
      table: "Booth 2",
      occasion: "Birthday",
      seatingPreference: "Booth",
      notes: "Window seat",
      visitCount: 7,
      dietaryRestrictions: ["nuts"],
      tags: ["VIP"],
      staffNotes: ["Regular"],
    });
    expect(JSON.stringify(result)).not.toContain("email");
  });

  it("says plainly when the briefing is empty", async () => {
    api.briefing.list.mockResolvedValue([]);

    const result = await run({});

    expect(result).toMatchObject({ entries: [], count: 0, covers: 0 });
  });

  it("needs a selected venue", async () => {
    const result = await run({}, {});

    expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
    expect(api.briefing.list).not.toHaveBeenCalled();
  });

  it("refuses an unreadable date without calling the API", async () => {
    const result = await run({ date: "next friday" });

    expect(result).toMatchObject({ rejected: true });
    expect(api.briefing.list).not.toHaveBeenCalled();
  });

  it("passes on a permission refusal", async () => {
    api.briefing.list.mockRejectedValue(problem(403));

    const result = await run({});

    expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
    expect(result).not.toHaveProperty("entries");
  });

  it("passes on another refusal's reason, with no entries", async () => {
    api.briefing.list.mockRejectedValue(problem(400, "Bad date."));

    const result = await run({});

    expect(result).toMatchObject({ refused: true, error: "Bad date." });
    expect(result).not.toHaveProperty("entries");
  });

  it("never turns a failed read into an empty briefing", async () => {
    api.briefing.list.mockRejectedValue(new Error("boom"));

    const result = await run({});

    expect(result).toMatchObject({ unknown: true, error: expect.stringMatching(/couldn't/i) });
    expect(result).not.toHaveProperty("entries");
    expect(result).not.toHaveProperty("count");
  });
});
