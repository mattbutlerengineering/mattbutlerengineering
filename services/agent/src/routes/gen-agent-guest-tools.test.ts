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
    guests: {
      search: vi.fn(),
      findOrCreate: vi.fn(),
      update: vi.fn(),
      addNote: vi.fn(),
      getLapsing: vi.fn(),
      sendWinBack: vi.fn(),
    },
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

function guest(fields: Record<string, unknown>) {
  return {
    id: "g1",
    venueId: "v1",
    name: "Ana Lopez",
    email: "ana@example.com",
    phone: "+15555550100",
    notes: null,
    visitCount: 4,
    tags: ["regular"],
    dietaryRestrictions: null,
    ...fields,
  };
}

describe("guest chat tools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    api.guests.search.mockResolvedValue({ data: [guest({})] });
    api.guests.getLapsing.mockResolvedValue([
      {
        guestId: "g7",
        name: "Sam Park",
        email: "sam@example.com",
        phone: null,
        communicationPreference: "both",
        avgFrequencyDays: 14,
        daysSinceLastVisit: 60,
        daysOverdue: 46,
      },
    ]);
  });

  function run(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, {
      venueId: "v1",
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  describe("add_guest", () => {
    it("adds the guest to the selected venue, matching an existing profile by email or phone", async () => {
      api.guests.findOrCreate.mockResolvedValue(
        guest({ id: "g9", name: "Kim Lee", visitCount: 0 })
      );

      const result = await run("add_guest", {
        name: "Kim Lee",
        phone: "+15555550111",
        dietaryRestrictions: ["vegan"],
      });

      expect(api.guests.findOrCreate).toHaveBeenCalledWith({
        venueId: "v1",
        name: "Kim Lee",
        phone: "+15555550111",
        dietaryRestrictions: ["vegan"],
      });
      expect(result).toMatchObject({ saved: true, guest: { name: "Kim Lee", visitCount: 0 } });
      expect(JSON.stringify(result)).not.toContain("example.com");
    });
  });

  describe("add_guest needs a way to reach the guest", () => {
    // The server refuses a guest with neither: catch it before the user is asked to confirm.
    it("rejects a guest with neither phone nor email before anything is confirmed", () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools.add_guest!.inputSchema as unknown as {
        safeParse: (v: unknown) => { success: boolean };
      };

      expect(schema.safeParse({ name: "Kim Lee" }).success).toBe(false);
      expect(schema.safeParse({ name: "Kim Lee", email: "kim@example.com" }).success).toBe(true);
    });
  });

  describe("update_guest", () => {
    it("replaces the profile notes when asked", async () => {
      api.guests.update.mockResolvedValue(guest({ notes: "Prefers the window" }));

      await run("update_guest", { guest: "Ana Lopez", notes: "Prefers the window" });

      expect(api.guests.update).toHaveBeenCalledWith("g1", { notes: "Prefers the window" });
    });

    it("adds and removes tags against the guest's current ones", async () => {
      api.guests.search.mockResolvedValue({ data: [guest({ tags: ["regular", "patio"] })] });
      api.guests.update.mockResolvedValue(guest({ tags: ["regular", "vip"] }));

      const result = await run("update_guest", {
        guest: "ana lopez",
        addTags: ["vip"],
        removeTags: ["patio"],
      });

      expect(api.guests.search).toHaveBeenCalledWith({ venueId: "v1", query: "ana lopez" });
      expect(api.guests.update).toHaveBeenCalledWith("g1", { tags: ["regular", "vip"] });
      expect(result).toMatchObject({ updated: true, guest: { name: "Ana Lopez" } });
    });

    it("replaces dietary restrictions and contact details when given", async () => {
      api.guests.update.mockResolvedValue(guest({}));

      await run("update_guest", {
        guest: "Ana Lopez",
        dietaryRestrictions: ["gluten-free"],
        phone: "+15555550222",
      });

      expect(api.guests.update).toHaveBeenCalledWith("g1", {
        dietaryRestrictions: ["gluten-free"],
        phone: "+15555550222",
      });
    });

    it("rejects an update that changes nothing before anything is confirmed", () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools.update_guest!.inputSchema as unknown as {
        safeParse: (v: unknown) => { success: boolean };
      };

      expect(schema.safeParse({ guest: "Ana Lopez" }).success).toBe(false);
      expect(schema.safeParse({ guest: "Ana Lopez", addTags: ["vip"] }).success).toBe(true);
    });

    it("asks which guest when two share the name", async () => {
      api.guests.search.mockResolvedValue({
        data: [guest({}), guest({ id: "g2", phone: "+15555550999", email: null })],
      });

      const result = await run("update_guest", { guest: "Ana Lopez", addTags: ["vip"] });

      expect(result).toMatchObject({ error: expect.stringMatching(/phone or email/i) });
      expect(api.guests.update).not.toHaveBeenCalled();
    });

    it("tells two guests apart by phone or email", async () => {
      api.guests.search.mockResolvedValue({
        data: [guest({}), guest({ id: "g2", phone: "+15555550999", email: null })],
      });
      api.guests.update.mockResolvedValue(guest({ id: "g2" }));

      await run("update_guest", { guest: "Ana Lopez", contact: "+15555550999", addTags: ["vip"] });

      expect(api.guests.update).toHaveBeenCalledWith("g2", { tags: ["regular", "vip"] });
    });

    it("refuses a guest that isn't found rather than creating one", async () => {
      api.guests.search.mockResolvedValue({ data: [] });

      const result = await run("update_guest", { guest: "Nobody", addTags: ["vip"] });

      expect(result).toMatchObject({ error: expect.stringContaining("Nobody") });
      expect(api.guests.update).not.toHaveBeenCalled();
    });
  });

  describe("add_guest_note", () => {
    it("adds a staff note to the guest's profile", async () => {
      api.guests.addNote.mockResolvedValue(guest({}));

      const result = await run("add_guest_note", { guest: "Ana Lopez", text: "Prefers booth 4" });

      expect(api.guests.addNote).toHaveBeenCalledWith("g1", "Prefers booth 4");
      expect(result).toMatchObject({ noted: true });
    });
  });

  describe("list_lapsing_guests", () => {
    it("lists guests overdue for a visit without their contact details", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools.list_lapsing_guests!.execute!({} as never, toolCtx);

      expect(api.guests.getLapsing).toHaveBeenCalledWith("v1");
      expect(result).toEqual({
        guests: [{ name: "Sam Park", daysSinceLastVisit: 60, daysOverdue: 46 }],
      });
    });
  });

  describe("send_win_back", () => {
    it("sends the win-back message to a lapsing guest", async () => {
      api.guests.sendWinBack.mockResolvedValue({ sent: true });

      const result = await run("send_win_back", { guest: "sam park" });

      expect(api.guests.sendWinBack).toHaveBeenCalledWith("g7");
      expect(result).toMatchObject({ sent: true, guest: "Sam Park" });
    });

    it("refuses a guest who isn't lapsing", async () => {
      const result = await run("send_win_back", { guest: "Ana Lopez" });

      expect(result).toMatchObject({ error: expect.stringContaining("Ana Lopez") });
      expect(api.guests.sendWinBack).not.toHaveBeenCalled();
    });

    it("says so when the message wasn't sent", async () => {
      api.guests.sendWinBack.mockResolvedValue({ sent: false });

      const result = await run("send_win_back", { guest: "Sam Park" });

      expect(result).toMatchObject({ sent: false });
    });
  });

  describe.each([
    ["add_guest", { name: "Kim Lee", phone: "+15555550111" }],
    ["update_guest", { guest: "Ana Lopez", addTags: ["vip"] }],
    ["add_guest_note", { guest: "Ana Lopez", text: "Prefers booth 4" }],
    ["send_win_back", { guest: "Sam Park" }],
  ])("%s", (toolName, input) => {
    it("holds the change for the user's confirmation", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.guests.findOrCreate).not.toHaveBeenCalled();
      expect(api.guests.update).not.toHaveBeenCalled();
      expect(api.guests.addNote).not.toHaveBeenCalled();
      expect(api.guests.sendWinBack).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const tools = createAgentTools(log, api as never, {
        confirmedAction: { actionId: "call-1", toolName, toolInput: input },
      });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
    });

    it("passes on a 403 in plain words", async () => {
      for (const fn of Object.values(api.guests)) fn.mockRejectedValue(problem(403));

      const result = await run(toolName, input);

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
    });
  });
});
