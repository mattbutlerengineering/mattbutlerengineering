import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";
import { resolveDay, validateConfig } from "@mbe/availability";
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
      saveConfig: vi.fn(),
    },
  };
}

function problem(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused.", ...extra },
  });
}

const NOW = new Date("2026-10-28T20:00:00Z");
const NO_IMPACT = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
const SEATING = { version: 1, interval: 15 };

function lunchRow(extra: Record<string, unknown> = {}) {
  return {
    id: "ss1",
    scheduleId: "s1",
    venueServiceId: "svc-lunch",
    opensAt: 690,
    lastSeatingAt: 840,
    closesAt: 900,
    seating: SEATING,
    bookingTypes: ["online"],
    weekdays: [],
    dayHours: { version: 1, sets: [] },
    ...extra,
  };
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function configState(rows: unknown[] = [lunchRow()], assignedDays: number[] = ALL_DAYS) {
  return {
    version: 7,
    source: "rows",
    config: {
      schedules: [{ id: "s1", name: "Regular", kind: "regular", isRegular: true }],
      venueServices: [
        { id: "svc-lunch", name: "Lunch", position: 0 },
        { id: "svc-dinner", name: "Dinner", position: 1 },
        { id: "svc-brunch", name: "Brunch", position: 2 },
      ],
      scheduleServices: rows,
      assignments: [{ id: "as1", scheduleId: "s1", weekdays: assignedDays, precedence: 0 }],
      dateRules: [],
    },
  };
}

const AFFECTED = {
  reservations: 2,
  covers: 6,
  depositsHeld: 0,
  groups: [
    {
      groupKey: "2027-01-05:closed",
      date: "2027-01-05",
      kind: "closed",
      covers: 6,
      depositsHeld: 0,
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

describe("schedule chat tools (#9477)", () => {
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    api = createMockApiClient();
    api.availability.getConfig.mockResolvedValue(configState());
    api.availability.getClosureImpact.mockResolvedValue(NO_IMPACT);
    api.availability.createClosure.mockResolvedValue({ ruleId: "r1", version: 8 });
    api.availability.saveConfig.mockResolvedValue({ version: 8 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A call the user has not confirmed. */
  function proposed(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(createMockLogger(), api as never, { venueId: "v1" });
    return tools[toolName]!.execute!(input as never, toolCtx) as Promise<Record<string, unknown>>;
  }

  /** A call the user confirmed. */
  function confirmed(
    toolName: string,
    input: Record<string, unknown>,
    venueId: string | null = "v1"
  ) {
    const tools = createAgentTools(createMockLogger(), api as never, {
      ...(venueId ? { venueId } : {}),
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx) as Promise<Record<string, unknown>>;
  }

  it("registers both tools as confirm-gated writes", () => {
    expect(GEN_WRITE_TOOL_NAMES).toEqual(
      expect.arrayContaining(["close_repeating_days", "set_regular_hours"])
    );
  });

  describe("close_repeating_days", () => {
    const input = {
      scope: "whole_venue",
      weekdays: ["Monday"],
      from: "2027-01-05",
      to: "2027-01-26",
    };

    it("holds the closure for confirmation (cancel path writes nothing)", async () => {
      const result = await proposed("close_repeating_days", input);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.getConfig).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("saves one repeating closure once confirmed, after the impact check", async () => {
      const result = await confirmed("close_repeating_days", input);

      const rule = expect.objectContaining({
        kind: "closure",
        targetKind: "venue",
        startsOn: "2027-01-05",
        endsOn: "2027-01-26",
        repeat: { version: 1, weekdays: [1] },
        window: null,
      });
      expect(api.availability.getClosureImpact).toHaveBeenCalledWith("v1", rule);
      expect(api.availability.createClosure).toHaveBeenCalledTimes(1);
      expect(api.availability.createClosure).toHaveBeenCalledWith(
        "v1",
        { expectedVersion: 7, rule, decisions: [] },
        expect.any(String)
      );
      expect(result).toMatchObject({
        saved: true,
        summary: "Closed every Monday from 2027-01-05 to 2027-01-26",
      });
    });

    it("closes one service on several weekdays, found by name", async () => {
      const result = await confirmed("close_repeating_days", {
        scope: "service",
        service: "dinner",
        weekdays: ["Friday", "Monday", "Monday"],
        from: "2027-01-05",
        to: "2027-02-26",
      });

      expect(api.availability.createClosure).toHaveBeenCalledWith(
        "v1",
        expect.objectContaining({
          rule: expect.objectContaining({
            targetKind: "service",
            venueServiceId: "svc-dinner",
            repeat: { version: 1, weekdays: [1, 5] },
          }),
        }),
        expect.any(String)
      );
      expect(result).toMatchObject({
        saved: true,
        summary: expect.stringContaining("Monday and Friday"),
      });
    });

    it("refuses when bookings are affected and saves nothing", async () => {
      api.availability.getClosureImpact.mockResolvedValue(AFFECTED);

      const result = await confirmed("close_repeating_days", input);

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        refused: true,
        needsDecisions: true,
        error: expect.stringMatching(/2 bookings.*Availability page.*Nothing was changed/s),
      });
    });

    it("rejects a weekday that never falls in the dates", async () => {
      const result = await confirmed("close_repeating_days", {
        ...input,
        weekdays: ["Wednesday"],
        to: "2027-01-05",
      });

      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/nothing would close/) });
    });

    it("rejects dates in the past, today and out of order", async () => {
      for (const [from, to] of [
        ["2026-10-01", "2026-12-01"],
        ["2026-10-28", "2026-12-01"],
        ["2027-01-26", "2027-01-05"],
      ]) {
        const result = await confirmed("close_repeating_days", { ...input, from, to });
        expect(result).toHaveProperty("error");
      }
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("rejects an unknown service and an unknown weekday", async () => {
      const unknownService = await confirmed("close_repeating_days", {
        ...input,
        scope: "service",
        service: "Dessert",
      });
      expect(unknownService).toMatchObject({ error: expect.stringMatching(/no service called/) });

      const badDay = await confirmed("close_repeating_days", { ...input, weekdays: ["Funday"] });
      expect(badDay).toMatchObject({ error: expect.stringMatching(/invalid/i) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("needs the service exactly when the scope is service", async () => {
      const result = await confirmed("close_repeating_days", { ...input, scope: "service" });

      expect(result).toMatchObject({ error: expect.stringMatching(/invalid/i) });
      expect(api.availability.createClosure).not.toHaveBeenCalled();
    });

    it("needs a venue", async () => {
      const result = await confirmed("close_repeating_days", input, null);

      expect(result).toMatchObject({ error: expect.stringMatching(/No venue/) });
    });

    it("runs once per confirmation", async () => {
      const tools = createAgentTools(createMockLogger(), api as never, {
        venueId: "v1",
        confirmedAction: { actionId: "call-1", toolName: "close_repeating_days", toolInput: input },
      });
      await tools.close_repeating_days!.execute!(input as never, toolCtx);
      await tools.close_repeating_days!.execute!(input as never, toolCtx);

      expect(api.availability.createClosure).toHaveBeenCalledTimes(1);
    });
  });

  describe("set_regular_hours", () => {
    const input = { service: "Lunch", opensAt: "11:00", lastSeating: "14:30", closesAt: "15:30" };

    it("holds the change for confirmation (cancel path writes nothing)", async () => {
      const result = await proposed("set_regular_hours", input);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.saveConfig).not.toHaveBeenCalled();
    });

    it("changes every day's hours on the regular schedule row", async () => {
      const result = await confirmed("set_regular_hours", input);

      expect(api.availability.saveConfig).toHaveBeenCalledTimes(1);
      expect(api.availability.saveConfig).toHaveBeenCalledWith("v1", {
        expectedVersion: 7,
        changes: {
          upsert: {
            scheduleServices: [
              expect.objectContaining({
                id: "ss1",
                opensAt: 660,
                lastSeatingAt: 870,
                closesAt: 930,
                seating: SEATING,
                bookingTypes: ["online"],
              }),
            ],
          },
          remove: {},
        },
        scopeConflicts: "keep",
      });
      expect(result).toMatchObject({ saved: true, service: "Lunch", opensAt: "11:00" });
    });

    it("sets other hours for chosen weekdays as one day set", async () => {
      await confirmed("set_regular_hours", { ...input, weekdays: ["Saturday", "Friday"] });

      const body = api.availability.saveConfig.mock.calls[0]![1] as {
        changes: { upsert: { scheduleServices: Array<Record<string, unknown>> } };
      };
      const row = body.changes.upsert.scheduleServices[0]!;
      expect(row["opensAt"]).toBe(690);
      expect(row["dayHours"]).toEqual({
        version: 1,
        sets: [
          {
            weekdays: [5, 6],
            opensAt: 660,
            lastSeatingAt: 870,
            closesAt: 930,
            seating: SEATING,
            bookingTypes: ["online"],
          },
        ],
      });
    });

    it("reads a closing time after midnight as the next day", async () => {
      await confirmed("set_regular_hours", {
        service: "Lunch",
        opensAt: "17:00",
        lastSeating: "23:00",
        closesAt: "01:00",
      });

      const body = api.availability.saveConfig.mock.calls[0]![1] as {
        changes: { upsert: { scheduleServices: Array<Record<string, unknown>> } };
      };
      expect(body.changes.upsert.scheduleServices[0]).toMatchObject({
        opensAt: 1020,
        lastSeatingAt: 1380,
        closesAt: 1500,
      });
    });

    it("rejects hours that don't fit", async () => {
      const result = await confirmed("set_regular_hours", { ...input, closesAt: "11:00" });

      expect(api.availability.saveConfig).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/last seating/) });
    });

    it("rejects a malformed time", async () => {
      const result = await confirmed("set_regular_hours", { ...input, opensAt: "9am" });

      expect(api.availability.saveConfig).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/invalid/i) });
    });

    it("says so when the hours are already those", async () => {
      const result = await confirmed("set_regular_hours", {
        service: "Lunch",
        opensAt: "11:30",
        lastSeating: "14:00",
        closesAt: "15:00",
      });

      expect(api.availability.saveConfig).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/already has those hours/) });
    });

    it("leaves a service that varies by day to the page", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          lunchRow({
            dayHours: {
              version: 1,
              sets: [
                {
                  weekdays: [6],
                  opensAt: 600,
                  lastSeatingAt: 700,
                  closesAt: 800,
                  seating: SEATING,
                  bookingTypes: ["online"],
                },
              ],
            },
          }),
        ])
      );

      const result = await confirmed("set_regular_hours", input);

      expect(api.availability.saveConfig).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/Availability page/) });
    });

    it("refuses weekdays the service doesn't run on", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([lunchRow({ weekdays: [1, 2, 3] })])
      );

      const result = await confirmed("set_regular_hours", { ...input, weekdays: ["Sunday"] });

      expect(api.availability.saveConfig).not.toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.stringMatching(/doesn't run on Sunday/) });
    });

    describe("weekday changes against the server's rules", () => {
      const brunchRow = (extra: Record<string, unknown> = {}) =>
        lunchRow({ id: "ss3", venueServiceId: "svc-brunch", weekdays: [0, 6], ...extra });
      const hours = { opensAt: "11:00", lastSeating: "13:00", closesAt: "15:00" };

      /** The config as the server would hold it after the saved row replaces the old one. */
      async function savedConfig(
        rows: unknown[],
        change: Record<string, unknown>,
        assignedDays: number[] = ALL_DAYS
      ) {
        const state = configState(rows, assignedDays);
        api.availability.getConfig.mockResolvedValue(state);
        const result = await confirmed("set_regular_hours", change);
        const body = api.availability.saveConfig.mock.calls[0]?.[1] as
          { changes: { upsert: { scheduleServices: Array<{ id: string }> } } } | undefined;
        const saved = body?.changes.upsert.scheduleServices[0];
        const config = {
          ...state.config,
          scheduleServices: state.config.scheduleServices.map((row) =>
            saved && (row as { id: string }).id === saved.id ? saved : row
          ),
        };
        return { result, config: config as never, saved };
      }

      it.each([
        ["one day of a partial week", [brunchRow()], "Brunch", ["Saturday"]],
        ["every day of a partial week", [brunchRow()], "Brunch", ["Saturday", "Sunday"]],
        ["a day of weekdays [1,2,3]", [lunchRow({ weekdays: [1, 2, 3] })], "Lunch", ["Monday"]],
        ["a day of an every-day row", [lunchRow()], "Lunch", ["Friday"]],
      ])("%s passes validateConfig", async (_name, rows, service, weekdays) => {
        const { result, config } = await savedConfig(rows, { service, weekdays, ...hours });

        expect(result).toMatchObject({ saved: true });
        expect(validateConfig(config)).toEqual([]);
      });

      it("moves the named days out of the row's weekdays into the set", async () => {
        const { saved } = await savedConfig([brunchRow()], {
          service: "Brunch",
          weekdays: ["Saturday"],
          ...hours,
        });

        expect(saved).toMatchObject({
          weekdays: [0],
          opensAt: 690,
          dayHours: { sets: [{ weekdays: [6], opensAt: 660, closesAt: 900 }] },
        });
      });

      it("applies naming every day it runs to the row itself", async () => {
        const { saved } = await savedConfig([brunchRow()], {
          service: "Brunch",
          weekdays: ["Sunday", "Saturday"],
          ...hours,
        });

        expect(saved).toMatchObject({
          weekdays: [0, 6],
          opensAt: 660,
          dayHours: { sets: [] },
        });
      });

      it("refuses a day the regular schedule doesn't cover, and changes nothing", async () => {
        const { result, config } = await savedConfig(
          [lunchRow()],
          { service: "Lunch", weekdays: ["Monday"], ...hours },
          [0, 2, 3, 4, 5, 6]
        );

        expect(api.availability.saveConfig).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          error: expect.stringMatching(/doesn't run on Monday.*Availability page/s),
        });
        expect(config).toBeDefined();
      });

      it("a saved change shows up on the day it names", async () => {
        const { result, config } = await savedConfig([lunchRow()], {
          service: "Lunch",
          weekdays: ["Friday"],
          ...hours,
        });

        expect(result).toMatchObject({ saved: true });
        const friday = resolveDay({ timezone: "UTC", config }, "2027-01-08");
        const thursday = resolveDay({ timezone: "UTC", config }, "2027-01-07");
        expect(friday.services[0]).toMatchObject({ opensAt: 660, closesAt: 900 });
        expect(thursday.services[0]).toMatchObject({ opensAt: 690, closesAt: 900 });
      });
    });

    it("refuses a service that isn't on the regular schedule", async () => {
      const result = await confirmed("set_regular_hours", { ...input, service: "Dinner" });

      expect(api.availability.saveConfig).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        error: expect.stringMatching(/isn't on the regular schedule/),
      });
    });

    it("refuses and points to the page when bookings would be stranded", async () => {
      api.availability.saveConfig.mockRejectedValue(problem(409, { code: "stranded-bookings" }));

      const result = await confirmed("set_regular_hours", input);

      expect(result).toMatchObject({
        refused: true,
        needsDecisions: true,
        error: expect.stringMatching(/existing bookings.*Availability page.*Nothing was changed/s),
      });
    });

    it("asks to confirm again after a version conflict", async () => {
      api.availability.saveConfig.mockRejectedValue(problem(409, { code: "version-conflict" }));

      const result = await confirmed("set_regular_hours", input);

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/confirm again/),
      });
    });

    it("never claims nothing changed when the save may have gone through", async () => {
      api.availability.saveConfig.mockRejectedValue(new Error("socket hang up"));

      const result = await confirmed("set_regular_hours", input);

      expect(result).toMatchObject({ error: expect.stringMatching(/Couldn't confirm/) });
      expect(result).not.toHaveProperty("error", expect.stringMatching(/Nothing was changed/));
    });
  });
});
