import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    availability: {
      getConfig: vi.fn(),
      setTonight: vi.fn(),
      endTonight: vi.fn(),
      listChanges: vi.fn(),
      revertChange: vi.fn(),
    },
    tables: { list: vi.fn() },
  };
}

/** What `ApiClientError` looks like to the tools: a status-bearing ProblemDetails. */
function problem(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused.", ...extra },
  });
}

const NOW = new Date("2026-10-28T20:00:00Z");
const TODAY = "2026-10-28";

/** Lunch opens 11:30 and dinner runs to midnight, so 01:00 is after midnight (minute 1500). */
function configState(dateRules: unknown[] = []) {
  return {
    version: 7,
    source: "rows",
    config: {
      schedules: [],
      venueServices: [
        { id: "svc-lunch", name: "Lunch", position: 0 },
        { id: "svc-dinner", name: "Dinner", position: 1 },
      ],
      scheduleServices: [
        { id: "ss1", scheduleId: "s1", venueServiceId: "svc-lunch", opensAt: 690, closesAt: 900 },
        {
          id: "ss2",
          scheduleId: "s1",
          venueServiceId: "svc-dinner",
          opensAt: 1020,
          closesAt: 1440,
        },
      ],
      assignments: [],
      dateRules,
    },
  };
}

function tonightRule(id: string, fields: Record<string, unknown>) {
  return {
    id,
    kind: "tonight",
    targetKind: "venue",
    startsOn: TODAY,
    expiresAt: "2026-10-29T10:00:00Z",
    ...fields,
  };
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

describe("availability chat tools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    log = createMockLogger();
    api = createMockApiClient();
    api.availability.getConfig.mockResolvedValue(configState());
    api.availability.listChanges.mockResolvedValue({ total: 0, offset: 0, items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function confirmed(toolName: string, toolInput: Record<string, unknown>) {
    return createAgentTools(log, api as never, {
      venueId: "v1",
      confirmedAction: { actionId: "call-1", toolName, toolInput },
    });
  }

  function run(toolName: string, input: Record<string, unknown>) {
    return confirmed(toolName, input)[toolName]!.execute!(input as never, toolCtx);
  }

  describe("list_tonight_changes", () => {
    function list() {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      return tools.list_tonight_changes!.execute!({} as never, toolCtx);
    }

    it("describes each Tonight change in force in venue-local terms", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          tonightRule("r1", {
            targetKind: "booking",
            payload: { version: 1, stop: { from: 0, to: 2880 } },
          }),
          tonightRule("r2", {
            venueServiceId: "svc-dinner",
            payload: { version: 1, closeAt: 1500 },
          }),
          tonightRule("r3", { payload: { version: 1, stop: { from: 1170, to: 1200 } } }),
          tonightRule("r4", { payload: { version: 1, pacing: { covers: 20 } } }),
          tonightRule("r5", {
            targetKind: "tables",
            tableIds: ["t1"],
            payload: { version: 1, stop: { from: 0, to: 2880 } },
          }),
        ])
      );
      api.tables.list.mockResolvedValue({
        data: [{ id: "t1", name: "Patio 2", tableNumber: "12" }],
      });

      const result = await list();

      expect(result).toMatchObject({
        changes: [
          { change: "pause_online" },
          { change: "close_early", closeAt: "01:00", service: "Dinner" },
          { change: "stop_window", from: "19:30", to: "20:00" },
          { change: "pacing", covers: 20 },
          { change: "block_tables", tables: ["Patio 2"] },
        ],
      });
      // "Rest of tonight" is the whole two-day scale: no times to state.
      expect((result as { changes: object[] }).changes[4]).not.toHaveProperty("from");
    });

    it("leaves out expired Tonight changes and other date rules", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          tonightRule("old", {
            expiresAt: "2026-10-28T10:00:00Z",
            payload: { version: 1, pacing: { covers: 9 } },
          }),
          { id: "c1", kind: "closure", targetKind: "venue", startsOn: TODAY },
        ])
      );

      await expect(list()).resolves.toMatchObject({ changes: [] });
    });

    it("offers the newest change only when it can still be undone", async () => {
      api.availability.listChanges.mockResolvedValue({
        total: 1,
        offset: 0,
        items: [
          {
            id: "ch1",
            summary: "Paused online booking tonight",
            at: "2026-10-28T19:00:00Z",
            revertible: true,
          },
        ],
      });

      const result = await list();

      expect(api.availability.listChanges).toHaveBeenCalledWith("v1", { limit: 1 });
      expect(result).toMatchObject({ undoable: { summary: "Paused online booking tonight" } });
    });

    it("reports no undoable change when the newest one can't be undone", async () => {
      api.availability.listChanges.mockResolvedValue({
        total: 1,
        offset: 0,
        items: [
          { id: "ch1", summary: "Closed Dec 24", at: "2026-10-28T19:00:00Z", revertible: false },
        ],
      });

      await expect(list()).resolves.toMatchObject({ undoable: null });
    });
  });

  describe("change_tonight_availability", () => {
    beforeEach(() => {
      api.availability.setTonight.mockResolvedValue({
        ruleId: "rule",
        serviceDate: TODAY,
        expiresAt: "2026-10-29T10:00:00Z",
      });
    });

    it("holds the change for the user's confirmation and writes nothing", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools.change_tonight_availability!.execute!(
        { change: "pause_online" } as never,
        toolCtx
      );

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.availability.setTonight).not.toHaveBeenCalled();
    });

    it.each([
      [{ change: "pause_online" }, { type: "pause_online" }],
      [
        { change: "pacing", covers: 20 },
        { type: "pacing", covers: 20 },
      ],
      [
        { change: "close_early", closeAt: "22:00" },
        { type: "close_early", closeAt: 1320 },
      ],
      [
        { change: "close_early", closeAt: "01:00" },
        { type: "close_early", closeAt: 1500 },
      ],
      [
        { change: "close_early", closeAt: "21:00", service: "dinner" },
        { type: "close_early", closeAt: 1260, venueServiceId: "svc-dinner" },
      ],
      [
        { change: "stop_window", from: "19:30", to: "20:00" },
        { type: "stop_window", from: 1170, to: 1200 },
      ],
    ])("sends %o as the Tonight change %o against the version it read", async (input, change) => {
      const result = await run("change_tonight_availability", input);

      expect(api.availability.setTonight).toHaveBeenCalledWith("v1", {
        expectedVersion: 7,
        ruleId: expect.any(String),
        change,
      });
      expect(result).toMatchObject({ applied: true, serviceDate: TODAY });
    });

    it("blocks tables by the names staff use", async () => {
      api.tables.list.mockResolvedValue({
        data: [
          { id: "t1", name: "Patio 2", tableNumber: "12" },
          { id: "t2", name: "Bar", tableNumber: "3" },
        ],
      });

      await run("change_tonight_availability", {
        change: "block_tables",
        tables: ["Patio 2", "3"],
      });

      expect(api.availability.setTonight).toHaveBeenCalledWith("v1", {
        expectedVersion: 7,
        ruleId: expect.any(String),
        change: { type: "block_tables", tableIds: ["t1", "t2"] },
      });
    });

    it("refuses an unknown table rather than guessing", async () => {
      api.tables.list.mockResolvedValue({ data: [{ id: "t1", name: "Patio 2" }] });

      const result = await run("change_tonight_availability", {
        change: "block_tables",
        tables: ["Patio 9"],
      });

      expect(result).toMatchObject({ error: expect.stringContaining("Patio 9") });
      expect(api.availability.setTonight).not.toHaveBeenCalled();
    });

    it("refuses an unknown service rather than closing every service", async () => {
      const result = await run("change_tonight_availability", {
        change: "close_early",
        closeAt: "21:00",
        service: "Brunch",
      });

      expect(result).toMatchObject({ error: expect.stringContaining("Brunch") });
      expect(api.availability.setTonight).not.toHaveBeenCalled();
    });

    it("refuses a stop window that ends before it starts", async () => {
      const result = await run("change_tonight_availability", {
        change: "stop_window",
        from: "20:00",
        to: "19:30",
      });

      expect(result).toHaveProperty("error");
      expect(api.availability.setTonight).not.toHaveBeenCalled();
    });

    it("rejects fields a change type does not take before anything is confirmed", () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools.change_tonight_availability!.inputSchema as {
        safeParse: (v: unknown) => { success: boolean };
      };

      expect(schema.safeParse({ change: "pacing" }).success).toBe(false);
      expect(schema.safeParse({ change: "pause_online", covers: 3 }).success).toBe(false);
      expect(schema.safeParse({ change: "stop_window", from: "19:30" }).success).toBe(false);
      expect(schema.safeParse({ change: "close_early", closeAt: "9pm" }).success).toBe(false);
      expect(schema.safeParse({ change: "close_early", closeAt: "21:00" }).success).toBe(true);
    });

    it("sends a close-early that affects bookings to the Availability page", async () => {
      api.availability.setTonight.mockRejectedValue(problem(422, { code: "decision-required" }));

      const result = await run("change_tonight_availability", {
        change: "close_early",
        closeAt: "21:00",
      });

      expect(result).toMatchObject({
        needsDecisions: true,
        error: expect.stringContaining("Availability page"),
      });
    });

    it("says availability changed meanwhile on a version conflict", async () => {
      api.availability.setTonight.mockRejectedValue(problem(409, { code: "version-conflict" }));

      const result = await run("change_tonight_availability", { change: "pause_online" });

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/changed/i) });
    });

    it("says the user's role can't make the change on a 403", async () => {
      api.availability.setTonight.mockRejectedValue(problem(403));

      const result = await run("change_tonight_availability", { change: "pause_online" });

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
    });

    it("reports a transient failure without claiming the change was made", async () => {
      api.availability.setTonight.mockRejectedValue(new Error("socket hang up"));

      const result = await run("change_tonight_availability", { change: "pause_online" });

      expect(result).toMatchObject({ error: expect.stringMatching(/try again/i) });
      expect(result).not.toHaveProperty("applied");
    });
  });

  describe("end_tonight_change", () => {
    beforeEach(() => {
      api.availability.endTonight.mockResolvedValue({ version: 8, changeId: "ch9" });
    });

    it("ends the one Tonight change of that kind", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          tonightRule("r1", {
            targetKind: "booking",
            payload: { version: 1, stop: { from: 0, to: 2880 } },
          }),
          tonightRule("r2", { payload: { version: 1, pacing: { covers: 20 } } }),
        ])
      );

      const result = await run("end_tonight_change", { change: "pause_online" });

      expect(api.availability.endTonight).toHaveBeenCalledWith("v1", "r1");
      expect(result).toMatchObject({ ended: true });
    });

    it("picks a stop window by its start time when there are several", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          tonightRule("r1", { payload: { version: 1, stop: { from: 1080, to: 1110 } } }),
          tonightRule("r2", { payload: { version: 1, stop: { from: 1170, to: 1200 } } }),
        ])
      );

      await run("end_tonight_change", { change: "stop_window", from: "19:30" });

      expect(api.availability.endTonight).toHaveBeenCalledWith("v1", "r2");
    });

    it("asks which one when several match", async () => {
      api.availability.getConfig.mockResolvedValue(
        configState([
          tonightRule("r1", { payload: { version: 1, stop: { from: 1080, to: 1110 } } }),
          tonightRule("r2", { payload: { version: 1, stop: { from: 1170, to: 1200 } } }),
        ])
      );

      const result = await run("end_tonight_change", { change: "stop_window" });

      expect(result).toHaveProperty("error");
      expect(api.availability.endTonight).not.toHaveBeenCalled();
    });

    it("says nothing is in force when no change of that kind is", async () => {
      const result = await run("end_tonight_change", { change: "pacing" });

      expect(result).toMatchObject({ error: expect.stringMatching(/no/i) });
      expect(api.availability.endTonight).not.toHaveBeenCalled();
    });
  });

  describe("undo_availability_change", () => {
    const entry = {
      id: "ch1",
      summary: "Paused online booking tonight",
      at: "2026-10-28T19:00:00Z",
      revertible: true,
    };

    it("undoes the newest change when it is the one the user confirmed", async () => {
      api.availability.listChanges.mockResolvedValue({ total: 1, offset: 0, items: [entry] });
      api.availability.revertChange.mockResolvedValue({ version: 8, changeId: "ch2" });

      const result = await run("undo_availability_change", { summary: entry.summary });

      expect(api.availability.revertChange).toHaveBeenCalledWith("v1", "ch1", 7);
      expect(result).toMatchObject({ undone: true });
    });

    it("refuses when the newest change is no longer the confirmed one", async () => {
      api.availability.listChanges.mockResolvedValue({
        total: 1,
        offset: 0,
        items: [{ ...entry, id: "ch5", summary: "Set pacing to 20 covers" }],
      });

      const result = await run("undo_availability_change", { summary: entry.summary });

      expect(result).toMatchObject({ error: expect.stringContaining("Set pacing to 20 covers") });
      expect(api.availability.revertChange).not.toHaveBeenCalled();
    });

    it("refuses when nothing can be undone", async () => {
      api.availability.listChanges.mockResolvedValue({
        total: 1,
        offset: 0,
        items: [{ ...entry, revertible: false }],
      });

      const result = await run("undo_availability_change", { summary: entry.summary });

      expect(result).toHaveProperty("error");
      expect(api.availability.revertChange).not.toHaveBeenCalled();
    });

    it("explains a change that already told guests can't be undone", async () => {
      api.availability.listChanges.mockResolvedValue({ total: 1, offset: 0, items: [entry] });
      api.availability.revertChange.mockRejectedValue(problem(409, { code: "guests-notified" }));

      const result = await run("undo_availability_change", { summary: entry.summary });

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/guests/i) });
    });
  });

  it.each([
    "list_tonight_changes",
    "change_tonight_availability",
    "end_tonight_change",
    "undo_availability_change",
  ])("%s never asks the model for a venue and needs one selected", async (name) => {
    const tools = createAgentTools(log, api as never, {
      confirmedAction: {
        actionId: "call-1",
        toolName: name,
        toolInput: { change: "pacing", covers: 2, summary: "x" },
      },
    });
    const schema = tools[name]!.inputSchema as unknown as { shape: Record<string, unknown> };
    expect(Object.keys(schema.shape)).not.toContain("venueId");

    const input =
      name === "undo_availability_change" ? { summary: "x" } : { change: "pacing", covers: 2 };
    await expect(tools[name]!.execute!(input as never, toolCtx)).resolves.toMatchObject({
      error: expect.stringContaining("No venue"),
    });
  });
});
