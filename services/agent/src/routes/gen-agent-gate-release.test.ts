import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";

/**
 * #8134: the gate spends a confirmed action's single use before it calls the tool,
 * and gives it back only when the tool states that nothing was written.
 */

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

function problem(status: number) {
  return Object.assign(new Error(`${status}`), {
    problemDetails: { type: "about:blank", title: "x", status, detail: "Refused." },
  });
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

/** Pinned verbatim: a spent action must not claim the first attempt did or did not run. */
const ALREADY = {
  error:
    "This confirmed action was already attempted in this request and may or may not have run. Go by that attempt's result; ask the user to confirm again.",
};

const TABLES = { data: [{ id: "t1", tableNumber: "3", status: "OCCUPIED" }] };
const CONFIRMED_INPUT = { table: "3", status: "DIRTY" } as const;

describe("confirmation gate: releasing the single use (#8134)", () => {
  let api: {
    tables: { list: ReturnType<typeof vi.fn>; updateStatus: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    api = { tables: { list: vi.fn(), updateStatus: vi.fn() } };
  });

  function tools() {
    return createAgentTools(createMockLogger(), api as never, {
      venueId: "v1",
      confirmedAction: {
        actionId: "call-1",
        toolName: "update_table_status",
        toolInput: { ...CONFIRMED_INPUT },
      },
    });
  }

  const run = (t: ReturnType<typeof tools>, input: Record<string, unknown> = CONFIRMED_INPUT) =>
    t.update_table_status!.execute!(input as never, toolCtx) as Promise<Record<string, unknown>>;

  it("a call that wrote nothing does not spend the confirmed action", async () => {
    api.tables.list
      .mockResolvedValueOnce({ data: [] }) // table not found: refused before any write
      .mockResolvedValueOnce(TABLES);
    api.tables.updateStatus.mockResolvedValue({ id: "t1", status: "DIRTY" });
    const t = tools();

    const first = await run(t);
    const second = await run(t);

    expect(first).toEqual({ error: expect.stringContaining("not found") });
    expect(first).not.toHaveProperty("notExecuted");
    expect(second).toEqual({ table: { id: "t1", status: "DIRTY" } });
    expect(api.tables.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("a released call still runs the confirmed input, never the model's", async () => {
    api.tables.list.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce(TABLES);
    api.tables.updateStatus.mockResolvedValue({ id: "t1", status: "DIRTY" });
    const t = tools();

    await run(t);
    await run(t, { table: "9", status: "AVAILABLE" });

    expect(api.tables.updateStatus).toHaveBeenCalledWith("t1", "DIRTY");
  });

  it("a released action still arms only its own tool", async () => {
    api.tables.list.mockResolvedValueOnce({ data: [] });
    const t = tools();
    await run(t);

    const other = await t.create_reservation!.execute!(
      {
        guestName: "Smith",
        date: "2026-05-18",
        startTime: "19:00",
        endTime: "21:00",
        partySize: 4,
        tableId: "t1",
      } as never,
      toolCtx
    );

    expect(other).toEqual({ pendingConfirmation: true, message: expect.any(String) });
  });

  it("a thrown error after the write was sent keeps the action spent", async () => {
    api.tables.list.mockResolvedValue(TABLES);
    api.tables.updateStatus.mockRejectedValue(new Error("socket hang up"));
    const t = tools();

    await run(t);
    const second = await run(t);

    expect(second).toEqual(ALREADY);
    expect(api.tables.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("a server refusal of the write itself keeps the action spent unless the tool proves nothing changed", async () => {
    api.tables.list.mockResolvedValue(TABLES);
    api.tables.updateStatus.mockRejectedValue(problem(500));
    const t = tools();

    await run(t);
    const second = await run(t);

    expect(second).toEqual(ALREADY);
    expect(api.tables.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("a 403 on the write says nothing changed, and a second call is told only that it was attempted", async () => {
    api.tables.list.mockResolvedValue(TABLES);
    api.tables.updateStatus.mockRejectedValue(problem(403));
    const t = tools();

    const first = await run(t);
    const second = await run(t);

    expect(first).toEqual({ refused: true, error: expect.stringContaining("Nothing was changed") });
    expect(second).toEqual(ALREADY);
    expect(second.error).not.toMatch(/executed|Nothing was changed/);
    expect(api.tables.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("a read that fails before the write releases the action", async () => {
    api.tables.list.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(TABLES);
    api.tables.updateStatus.mockResolvedValue({ id: "t1", status: "DIRTY" });
    const t = tools();

    await run(t);
    const second = await run(t);

    expect(second).toEqual({ table: { id: "t1", status: "DIRTY" } });
  });

  describe("two simultaneous calls in one run", () => {
    it("a first call that refuses never lets the second run while it is in flight", async () => {
      let finishList!: (v: unknown) => void;
      api.tables.list.mockReturnValueOnce(
        new Promise((resolve) => {
          finishList = resolve;
        })
      );
      const t = tools();

      const first = run(t);
      const second = await run(t, { table: "9", status: "AVAILABLE" });
      finishList({ data: [] });
      await first;

      expect(second).toEqual(ALREADY);
      expect(api.tables.updateStatus).not.toHaveBeenCalled();
    });

    it("exactly one write happens when the first succeeds", async () => {
      let finishWrite!: (v: unknown) => void;
      api.tables.list.mockResolvedValue(TABLES);
      api.tables.updateStatus.mockReturnValue(
        new Promise((resolve) => {
          finishWrite = resolve;
        })
      );
      const t = tools();

      const first = run(t);
      const second = run(t, { table: "9", status: "AVAILABLE" });
      await vi.waitFor(() => expect(api.tables.updateStatus).toHaveBeenCalledTimes(1));
      finishWrite({ id: "t1", status: "DIRTY" });

      expect(await first).toEqual({ table: { id: "t1", status: "DIRTY" } });
      expect(await second).toEqual({
        error: ALREADY.error,
      });
      expect(api.tables.updateStatus).toHaveBeenCalledTimes(1);
    });

    it("a late third call after a release runs once, then the action is spent", async () => {
      api.tables.list.mockResolvedValueOnce({ data: [] }).mockResolvedValue(TABLES);
      api.tables.updateStatus.mockResolvedValue({ id: "t1", status: "DIRTY" });
      const t = tools();

      await run(t);
      const results = await Promise.all([run(t), run(t)]);

      expect(api.tables.updateStatus).toHaveBeenCalledTimes(1);
      expect(results.filter((r) => "table" in r)).toHaveLength(1);
    });
  });
});
