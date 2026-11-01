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
