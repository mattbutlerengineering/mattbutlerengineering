import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";

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

function createMockApiClient() {
  return {
    waitlist: {
      list: vi.fn(),
      create: vi.fn(),
      notify: vi.fn(),
      seat: vi.fn(),
      cancel: vi.fn(),
    },
    reservations: { walkIn: vi.fn() },
    tables: { list: vi.fn() },
  };
}

/** What `ApiClientError` looks like to the tools: a status-bearing ProblemDetails. */
function problem(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused.", ...extra },
  });
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

function entry(fields: Record<string, unknown>) {
  return {
    id: "w1",
    venueId: "v1",
    partySize: 2,
    guestName: "Lopez",
    guestPhone: "+15555550100",
    position: 1,
    estimatedWaitMinutes: 15,
    status: "waiting",
    notifiedAt: null,
    expiresAt: null,
    createdAt: "2026-10-28T19:30:00Z",
    updatedAt: "2026-10-28T19:30:00Z",
    ...fields,
  };
}

const WAITLIST = [
  entry({}),
  entry({ id: "w2", guestName: "Chen", partySize: 4, position: 2, status: "notified" }),
  entry({ id: "w3", guestName: "Smith", partySize: 2, position: 3 }),
  entry({ id: "w4", guestName: "Smith", partySize: 6, position: 4 }),
  entry({ id: "w5", guestName: "Old", status: "seated", position: 0 }),
];

describe("waitlist chat tools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    api.waitlist.list.mockResolvedValue(WAITLIST);
    api.tables.list.mockResolvedValue({
      data: [
        { id: "t1", name: "Patio 2", tableNumber: "12", status: "AVAILABLE" },
        { id: "t3", name: "Window", tableNumber: "5", status: "DIRTY" },
      ],
    });
  });

  function run(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, {
      venueId: "v1",
      timeZone: "America/Los_Angeles",
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  describe("list_waitlist", () => {
    it("lists the parties still waiting, in order, without their phone numbers", async () => {
      const tools = createAgentTools(log, api as never, {
        venueId: "v1",
        timeZone: "America/Los_Angeles",
      });

      const result = (await tools.list_waitlist!.execute!({} as never, toolCtx)) as {
        parties: Array<Record<string, unknown>>;
      };

      expect(api.waitlist.list).toHaveBeenCalledWith("v1");
      expect(result.parties.map((p) => p["guestName"])).toEqual([
        "Lopez",
        "Chen",
        "Smith",
        "Smith",
      ]);
      expect(result.parties[0]).toMatchObject({
        partySize: 2,
        position: 1,
        quotedWaitMinutes: 15,
        status: "waiting",
        joinedAt: "12:30",
      });
      expect(JSON.stringify(result)).not.toContain("+1555");
    });
  });

  describe("add_to_waitlist", () => {
    it("adds the party to the selected venue's waitlist", async () => {
      api.waitlist.create.mockResolvedValue(
        entry({ id: "w9", position: 5, estimatedWaitMinutes: 25 })
      );

      const result = await run("add_to_waitlist", {
        guestName: "Park",
        partySize: 3,
        guestPhone: "+15555550199",
      });

      expect(api.waitlist.create).toHaveBeenCalledWith({
        venueId: "v1",
        guestName: "Park",
        partySize: 3,
        guestPhone: "+15555550199",
      });
      expect(result).toMatchObject({ added: true, position: 5, quotedWaitMinutes: 25 });
    });
  });

  describe("notify_waitlist_party", () => {
    it("tells the named party their table is ready", async () => {
      api.waitlist.notify.mockResolvedValue(entry({ status: "notified" }));

      const result = await run("notify_waitlist_party", { guestName: "lopez" });

      expect(api.waitlist.notify).toHaveBeenCalledWith("w1");
      expect(result).toMatchObject({ notified: true, guestName: "Lopez" });
    });

    // The server only notifies a waiting party; a second notify sends nothing yet answers 200.
    it("refuses a party already told, rather than claiming a second text", async () => {
      api.waitlist.list.mockResolvedValue([
        entry({
          id: "w2",
          guestName: "Chen",
          status: "notified",
          notifiedAt: "2026-10-28T19:45:00Z",
        }),
      ]);

      const result = await run("notify_waitlist_party", { guestName: "Chen" });

      expect(result).toMatchObject({ error: expect.stringMatching(/already told .*12:45/i) });
      expect(api.waitlist.notify).not.toHaveBeenCalled();
    });

    it("asks which party when two share the name", async () => {
      const result = await run("notify_waitlist_party", { guestName: "Smith" });

      expect(result).toMatchObject({ error: expect.stringMatching(/party size/i) });
      expect(api.waitlist.notify).not.toHaveBeenCalled();
    });

    it("tells two parties apart by size", async () => {
      api.waitlist.notify.mockResolvedValue(entry({ id: "w4", status: "notified" }));

      await run("notify_waitlist_party", { guestName: "Smith", partySize: 6 });

      expect(api.waitlist.notify).toHaveBeenCalledWith("w4");
    });

    it("ignores parties no longer waiting", async () => {
      const result = await run("notify_waitlist_party", { guestName: "Old" });

      expect(result).toMatchObject({ error: expect.stringContaining("Old") });
    });
  });

  describe("seat_waitlist_party", () => {
    it("creates the walk-in at the table, then marks the party seated", async () => {
      api.reservations.walkIn.mockResolvedValue({ id: "r1" });
      api.waitlist.seat.mockResolvedValue(entry({ status: "seated" }));

      const result = await run("seat_waitlist_party", { guestName: "Lopez", table: "Patio 2" });

      expect(api.reservations.walkIn).toHaveBeenCalledWith({
        venueId: "v1",
        partySize: 2,
        tableId: "t1",
        guestName: "Lopez",
      });
      expect(api.waitlist.seat).toHaveBeenCalledWith("w1");
      expect(result).toMatchObject({ seated: true, table: "Patio 2" });
    });

    it("refuses a table that isn't available before changing anything", async () => {
      const result = await run("seat_waitlist_party", { guestName: "Lopez", table: "Window" });

      expect(result).toMatchObject({ error: expect.stringMatching(/Window .*dirty/i) });
      expect(api.reservations.walkIn).not.toHaveBeenCalled();
    });

    it("says the party is seated when only the waitlist update fails", async () => {
      api.reservations.walkIn.mockResolvedValue({ id: "r1" });
      api.waitlist.seat.mockRejectedValue(new Error("socket hang up"));

      const result = await run("seat_waitlist_party", { guestName: "Lopez", table: "Patio 2" });

      expect(result).toMatchObject({ seated: true, waitlistStale: true });
    });

    it("passes on the server's refusal when the walk-in is refused", async () => {
      api.reservations.walkIn.mockRejectedValue(problem(409, { detail: "Table is taken." }));

      const result = await run("seat_waitlist_party", { guestName: "Lopez", table: "Patio 2" });

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringContaining("Table is taken."),
      });
      expect(api.waitlist.seat).not.toHaveBeenCalled();
    });
  });

  describe("remove_from_waitlist", () => {
    it("takes the named party off the waitlist", async () => {
      api.waitlist.cancel.mockResolvedValue(entry({ status: "cancelled" }));

      const result = await run("remove_from_waitlist", { guestName: "Chen" });

      expect(api.waitlist.cancel).toHaveBeenCalledWith("w2");
      expect(result).toMatchObject({ removed: true, guestName: "Chen" });
    });
  });

  describe.each([
    ["add_to_waitlist", { guestName: "Park", partySize: 3, guestPhone: "+15555550199" }],
    ["notify_waitlist_party", { guestName: "Lopez" }],
    ["seat_waitlist_party", { guestName: "Lopez", table: "Patio 2" }],
    ["remove_from_waitlist", { guestName: "Lopez" }],
  ])("%s", (toolName, input) => {
    it("holds the change for the user's confirmation", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.waitlist.create).not.toHaveBeenCalled();
      expect(api.waitlist.notify).not.toHaveBeenCalled();
      expect(api.reservations.walkIn).not.toHaveBeenCalled();
      expect(api.waitlist.cancel).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const tools = createAgentTools(log, api as never, {
        confirmedAction: { actionId: "call-1", toolName, toolInput: input },
      });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
      expect(api.waitlist.list).not.toHaveBeenCalled();
      expect(api.waitlist.create).not.toHaveBeenCalled();
    });

    it("passes on a 403 in plain words", async () => {
      api.waitlist.list.mockRejectedValue(problem(403));
      api.waitlist.create.mockRejectedValue(problem(403));

      const result = await run(toolName, input);

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
    });
  });
});
