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
      const result = await read("close_dates", { date: "2026-12-24" });

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("checks the impact inside the confirmed call, then saves with no decisions", async () => {
      const result = await run("close_dates", { date: "2026-12-24" });

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

      const result = await run("close_dates", { date: "2026-12-24" });

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

      const result = await run("close_dates", { date: "2026-12-24" });

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
    });

    it("never saves on an impact it can't read as empty", async () => {
      api.availability.getClosureImpact.mockResolvedValue({ reservations: 0 });

      const result = await run("close_dates", { date: "2026-12-24" });

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toHaveProperty("error");
    });

    it("explains a refused impact check as missing permission", async () => {
      api.availability.getClosureImpact.mockRejectedValue(problem(403));

      const result = await run("close_dates", { date: "2026-12-24" });

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

      const result = await run("close_dates", { date: "2026-12-24" });

      expect(result).toMatchObject({
        refused: true,
        needsDecisions: true,
        error: expect.stringMatching(/Availability page.*Nothing was changed/s),
      });
    });

    it("says when availability changed under it", async () => {
      api.availability.createClosure.mockRejectedValue(problem(409, { code: "version-conflict" }));

      const result = await run("close_dates", { date: "2026-12-24" });

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/changed/) });
    });

    it("refuses a past date in the venue's time zone, not UTC's", async () => {
      // 20:00Z on the 28th is already the 29th in Auckland.
      const result = await run(
        "close_dates",
        { date: "2026-10-28" },
        { timeZone: "Pacific/Auckland" }
      );

      expect(result).toMatchObject({ error: expect.stringMatching(/in the past.*2026-10-29/s) });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("takes today in the venue's time zone", async () => {
      const result = await run(
        "close_dates",
        { date: "2026-10-28" },
        { timeZone: "America/Chicago" }
      );

      expect(result).toMatchObject({ saved: true });
    });

    it.each(["next friday", "2026-02-30", "2026-13-01", "12/24/2026"])(
      "refuses %s as an unreadable date",
      async (date) => {
        const result = await run("close_dates", { date });

        expect(result).toMatchObject({ error: expect.stringMatching(/can't be read.*YYYY-MM-DD/) });
        expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      }
    );

    it("refuses an end date before the start", async () => {
      const result = await run("close_dates", { date: "2026-12-24", endDate: "2026-12-20" });

      expect(result).toMatchObject({ error: expect.stringMatching(/before/) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("refuses a range longer than a year instead of letting it overflow", async () => {
      const result = await run("close_dates", { date: "2026-11-01", endDate: "2028-01-01" });

      expect(result).toMatchObject({ error: expect.stringMatching(/366 days/) });
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
    });

    it("allows a range of exactly 366 days", async () => {
      const result = await run("close_dates", { date: "2026-11-01", endDate: "2027-11-01" });

      expect(result).toMatchObject({ saved: true });
    });

    it("asks which service when two share a name", async () => {
      const state = configState();
      state.config.venueServices.push({ id: "svc-d2", name: "Dinner", position: 3 });
      api.availability.getConfig.mockResolvedValue(state);

      const result = await run("close_dates", { date: "2026-12-24", service: "Dinner" });

      expect(result).toMatchObject({
        error: expect.stringMatching(/More than one service.*Ask which/),
      });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("names the services when none matches", async () => {
      const result = await run("close_dates", { date: "2026-12-24", service: "Brunch" });

      expect(result).toMatchObject({ error: expect.stringContaining("Lunch, Dinner") });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const result = await run("close_dates", { date: "2026-12-24" }, { venueId: null });

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

    it("refuses a date that already has special hours, pointing at reopen_closure", async () => {
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
        error: expect.stringMatching(/already has special hours.*reopen_closure/s),
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
          { type: "closed", from: "2026-11-02", until: "reopened", scope: "Dinner" },
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

    it("lists closures even when their outcome counts can't be read", async () => {
      api.availability.getConfig.mockResolvedValue(configState([rules[0]]));
      api.availability.listClosures.mockRejectedValue(new Error("boom"));

      const result = await read("list_closures");

      expect(result).toMatchObject({ closures: [{ from: "2026-12-24" }] });
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

    beforeEach(() => {
      api.availability.getConfig.mockResolvedValue(configState([closure]));
      api.availability.reopenClosure.mockResolvedValue({ version: 9, changeId: "ch2" });
    });

    it("holds the reopen for confirmation", async () => {
      const result = await read("reopen_closure", {
        date: "2026-12-25",
        tellCancelledGuests: false,
      });

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("reopens the closure that covers the date", async () => {
      const result = await run("reopen_closure", { date: "2026-12-25", tellCancelledGuests: true });

      expect(api.availability.reopenClosure).toHaveBeenCalledWith("v1", "c1", true);
      expect(result).toMatchObject({ reopened: true, from: "2026-12-24", to: "2026-12-26" });
    });

    it("narrows by service", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          closure,
          { ...closure, id: "c3", targetKind: "service", venueServiceId: "svc-dinner" },
        ])
      );

      await run("reopen_closure", {
        date: "2026-12-25",
        service: "Dinner",
        tellCancelledGuests: false,
      });

      expect(api.availability.reopenClosure).toHaveBeenCalledWith("v1", "c3", false);
    });

    it("asks which when two closures cover the date", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          closure,
          { ...closure, id: "c3", targetKind: "service", venueServiceId: "svc-dinner" },
        ])
      );

      const result = await run("reopen_closure", {
        date: "2026-12-25",
        tellCancelledGuests: false,
      });

      expect(result).toMatchObject({
        error: expect.stringMatching(/More than one.*Ask which.*Dinner/s),
      });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("skips a repeating closure on a day it doesn't repeat", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([{ ...closure, repeat: { version: 1, weekdays: [5] } }])
      );

      // 2026-12-25 is a Friday; 2026-12-26 a Saturday.
      const hit = await run("reopen_closure", { date: "2026-12-25", tellCancelledGuests: false });
      expect(hit).toMatchObject({ reopened: true });

      api.availability.reopenClosure.mockClear();
      const miss = await run("reopen_closure", { date: "2026-12-26", tellCancelledGuests: false });
      expect(miss).toMatchObject({ error: expect.stringMatching(/No closure/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("says so when nothing is closed on the date", async () => {
      const result = await run("reopen_closure", {
        date: "2027-01-05",
        tellCancelledGuests: false,
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/No closure or special hours/) });
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    });

    it("refuses an unreadable date", async () => {
      const result = await run("reopen_closure", { date: "soon", tellCancelledGuests: false });

      expect(result).toMatchObject({ error: expect.stringMatching(/can't be read/) });
    });

    it("passes on a missing permission in plain words", async () => {
      api.availability.reopenClosure.mockRejectedValue(problem(403));

      const result = await run("reopen_closure", {
        date: "2026-12-25",
        tellCancelledGuests: false,
      });

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/permission.*manager/is),
      });
    });

    it("needs a selected venue", async () => {
      const result = await run(
        "reopen_closure",
        { date: "2026-12-25", tellCancelledGuests: false },
        { venueId: null }
      );

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
