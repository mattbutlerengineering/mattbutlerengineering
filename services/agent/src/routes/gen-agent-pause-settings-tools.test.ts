import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools, todayIn } from "./gen-agent-tools.js";

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
    availability: {
      getConfig: vi.fn(),
      getClosureImpact: vi.fn(),
      createClosure: vi.fn(),
      reopenClosure: vi.fn(),
    },
    tables: { list: vi.fn() },
    venues: { get: vi.fn(), update: vi.fn() },
  };
}

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

const TODAY = todayIn("UTC");
const PAUSE_RULE = {
  id: "r-pause",
  kind: "closure",
  targetKind: "booking",
  bookingTypes: ["online"],
  origin: "pause",
  startsOn: TODAY,
  endsOn: null,
  window: null,
  guestMessage: "Back soon",
};
const TABLES_RULE = {
  id: "r-tables",
  kind: "closure",
  targetKind: "tables",
  tableIds: ["t1", "t2"],
  startsOn: TODAY,
  endsOn: null,
  window: null,
};

function configWith(...dateRules: object[]) {
  return {
    version: 3,
    config: {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules,
    },
  };
}

const TABLES = {
  data: [
    { id: "t1", name: "Patio 1", tableNumber: "1" },
    { id: "t2", name: "Patio 2", tableNumber: "2" },
    { id: "t3", name: "Bar", tableNumber: "3" },
  ],
};

const VENUE = {
  id: "v1",
  name: "Sorrel",
  slug: "sorrel",
  settings: {
    maxPartySize: 6,
    tonightNote: "Live jazz",
    profile: { type: "casual", description: "A neighbourhood spot" },
  },
};

describe("pause and settings chat tools", () => {
  let api: ReturnType<typeof createMockApiClient>;
  let log: FastifyBaseLogger;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    api.availability.getConfig.mockResolvedValue(configWith());
    api.availability.getClosureImpact.mockResolvedValue({ reservations: 0, covers: 0, groups: [] });
    api.availability.createClosure.mockResolvedValue({ version: 4 });
    api.availability.reopenClosure.mockResolvedValue({ version: 4 });
    api.tables.list.mockResolvedValue(TABLES);
    api.venues.get.mockResolvedValue(VENUE);
    api.venues.update.mockResolvedValue(VENUE);
  });

  function held(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, { venueId: "v1", timeZone: "UTC" });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  function run(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, {
      venueId: "v1",
      timeZone: "UTC",
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  function noWrites() {
    expect(api.availability.createClosure).not.toHaveBeenCalled();
    expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    expect(api.venues.update).not.toHaveBeenCalled();
  }

  describe.each([
    ["pause_online_booking", { until: "until reopened" }],
    ["resume_online_booking", {}],
    ["pause_tables", { tables: ["Patio 1"], until: "until reopened" }],
    ["resume_tables", { tables: ["Patio 1"] }],
    ["update_venue_settings", { maxPartySize: 8 }],
    ["update_venue_profile", { description: "New" }],
  ])("%s", (name, input) => {
    it("holds for confirmation and writes nothing before Confirm", async () => {
      const result = await held(name, input);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.getConfig).not.toHaveBeenCalled();
      noWrites();
    });
  });

  describe("pause_online_booking", () => {
    it("saves an online-only booking closure from today, marked as a pause", async () => {
      const result = await run("pause_online_booking", {
        until: "until reopened",
        message: "Back soon",
      });

      expect(api.availability.createClosure).toHaveBeenCalledWith(
        "v1",
        {
          expectedVersion: 3,
          decisions: [],
          rule: expect.objectContaining({
            kind: "closure",
            targetKind: "booking",
            bookingTypes: ["online"],
            origin: "pause",
            startsOn: TODAY,
            endsOn: null,
            window: null,
            guestMessage: "Back soon",
          }),
        },
        expect.any(String)
      );
      expect(result).toMatchObject({ saved: true, until: "until reopened" });
    });

    it("pauses through a later date", async () => {
      await run("pause_online_booking", { until: "2099-01-05" });

      expect(api.availability.createClosure.mock.calls[0]![1].rule).toMatchObject({
        endsOn: "2099-01-05",
      });
    });

    it.each([["2000-01-01"], ["not a date"]])("refuses the end date %s", async (until) => {
      const result = await run("pause_online_booking", { until });

      expect(result).toMatchObject({ error: expect.any(String) });
      noWrites();
    });

    it("refuses when online booking is already paused", async () => {
      api.availability.getConfig.mockResolvedValue(configWith(PAUSE_RULE));

      const result = await run("pause_online_booking", { until: "until reopened" });

      expect(result).toMatchObject({ error: expect.stringMatching(/already paused/) });
      noWrites();
    });

    it("says it may have saved when the server never answered", async () => {
      api.availability.createClosure.mockRejectedValue(new TypeError("fetch failed"));

      const result = await run("pause_online_booking", { until: "until reopened" });

      expect(result).toMatchObject({ error: expect.stringMatching(/list_closures/) });
    });
  });

  describe("resume_online_booking (undo of a pause)", () => {
    it("reopens the paused closure so online booking returns", async () => {
      api.availability.getConfig.mockResolvedValue(configWith(PAUSE_RULE));

      const result = await run("resume_online_booking", {});

      expect(api.availability.reopenClosure).toHaveBeenCalledWith(
        "v1",
        "r-pause",
        false,
        expect.anything(),
        { rule: PAUSE_RULE, children: [] }
      );
      expect(result).toMatchObject({ resumed: true });
    });

    it("refuses when online booking is not paused", async () => {
      const result = await run("resume_online_booking", {});

      expect(result).toMatchObject({ error: expect.stringMatching(/isn't paused/) });
      noWrites();
    });

    it("refuses when a pause conflict leaves the closure changed", async () => {
      api.availability.getConfig.mockResolvedValue(configWith(PAUSE_RULE));
      api.availability.reopenClosure.mockRejectedValue(problem(409, { code: "version-conflict" }));

      const result = await run("resume_online_booking", {});

      expect(result).toMatchObject({ refused: true });
    });
  });

  describe("pause_tables", () => {
    it("saves a table closure for the named tables when no booking is affected", async () => {
      const result = await run("pause_tables", {
        tables: ["Patio 1", "2"],
        until: "until reopened",
      });

      expect(api.availability.createClosure.mock.calls[0]![1].rule).toMatchObject({
        kind: "closure",
        targetKind: "tables",
        tableIds: ["t1", "t2"],
        startsOn: TODAY,
        endsOn: null,
      });
      expect(result).toMatchObject({ saved: true, tables: ["Patio 1", "Patio 2"] });
    });

    it("refuses an unknown table and writes nothing", async () => {
      const result = await run("pause_tables", {
        tables: ["Patio 1", "Roof"],
        until: "2099-01-05",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/Roof/) });
      noWrites();
    });

    it("refuses a bad end date and writes nothing", async () => {
      const result = await run("pause_tables", { tables: ["Bar"], until: "yesterday" });

      expect(result).toMatchObject({ error: expect.any(String) });
      noWrites();
    });

    it("refuses when bookings sit on those tables", async () => {
      api.availability.getClosureImpact.mockResolvedValue({
        reservations: 2,
        covers: 6,
        groups: [{ date: TODAY }],
      });

      const result = await run("pause_tables", { tables: ["Bar"], until: "until reopened" });

      expect(result).toMatchObject({ refused: true, needsDecisions: true });
      noWrites();
    });
  });

  describe("resume_tables (undo of a table pause)", () => {
    it("reopens the closure holding exactly those tables", async () => {
      api.availability.getConfig.mockResolvedValue(configWith(TABLES_RULE));

      const result = await run("resume_tables", { tables: ["Patio 2", "Patio 1"] });

      expect(api.availability.reopenClosure).toHaveBeenCalledWith(
        "v1",
        "r-tables",
        false,
        expect.anything(),
        { rule: TABLES_RULE, children: [] }
      );
      expect(result).toMatchObject({ resumed: true });
    });

    it("refuses tables that are not paused together and writes nothing", async () => {
      api.availability.getConfig.mockResolvedValue(configWith(TABLES_RULE));

      const result = await run("resume_tables", { tables: ["Patio 1"] });

      expect(result).toMatchObject({ error: expect.stringMatching(/aren't paused/) });
      noWrites();
    });

    it("refuses an unknown table", async () => {
      const result = await run("resume_tables", { tables: ["Roof"] });

      expect(result).toMatchObject({ error: expect.stringMatching(/Roof/) });
      noWrites();
    });
  });

  describe("get_venue_settings", () => {
    it("reads settings and profile without confirmation, nulls for unset values", async () => {
      const result = await held("get_venue_settings", {});

      expect(result).toMatchObject({
        name: "Sorrel",
        settings: { maxPartySize: 6, phone: null, requirePhone: null },
        profile: { type: "casual", website: null, description: "A neighbourhood spot" },
      });
      expect(JSON.stringify(result)).not.toMatch(/Live jazz/);
      noWrites();
    });
  });

  describe("update_venue_settings", () => {
    it("changes one setting, keeps every other setting, and reports the old value", async () => {
      const result = await run("update_venue_settings", { maxPartySize: 8, phone: "555-0100" });

      expect(api.venues.update).toHaveBeenCalledWith("v1", {
        settings: { ...VENUE.settings, maxPartySize: 8, phone: "555-0100" },
      });
      expect(result).toMatchObject({
        updated: true,
        previous: { maxPartySize: 6, phone: null },
      });
    });

    it("undoes by sending the previous values back", async () => {
      api.venues.get.mockResolvedValue({
        ...VENUE,
        settings: { ...VENUE.settings, maxPartySize: 8, phone: "555-0100" },
      });

      await run("update_venue_settings", { maxPartySize: 6, phone: null });

      const sent = api.venues.update.mock.calls[0]![1].settings;
      expect(sent).toEqual(VENUE.settings);
      expect("phone" in sent).toBe(false);
    });

    it("refuses an empty change and writes nothing", async () => {
      const result = await run("update_venue_settings", {});

      expect(result).toMatchObject({ error: expect.any(String) });
      noWrites();
    });

    it("says it may have saved when the server never answered", async () => {
      api.venues.update.mockRejectedValue(new TypeError("fetch failed"));

      const result = await run("update_venue_settings", { maxPartySize: 8 });

      expect(result).toMatchObject({ error: expect.stringMatching(/Couldn't confirm/) });
    });

    it("reports a manager-only refusal as no permission", async () => {
      api.venues.update.mockRejectedValue(problem(403));

      const result = await run("update_venue_settings", { maxPartySize: 8 });

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/) });
    });

    it("rejects a value outside the allowed range before it can run", async () => {
      const result = await run("update_venue_settings", { maxPartySize: -3 });

      expect(result).toMatchObject({ error: expect.stringMatching(/invalid/) });
      noWrites();
    });

    it("has no way to change the tonight note or the team", () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = JSON.stringify(
        (tools["update_venue_settings"] as { inputSchema: unknown }).inputSchema
      );

      expect(schema).not.toMatch(/tonightNote|role|team|theme/i);
    });
  });

  describe("update_venue_profile", () => {
    it("changes the venue name and profile, keeps the rest, and reports old values", async () => {
      const result = await run("update_venue_profile", {
        name: "Sorrel Kitchen",
        description: "Wood-fired",
        cuisines: ["Italian"],
      });

      expect(api.venues.update).toHaveBeenCalledWith("v1", {
        name: "Sorrel Kitchen",
        settings: {
          ...VENUE.settings,
          profile: { type: "casual", description: "Wood-fired", cuisines: ["Italian"] },
        },
      });
      expect(result).toMatchObject({
        updated: true,
        previous: { name: "Sorrel", description: "A neighbourhood spot", cuisines: null },
      });
    });

    it("undoes by clearing a field that was unset before", async () => {
      api.venues.get.mockResolvedValue({
        ...VENUE,
        settings: { ...VENUE.settings, profile: { type: "casual", cuisines: ["Italian"] } },
      });

      await run("update_venue_profile", { cuisines: null });

      expect(api.venues.update.mock.calls[0]![1].settings.profile).toEqual({ type: "casual" });
    });

    it("refuses a website that is not http(s) and writes nothing", async () => {
      const result = await run("update_venue_profile", { website: "javascript:alert(1)" });

      expect(result).toMatchObject({ error: expect.stringMatching(/invalid/) });
      noWrites();
    });

    it("refuses an empty change and writes nothing", async () => {
      const result = await run("update_venue_profile", {});

      expect(result).toMatchObject({ error: expect.any(String) });
      noWrites();
    });

    it("refuses when the venue can't be read", async () => {
      api.venues.get.mockRejectedValue(problem(502));

      const result = await run("update_venue_profile", { description: "x" });

      expect(result).toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
      noWrites();
    });
  });
});
