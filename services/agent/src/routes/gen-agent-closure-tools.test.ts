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

function createMockApiClient() {
  return {
    availability: {
      getConfig: vi.fn(),
      getClosureImpact: vi.fn(),
      createClosure: vi.fn(),
      listClosures: vi.fn(),
      reopenClosure: vi.fn(),
      listDays: vi.fn(),
    },
  };
}

/** What `ApiClientError` looks like to the tools: a status-bearing ProblemDetails. */
function problem(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused.", ...extra },
  });
}

const NOW = new Date("2026-10-28T20:00:00Z");
const NO_IMPACT = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
const SEATING = { version: 1, interval: 15 };

function configState(dateRules: unknown[] = []) {
  return {
    version: 7,
    source: "rows",
    config: {
      schedules: [{ id: "s1", name: "Regular", kind: "weekly", isRegular: true }],
      venueServices: [
        { id: "svc-lunch", name: "Lunch", position: 0 },
        { id: "svc-dinner", name: "Dinner", position: 1 },
        { id: "svc-old", name: "Brunch", position: 2, archivedAt: "2026-01-01T00:00:00Z" },
      ],
      scheduleServices: [
        {
          id: "ss1",
          scheduleId: "s1",
          venueServiceId: "svc-lunch",
          opensAt: 690,
          lastSeatingAt: 840,
          closesAt: 900,
          seating: SEATING,
          bookingTypes: ["online"],
        },
        {
          id: "ss2",
          scheduleId: "s1",
          venueServiceId: "svc-dinner",
          opensAt: 1020,
          lastSeatingAt: 1320,
          closesAt: 1380,
          seating: SEATING,
          bookingTypes: ["online", "phone"],
        },
      ],
      assignments: [],
      dateRules,
    },
  };
}

function day(date: string, fields: Record<string, unknown> = {}) {
  return { serviceDate: date, label: "Regular", scheduleId: "s1", ...fields };
}

const AFFECTED = {
  reservations: 3,
  covers: 11,
  depositsHeld: 1,
  groups: [
    {
      groupKey: "2026-12-24:closed",
      date: "2026-12-24",
      kind: "closed",
      covers: 11,
      depositsHeld: 1,
      reservations: [],
    },
  ],
};

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

describe("closure chat tools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    log = createMockLogger();
    api = createMockApiClient();
    api.availability.getConfig.mockResolvedValue(configState());
    api.availability.getClosureImpact.mockResolvedValue(NO_IMPACT);
    api.availability.createClosure.mockResolvedValue({
      ruleId: "rule-1",
      version: 8,
      changeId: "ch1",
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    api.availability.listDays.mockResolvedValue([day("2026-12-24")]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function read(toolName: string, input: Record<string, unknown> = {}, timeZone?: string) {
    const tools = createAgentTools(log, api as never, {
      venueId: "v1",
      ...(timeZone ? { timeZone } : {}),
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  function run(
    toolName: string,
    input: Record<string, unknown>,
    options: { venueId?: string | null; timeZone?: string } = {}
  ) {
    const venueId = options.venueId === undefined ? "v1" : options.venueId;
    const tools = createAgentTools(log, api as never, {
      ...(venueId ? { venueId } : {}),
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  it("registers the writes as confirm-gated and the reads as not", () => {
    expect(GEN_WRITE_TOOL_NAMES).toEqual(
      expect.arrayContaining(["close_dates", "set_special_hours", "reopen_closure"])
    );
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("list_closures");
  });

  describe("close_dates", () => {
    it("holds the closure for confirmation and checks nothing until then", async () => {
      const result = await read("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("checks the impact inside the confirmed call, then saves with no decisions", async () => {
      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      const rule = expect.objectContaining({
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
        window: null,
      });
      expect(api.availability.getClosureImpact).toHaveBeenCalledWith("v1", rule);
      expect(api.availability.createClosure).toHaveBeenCalledWith(
        "v1",
        { expectedVersion: 7, rule, decisions: [] },
        expect.any(String)
      );
      expect(api.availability.getClosureImpact.mock.invocationCallOrder[0]).toBeLessThan(
        api.availability.createClosure.mock.invocationCallOrder[0]!
      );
      expect(result).toMatchObject({ saved: true, from: "2026-12-24", scope: "the whole venue" });
    });

    it("closes one service over a range, found by name", async () => {
      const result = await run("close_dates", {
        scope: "service",
        date: "2026-12-24",
        endDate: "2026-12-26",
        service: "dinner",
      });

      expect(api.availability.createClosure).toHaveBeenCalledWith(
        "v1",
        expect.objectContaining({
          rule: expect.objectContaining({
            targetKind: "service",
            venueServiceId: "svc-dinner",
            startsOn: "2026-12-24",
            endsOn: "2026-12-26",
          }),
        }),
        expect.any(String)
      );
      expect(result).toMatchObject({ saved: true, to: "2026-12-26", scope: "Dinner" });
    });

    it("refuses and links to the Availability page when bookings are affected", async () => {
      api.availability.getClosureImpact.mockResolvedValue(AFFECTED);

      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        refused: true,
        needsDecisions: true,
        error: expect.stringMatching(
          /3 bookings.*11 covers.*Availability page.*Nothing was changed/s
        ),
      });
    });

    it("never saves when the impact can't be read", async () => {
      api.availability.getClosureImpact.mockRejectedValue(new Error("network"));

      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
    });

    it("never saves on an impact it can't read as empty", async () => {
      api.availability.getClosureImpact.mockResolvedValue({ reservations: 0 });

      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toHaveProperty("error");
    });

    it("explains a refused impact check as missing permission", async () => {
      api.availability.getClosureImpact.mockRejectedValue(problem(403));

      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/permission.*manager.*Availability page/is),
      });
    });

    it("still refuses a booking made between the confirm and the save", async () => {
      api.availability.createClosure.mockRejectedValue(
        problem(422, { code: "decision-required", groupKeys: ["2026-12-24:closed"] })
      );

      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(result).toMatchObject({
        refused: true,
        needsDecisions: true,
        error: expect.stringMatching(/Availability page.*Nothing was changed/s),
      });
    });

    it("says when availability changed under it", async () => {
      api.availability.createClosure.mockRejectedValue(problem(409, { code: "version-conflict" }));

      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/changed/) });
    });

    it("refuses a past date in the venue's time zone, not UTC's", async () => {
      // 20:00Z on the 28th is already the 29th in Auckland.
      const result = await run(
        "close_dates",
        { scope: "whole_venue", date: "2026-10-28" },
        { timeZone: "Pacific/Auckland" }
      );

      expect(result).toMatchObject({ error: expect.stringMatching(/in the past.*2026-10-29/s) });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses today in the venue's time zone and points to the Tonight tool", async () => {
      const result = await run(
        "close_dates",
        { scope: "whole_venue", date: "2026-10-28" },
        { timeZone: "America/Chicago" }
      );

      expect(result).toMatchObject({
        error: expect.stringMatching(/today.*change_tonight_availability/is),
      });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses a range that starts today", async () => {
      const result = await run("close_dates", {
        scope: "whole_venue",
        date: "2026-10-28",
        endDate: "2026-10-30",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/change_tonight_availability/) });
    });

    it("requires a service exactly when the scope is a service", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools.close_dates!.inputSchema as unknown as {
        safeParse: (v: unknown) => { success: boolean };
      };

      expect(schema.safeParse({ scope: "service", date: "2026-12-24" }).success).toBe(false);
      expect(
        schema.safeParse({ scope: "whole_venue", date: "2026-12-24", service: "Dinner" }).success
      ).toBe(false);
      expect(schema.safeParse({ date: "2026-12-24" }).success).toBe(false);
      expect(schema.safeParse({ scope: "whole_venue", date: "2026-12-24" }).success).toBe(true);
      expect(
        schema.safeParse({ scope: "service", date: "2026-12-24", service: "Dinner" }).success
      ).toBe(true);
    });

    it("refuses a closure that an identical one already covers", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          {
            id: "c9",
            kind: "closure",
            targetKind: "venue",
            window: null,
            startsOn: "2026-12-20",
            endsOn: "2026-12-31",
          },
        ])
      );

      const result = await run("close_dates", {
        scope: "whole_venue",
        date: "2026-12-24",
        endDate: "2026-12-26",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/already closed/) });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses closing a service the whole venue closure already covers", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          { id: "c9", kind: "closure", targetKind: "venue", startsOn: "2026-12-24", endsOn: null },
        ])
      );

      const result = await run("close_dates", {
        scope: "service",
        service: "Dinner",
        date: "2026-12-25",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/already closed/) });
    });

    it("allows a closure that only partly overlaps an existing one", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          {
            id: "c9",
            kind: "closure",
            targetKind: "venue",
            window: null,
            startsOn: "2026-12-24",
            endsOn: "2026-12-26",
          },
        ])
      );

      const result = await run("close_dates", {
        scope: "whole_venue",
        date: "2026-12-26",
        endDate: "2026-12-28",
      });

      expect(result).toMatchObject({ saved: true });
    });

    it("allows the same span for a different service", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          {
            id: "c9",
            kind: "closure",
            targetKind: "service",
            venueServiceId: "svc-lunch",
            window: null,
            startsOn: "2026-12-24",
            endsOn: "2026-12-26",
          },
        ])
      );

      const result = await run("close_dates", {
        scope: "service",
        service: "Dinner",
        date: "2026-12-24",
        endDate: "2026-12-26",
      });

      expect(result).toMatchObject({ saved: true });
    });

    it("still closes the whole venue when only one service is closed", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          {
            id: "c9",
            kind: "closure",
            targetKind: "service",
            venueServiceId: "svc-dinner",
            startsOn: "2026-12-24",
            endsOn: "2026-12-26",
          },
        ])
      );

      const result = await run("close_dates", { scope: "whole_venue", date: "2026-12-24" });

      expect(result).toMatchObject({ saved: true });
    });

    it.each(["next friday", "2026-02-30", "2026-13-01", "12/24/2026"])(
      "refuses %s as an unreadable date",
      async (date) => {
        const result = await run("close_dates", { scope: "whole_venue", date });

        expect(result).toMatchObject({ error: expect.stringMatching(/can't be read.*YYYY-MM-DD/) });
        expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      }
    );

    it("refuses an end date before the start", async () => {
      const result = await run("close_dates", {
        scope: "whole_venue",
        date: "2026-12-24",
        endDate: "2026-12-20",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/before/) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses a range longer than a year instead of letting it overflow", async () => {
      const result = await run("close_dates", {
        scope: "whole_venue",
        date: "2026-11-01",
        endDate: "2028-01-01",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/366 days/) });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
    });

    it("allows a range of exactly 366 days", async () => {
      const result = await run("close_dates", {
        scope: "whole_venue",
        date: "2026-11-01",
        endDate: "2027-11-01",
      });

      expect(result).toMatchObject({ saved: true });
    });

    it("asks which service when two share a name", async () => {
      const state = configState();
      state.config.venueServices.push({ id: "svc-d2", name: "Dinner", position: 3 });
      api.availability.getConfig.mockResolvedValue(state);

      const result = await run("close_dates", {
        scope: "service",
        date: "2026-12-24",
        service: "Dinner",
      });

      expect(result).toMatchObject({
        error: expect.stringMatching(/More than one service.*Ask which/),
      });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("names the services when none matches", async () => {
      const result = await run("close_dates", {
        scope: "service",
        date: "2026-12-24",
        service: "Brunch",
      });

      expect(result).toMatchObject({ error: expect.stringContaining("Lunch, Dinner") });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const result = await run(
        "close_dates",
        { scope: "whole_venue", date: "2026-12-24" },
        { venueId: null }
      );

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
      expect(api.availability.getConfig).not.toHaveBeenCalled();
    });
  });

  describe("set_special_hours", () => {
    const input = {
      date: "2026-12-24",
      service: "Dinner",
      opensAt: "17:00",
      lastSeating: "21:00",
      closesAt: "23:00",
    };

    it("holds the change for confirmation", async () => {
      const result = await read("set_special_hours", input);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("writes the day's services with the named one changed, after the impact check", async () => {
      const result = await run("set_special_hours", input);

      expect(api.availability.listDays).toHaveBeenCalledWith("v1", {
        from: "2026-12-24",
        to: "2026-12-24",
      });
      const rule = expect.objectContaining({
        kind: "special_hours",
        targetKind: "venue",
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
        payload: {
          version: 1,
          services: [
            {
              venueServiceId: "svc-lunch",
              opensAt: 690,
              lastSeatingAt: 840,
              closesAt: 900,
              seating: SEATING,
              bookingTypes: ["online"],
            },
            {
              venueServiceId: "svc-dinner",
              opensAt: 1020,
              lastSeatingAt: 1260,
              closesAt: 1380,
              seating: SEATING,
              bookingTypes: ["online", "phone"],
            },
          ],
        },
      });
      expect(api.availability.getClosureImpact).toHaveBeenCalledWith("v1", rule);
      expect(api.availability.createClosure).toHaveBeenCalledWith(
        "v1",
        { expectedVersion: 7, rule, decisions: [] },
        expect.any(String)
      );
      expect(result).toMatchObject({ saved: true, date: "2026-12-24", service: "Dinner" });
    });

    it("reads a closing time after midnight on the two-day scale", async () => {
      await run("set_special_hours", { ...input, lastSeating: "00:30", closesAt: "01:00" });

      const body = api.availability.createClosure.mock.calls[0]![1] as {
        rule: {
          payload: {
            services: { venueServiceId: string; closesAt: number; lastSeatingAt: number }[];
          };
        };
      };
      const dinner = body.rule.payload.services.find((s) => s.venueServiceId === "svc-dinner");
      expect(dinner).toMatchObject({ closesAt: 1500, lastSeatingAt: 1470 });
    });

    it("refuses a last seating after the close", async () => {
      const result = await run("set_special_hours", { ...input, lastSeating: "23:30" });

      expect(result).toMatchObject({ error: expect.stringMatching(/last seating/i) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses today and points to the Tonight tool", async () => {
      const result = await run("set_special_hours", { ...input, date: "2026-10-28" });

      expect(result).toMatchObject({ error: expect.stringMatching(/change_tonight_availability/) });
      expect(api.availability.listDays).not.toHaveBeenCalled();
    });

    it.each([
      ["opens when it closes", { opensAt: "17:00", closesAt: "17:00", lastSeating: "17:00" }],
      ["opens when it closes, with a later last seating", { closesAt: "17:00" }],
    ])("refuses hours that %s instead of making a 24-hour service", async (_name, times) => {
      const result = await run("set_special_hours", { ...input, ...times });

      expect(result).toMatchObject({ error: expect.stringMatching(/opening and closing/i) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses to set hours for a service an existing closure already closes that day", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          {
            id: "c1",
            kind: "closure",
            targetKind: "service",
            venueServiceId: "svc-dinner",
            window: null,
            startsOn: "2026-12-20",
            endsOn: "2026-12-31",
          },
        ])
      );

      const result = await run("set_special_hours", input);

      expect(result).toMatchObject({
        error: expect.stringMatching(/Dinner is closed.*Availability page/s),
      });
      expect(result).not.toHaveProperty("saved");
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses when the whole venue is closed that day", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          { id: "c1", kind: "closure", targetKind: "venue", startsOn: "2026-12-24", endsOn: null },
        ])
      );

      const result = await run("set_special_hours", input);

      expect(result).toMatchObject({ error: expect.stringMatching(/closed/) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("still sets hours for a service when only another one is closed", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          {
            id: "c1",
            kind: "closure",
            targetKind: "service",
            venueServiceId: "svc-lunch",
            window: null,
            startsOn: "2026-12-24",
            endsOn: "2026-12-24",
          },
        ])
      );

      const result = await run("set_special_hours", input);

      expect(result).toMatchObject({ saved: true });
    });

    it("keeps an overnight close valid", async () => {
      const result = await run("set_special_hours", { ...input, closesAt: "02:00" });

      expect(result).toMatchObject({ saved: true });
    });

    it("passes on why the server found the rule invalid", async () => {
      api.availability.createClosure.mockRejectedValue(
        problem(422, {
          code: "invalid-config",
          issues: [{ path: "rule", code: "x", message: "Dinner overlaps Lunch." }],
        })
      );

      const result = await run("set_special_hours", input);

      expect(result).toMatchObject({ error: expect.stringContaining("Dinner overlaps Lunch.") });
    });

    it("refuses a date that already has special hours, pointing at the Availability page", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          {
            id: "sh1",
            kind: "special_hours",
            targetKind: "venue",
            startsOn: "2026-12-24",
            endsOn: "2026-12-24",
            payload: { version: 1, services: [] },
          },
        ])
      );

      const result = await run("set_special_hours", input);

      expect(result).toMatchObject({
        error: expect.stringMatching(/already has special hours.*Availability page/s),
      });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses a date with no regular hours to build on", async () => {
      api.availability.listDays.mockResolvedValue([day("2026-12-24", { scheduleId: null })]);

      const result = await run("set_special_hours", input);

      expect(result).toMatchObject({ error: expect.stringMatching(/Availability page/) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses and links to the Availability page when bookings are affected", async () => {
      api.availability.getClosureImpact.mockResolvedValue(AFFECTED);

      const result = await run("set_special_hours", input);

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({ refused: true, needsDecisions: true });
    });

    it("never saves when the impact can't be read", async () => {
      api.availability.getClosureImpact.mockRejectedValue(problem(503));

      const result = await run("set_special_hours", input);

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
    });

    it("refuses a past date", async () => {
      const result = await run("set_special_hours", { ...input, date: "2026-10-01" });

      expect(result).toMatchObject({ error: expect.stringMatching(/in the past/) });
      expect(api.availability.listDays).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const result = await run("set_special_hours", input, { venueId: null });

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
    });
  });

  describe("list_closures", () => {
    const rules = [
      {
        id: "c1",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-12-24",
        endsOn: "2026-12-26",
      },
      {
        id: "c2",
        kind: "closure",
        targetKind: "service",
        venueServiceId: "svc-dinner",
        startsOn: "2026-11-02",
        endsOn: null,
      },
      {
        id: "sh1",
        kind: "special_hours",
        targetKind: "venue",
        startsOn: "2026-12-31",
        endsOn: "2026-12-31",
        payload: {
          version: 1,
          services: [
            { venueServiceId: "svc-dinner", opensAt: 1020, lastSeatingAt: 1260, closesAt: 1500 },
          ],
        },
      },
      {
        id: "old",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-09-01",
        endsOn: "2026-09-02",
      },
      { id: "sk", kind: "skip", targetKind: "venue", startsOn: "2026-12-01", endsOn: "2026-12-01" },
      { id: "t", kind: "tonight", targetKind: "venue", startsOn: "2026-10-28", payload: {} },
    ];

    it("lists upcoming closures and special hours in plain terms", async () => {
      api.availability.getConfig.mockResolvedValue(configState(rules));
      api.availability.listClosures.mockResolvedValue([
        { ruleId: "c1", total: 4, cancelled: 2, sent: 2, rebooked: 0, unreachable: 0 },
      ]);

      const result = await read("list_closures");

      expect(result).toEqual({
        closures: [
          {
            type: "closed",
            from: "2026-11-02",
            to: "until reopened",
            scope: "Dinner",
            cancelledGuests: 0,
          },
          {
            type: "closed",
            from: "2026-12-24",
            to: "2026-12-26",
            scope: "the whole venue",
            cancelledGuests: 2,
          },
          {
            type: "special hours",
            from: "2026-12-31",
            to: "2026-12-31",
            cancelledGuests: 0,
            hours: [
              { service: "Dinner", opensAt: "17:00", lastSeating: "21:00", closesAt: "01:00" },
            ],
          },
        ],
      });
    });

    it("needs a selected venue", async () => {
      const tools = createAgentTools(log, api as never, {});

      const result = await tools.list_closures!.execute!({} as never, toolCtx);

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
      expect(api.availability.getConfig).not.toHaveBeenCalled();
    });

    it("says it couldn't read rather than saying there are none", async () => {
      api.availability.getConfig.mockRejectedValue(new Error("boom"));

      const result = await read("list_closures");

      expect(result).toMatchObject({ error: expect.stringMatching(/Couldn't read/) });
      expect(result).not.toHaveProperty("closures");
    });

    it("flags unknown guest counts instead of reporting zero when the counts can't be read", async () => {
      api.availability.getConfig.mockResolvedValue(configState([rules[0], rules[2]]));
      api.availability.listClosures.mockRejectedValue(new Error("boom"));

      const result = (await read("list_closures")) as {
        countsUnavailable: boolean;
        closures: object[];
      };

      expect(result.countsUnavailable).toBe(true);
      expect(result.closures).toHaveLength(2);
      for (const closure of result.closures) {
        expect(closure).not.toHaveProperty("cancelledGuests");
      }
    });

    it("does not flag the counts when they were read", async () => {
      api.availability.getConfig.mockResolvedValue(configState([rules[0]]));
      api.availability.listClosures.mockResolvedValue([]);

      await expect(read("list_closures")).resolves.not.toHaveProperty("countsUnavailable");
    });
  });

  describe("reopen_closure", () => {
    const closure = {
      id: "c1",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-26",
    };
    const input = {
      from: "2026-12-24",
      to: "2026-12-26",
      scope: "whole_venue",
      tellCancelledGuests: false,
    };

    beforeEach(() => {
      api.availability.getConfig.mockResolvedValue(configState([closure]));
      api.availability.reopenClosure.mockResolvedValue({ version: 9, changeId: "ch2" });
      api.availability.listClosures.mockResolvedValue([]);
    });

    it("holds the reopen for confirmation", async () => {
      const result = await read("reopen_closure", input);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("reopens a closure whose confirmed span is exactly its own", async () => {
      const result = await run("reopen_closure", input);

      expect(api.availability.reopenClosure).toHaveBeenCalledWith("v1", "c1", false);
      expect(result).toMatchObject({ reopened: true, from: "2026-12-24", to: "2026-12-26" });
    });

    it("refuses a date inside a longer closure and returns the real span", async () => {
      const result = await run("reopen_closure", {
        ...input,
        from: "2026-12-25",
        to: "2026-12-25",
      });

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/2026-12-24.*2026-12-26.*Nothing was changed/s),
      });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("refuses when only the end of the span differs", async () => {
      const result = await run("reopen_closure", { ...input, to: "2026-12-25" });

      expect(result).toMatchObject({ error: expect.stringContaining("2026-12-26") });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("matches a closure with no end by the words 'until reopened'", async () => {
      api.availability.getConfig.mockResolvedValue(configState([{ ...closure, endsOn: null }]));

      const ok = await run("reopen_closure", { ...input, to: "until reopened" });
      expect(ok).toMatchObject({ reopened: true });

      api.availability.reopenClosure.mockClear();
      const wrong = await run("reopen_closure", { ...input, to: "2026-12-26" });
      expect(wrong).toMatchObject({ error: expect.stringMatching(/until reopened/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("tells cancelled guests only when the closure really cancelled some", async () => {
      api.availability.listClosures.mockResolvedValue([
        { ruleId: "c1", total: 3, cancelled: 3, sent: 0, rebooked: 0, unreachable: 0 },
      ]);

      const told = await run("reopen_closure", { ...input, tellCancelledGuests: true });
      expect(api.availability.reopenClosure).toHaveBeenLastCalledWith("v1", "c1", true);
      expect(told).toMatchObject({ reopened: true, guestsCancelled: 3, noticeRequested: true });

      await run("reopen_closure", { ...input, tellCancelledGuests: false });
      expect(api.availability.reopenClosure).toHaveBeenLastCalledWith("v1", "c1", false);
    });

    it("says plainly that nobody was told when no guest was cancelled", async () => {
      const result = await run("reopen_closure", { ...input, tellCancelledGuests: true });

      expect(api.availability.reopenClosure).toHaveBeenCalledWith("v1", "c1", false);
      expect(result).toMatchObject({
        guestsCancelled: 0,
        noticeRequested: false,
        note: expect.stringMatching(/No guest was cancelled.*no notice was requested/i),
      });
    });

    it("asks nobody when every cancelled guest's date has passed, and says so (#7975)", async () => {
      api.availability.listClosures.mockResolvedValue([
        {
          ruleId: "c1",
          total: 3,
          cancelled: 3,
          upcomingCancelled: 0,
          sent: 0,
          rebooked: 0,
          unreachable: 0,
        },
      ]);

      const result = await run("reopen_closure", { ...input, tellCancelledGuests: true });

      expect(api.availability.reopenClosure).toHaveBeenCalledWith("v1", "c1", false);
      expect(result).toMatchObject({
        guestsCancelled: 3,
        noticeRequested: false,
        note: expect.stringMatching(/not asked to be notified/i),
      });
      expect(JSON.stringify(result)).not.toMatch(/Asked to notify/);
    });

    it("names only the guests the reopen reached when some dates have passed (#7975)", async () => {
      api.availability.listClosures.mockResolvedValue([
        {
          ruleId: "c1",
          total: 5,
          cancelled: 5,
          upcomingCancelled: 2,
          sent: 0,
          rebooked: 0,
          unreachable: 0,
        },
      ]);
      api.availability.reopenClosure.mockResolvedValue({
        version: 9,
        changeId: "ch2",
        notified: 2,
      });

      const result = await run("reopen_closure", { ...input, tellCancelledGuests: true });

      expect(result).toMatchObject({
        guestsCancelled: 5,
        noticeRequested: true,
        note: expect.stringMatching(/asked to notify the 2 guests/i),
      });
    });

    it("words a requested notice as asked, not delivered, and handles one guest", async () => {
      api.availability.listClosures.mockResolvedValue([
        { ruleId: "c1", total: 1, cancelled: 1, sent: 0, rebooked: 0, unreachable: 0 },
      ]);
      const many = [{ ruleId: "c1", total: 3, cancelled: 3, sent: 0, rebooked: 0, unreachable: 0 }];

      const one = await run("reopen_closure", { ...input, tellCancelledGuests: true });
      const silent = await run("reopen_closure", { ...input, tellCancelledGuests: false });
      api.availability.listClosures.mockResolvedValue(many);
      const several = await run("reopen_closure", { ...input, tellCancelledGuests: true });

      expect(one).toMatchObject({
        note: expect.stringMatching(/asked to notify the 1 guest the closure cancelled/i),
      });
      expect(silent).toMatchObject({
        note: expect.stringMatching(/1 guest the closure cancelled was not asked to be notified/i),
      });
      expect(several).toMatchObject({
        note: expect.stringMatching(/asked to notify the 3 guests the closure cancelled/i),
      });
      for (const result of [one, silent, several]) {
        expect(JSON.stringify(result)).not.toMatch(/guestsTold|were told|was told/);
      }
    });

    it("reopens a plain closure that shares its span with special hours", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          closure,
          {
            ...closure,
            id: "sh1",
            kind: "special_hours",
            payload: { version: 1, services: [] },
          },
        ])
      );

      const result = await run("reopen_closure", input);

      expect(api.availability.reopenClosure).toHaveBeenCalledWith("v1", "c1", false);
      expect(result).toMatchObject({ reopened: true });
    });

    it("still refuses a span that only special hours match", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          { ...closure, kind: "special_hours", payload: { version: 1, services: [] } },
          { ...closure, id: "sh2", kind: "special_hours", payload: { version: 1, services: [] } },
        ])
      );

      const result = await run("reopen_closure", input);

      expect(result).toMatchObject({ error: expect.stringMatching(/Availability page/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("refuses a closure that belongs to a series", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([{ ...closure, seriesId: "series-1" }])
      );

      const result = await run("reopen_closure", input);

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/series.*Availability page/s),
      });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("refuses the reopen when the cancelled-guest count can't be read", async () => {
      api.availability.listClosures.mockRejectedValue(new Error("boom"));

      const result = await run("reopen_closure", { ...input, tellCancelledGuests: true });

      expect(result).toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it.each([
      ["special hours", { kind: "special_hours", payload: { version: 1, services: [] } }],
      ["a repeating series", { repeat: { version: 1, weekdays: [4, 5, 6] } }],
      ["a booking pause", { targetKind: "booking", bookingTypes: ["online"] }],
    ])("sends %s to the Availability page", async (_name, fields) => {
      api.availability.getConfig.mockResolvedValue(configState([{ ...closure, ...fields }]));

      const result = await run("reopen_closure", input);

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/Availability page.*Nothing was changed/s),
      });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("tells two closures of the same span apart by scope", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          closure,
          { ...closure, id: "c3", targetKind: "service", venueServiceId: "svc-dinner" },
        ])
      );

      await run("reopen_closure", input);
      expect(api.availability.reopenClosure).toHaveBeenLastCalledWith("v1", "c1", false);

      await run("reopen_closure", { ...input, scope: "service", service: "Dinner" });
      expect(api.availability.reopenClosure).toHaveBeenLastCalledWith("v1", "c3", false);
    });

    it("refuses and links to the page when two closures can't be told apart", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([closure, { ...closure, id: "c4" }])
      );

      const result = await run("reopen_closure", input);

      expect(result).toMatchObject({ error: expect.stringMatching(/Availability page/) });
      expect(result).not.toMatchObject({ error: expect.stringMatching(/No closure/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("never says nothing covers the date when a closure of another scope does", async () => {
      const result = await run("reopen_closure", {
        ...input,
        scope: "service",
        service: "Lunch",
      });

      expect(result).toMatchObject({
        error: expect.stringMatching(/the whole venue.*2026-12-24.*2026-12-26/s),
      });
      expect(result).not.toMatchObject({ error: expect.stringMatching(/No closure/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("says so when nothing is closed on the date", async () => {
      const result = await run("reopen_closure", {
        ...input,
        from: "2027-01-05",
        to: "2027-01-05",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/No closure or special hours/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("does not count a date the closure skips as covered", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          closure,
          {
            id: "edit",
            kind: "skip",
            targetKind: "venue",
            seriesId: "c1",
            startsOn: "2026-12-25",
            endsOn: "2026-12-25",
          },
        ])
      );

      const result = await run("reopen_closure", {
        ...input,
        from: "2026-12-25",
        to: "2026-12-25",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/No closure/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("refuses an unreadable date and a span that runs backwards", async () => {
      const unreadable = await run("reopen_closure", { ...input, from: "soon" });
      const backwards = await run("reopen_closure", {
        ...input,
        from: "2026-12-26",
        to: "2026-12-24",
      });

      expect(unreadable).toMatchObject({
        error: expect.stringMatching(/can't be read.*until reopened/),
      });
      expect(backwards).toMatchObject({ error: expect.stringMatching(/before/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("requires a service exactly when the scope is a service", () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools.reopen_closure!.inputSchema as unknown as {
        safeParse: (v: unknown) => { success: boolean };
      };

      expect(schema.safeParse({ ...input, scope: "service" }).success).toBe(false);
      expect(schema.safeParse({ ...input, service: "Dinner" }).success).toBe(false);
      expect(schema.safeParse({ ...input, scope: "service", service: "Dinner" }).success).toBe(
        true
      );
      expect(schema.safeParse(input).success).toBe(true);
    });

    it("does not claim nothing changed when the reopen times out", async () => {
      api.availability.reopenClosure.mockRejectedValue(new Error("timeout"));

      const result = await run("reopen_closure", input);

      expect(result).toMatchObject({
        error: expect.stringMatching(/Couldn't confirm.*list_closures/),
      });
      expect(result).not.toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
    });

    it("passes on a missing permission in plain words", async () => {
      api.availability.reopenClosure.mockRejectedValue(problem(403));

      const result = await run("reopen_closure", input);

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/permission.*manager/is),
      });
    });

    it("needs a selected venue", async () => {
      const result = await run("reopen_closure", input, { venueId: null });

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
    });
  });

  it.each(["list_closures", "close_dates", "set_special_hours", "reopen_closure"])(
    "%s never asks the model for a venue",
    (name) => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools[name]!.inputSchema as unknown as { shape: Record<string, unknown> };
      expect(Object.keys(schema.shape)).not.toContain("venueId");
    }
  );
});
