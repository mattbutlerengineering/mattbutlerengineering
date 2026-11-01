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
    reservations: {
      get: vi.fn(),
      update: vi.fn(),
      markNoShow: vi.fn(),
      cancel: vi.fn(),
      cancelWithReason: vi.fn(),
    },
    tables: { list: vi.fn(), updateStatus: vi.fn() },
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

function reservation(fields: Record<string, unknown> = {}) {
  return { id: "r1", venueId: "v1", status: "CONFIRMED", tableId: "t1", ...fields };
}

describe("timeline chat tools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    api.tables.list.mockResolvedValue({
      data: [
        { id: "t1", name: "Patio 2", tableNumber: "12", status: "AVAILABLE" },
        { id: "t2", name: "Bar", tableNumber: "3", status: "AVAILABLE" },
        { id: "t3", name: "Window", tableNumber: "5", status: "DIRTY" },
      ],
    });
    api.tables.updateStatus.mockResolvedValue({ id: "t1", status: "OCCUPIED" });
  });

  function run(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, {
      venueId: "v1",
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  describe("seat_reservation", () => {
    it("holds the seating for the user's confirmation", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools.seat_reservation!.execute!(
        { reservationId: "r1" } as never,
        toolCtx
      );

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.tables.updateStatus).not.toHaveBeenCalled();
    });

    it("seats a confirmed booking at its own table", async () => {
      api.reservations.get.mockResolvedValue(reservation());

      const result = await run("seat_reservation", { reservationId: "r1" });

      expect(api.reservations.update).not.toHaveBeenCalled();
      expect(api.tables.updateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
      expect(result).toMatchObject({ seated: true, table: "Patio 2" });
    });

    it("confirms a pending booking before seating it, as the timeline does", async () => {
      api.reservations.get.mockResolvedValue(reservation({ status: "PENDING" }));
      api.reservations.update.mockResolvedValue(reservation());

      await run("seat_reservation", { reservationId: "r1" });

      expect(api.reservations.update).toHaveBeenCalledWith("r1", { status: "CONFIRMED" });
      expect(api.tables.updateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
    });

    it("moves the booking to the table staff name before seating", async () => {
      api.reservations.get.mockResolvedValue(reservation());
      api.reservations.update.mockResolvedValue(reservation({ tableId: "t2" }));

      await run("seat_reservation", { reservationId: "r1", table: "Bar" });

      expect(api.reservations.update).toHaveBeenCalledWith("r1", { tableId: "t2" });
      expect(api.tables.updateStatus).toHaveBeenCalledWith("t2", "OCCUPIED");
    });

    // The reservations service refuses a status change combined with a table change.
    it("confirms a pending booking and moves it in two separate updates", async () => {
      api.reservations.get.mockResolvedValue(reservation({ status: "PENDING" }));
      api.reservations.update.mockResolvedValue(reservation());

      await run("seat_reservation", { reservationId: "r1", table: "Bar" });

      expect(api.reservations.update).toHaveBeenNthCalledWith(1, "r1", { status: "CONFIRMED" });
      expect(api.reservations.update).toHaveBeenNthCalledWith(2, "r1", { tableId: "t2" });
      expect(api.tables.updateStatus).toHaveBeenCalledWith("t2", "OCCUPIED");
    });

    it("refuses a table that isn't available before changing anything", async () => {
      api.reservations.get.mockResolvedValue(reservation({ status: "PENDING" }));

      const result = await run("seat_reservation", { reservationId: "r1", table: "Window" });

      expect(result).toMatchObject({ error: expect.stringMatching(/Window .*dirty/i) });
      expect(api.reservations.update).not.toHaveBeenCalled();
      expect(api.tables.updateStatus).not.toHaveBeenCalled();
    });

    it("says what was saved when a later step fails", async () => {
      api.reservations.get.mockResolvedValue(reservation({ status: "PENDING" }));
      api.reservations.update.mockResolvedValue(reservation());
      api.tables.updateStatus.mockRejectedValue(problem(409, { detail: "Table is taken." }));

      const result = await run("seat_reservation", { reservationId: "r1" });

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringMatching(/already saved/i),
      });
      expect((result as { error: string }).error).not.toMatch(/Nothing was changed/);
    });

    it("refuses a booking that isn't waiting to be seated", async () => {
      api.reservations.get.mockResolvedValue(reservation({ status: "CANCELLED" }));

      const result = await run("seat_reservation", { reservationId: "r1" });

      expect(result).toMatchObject({ error: expect.stringMatching(/cancelled/i) });
      expect(api.tables.updateStatus).not.toHaveBeenCalled();
    });

    it("refuses a booking from another venue", async () => {
      api.reservations.get.mockResolvedValue(reservation({ venueId: "v2" }));

      const result = await run("seat_reservation", { reservationId: "r1" });

      expect(result).toHaveProperty("error");
      expect(api.tables.updateStatus).not.toHaveBeenCalled();
    });

    it("refuses an unknown table rather than guessing", async () => {
      api.reservations.get.mockResolvedValue(reservation());

      const result = await run("seat_reservation", { reservationId: "r1", table: "Patio 9" });

      expect(result).toMatchObject({ error: expect.stringContaining("Patio 9") });
      expect(api.reservations.update).not.toHaveBeenCalled();
    });

    it("passes on the server's refusal in plain words", async () => {
      api.reservations.get.mockResolvedValue(reservation());
      api.tables.updateStatus.mockRejectedValue(
        problem(409, { detail: "Table Patio 2 is not available." })
      );

      const result = await run("seat_reservation", { reservationId: "r1" });

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringContaining("not available"),
      });
    });
  });

  describe("mark_no_show", () => {
    it("marks the booking a no-show and passes on the server's warning", async () => {
      api.reservations.get.mockResolvedValue(reservation());
      api.reservations.markNoShow.mockResolvedValue({
        reservation: reservation({ status: "NO_SHOW" }),
        warning: "The deposit was not captured.",
      });

      const result = await run("mark_no_show", { reservationId: "r1" });

      expect(api.reservations.markNoShow).toHaveBeenCalledWith("r1");
      expect(result).toMatchObject({ noShow: true, warning: "The deposit was not captured." });
    });

    it("passes on the server's refusal in plain words", async () => {
      api.reservations.get.mockResolvedValue(reservation());
      api.reservations.markNoShow.mockRejectedValue(
        problem(409, { detail: "This booking is already seated." })
      );

      const result = await run("mark_no_show", { reservationId: "r1" });

      expect(result).toMatchObject({
        refused: true,
        error: expect.stringContaining("already seated"),
      });
    });

    it("refuses a booking from another venue", async () => {
      api.reservations.get.mockResolvedValue(reservation({ venueId: "v2" }));

      const result = await run("mark_no_show", { reservationId: "r1" });

      expect(result).toHaveProperty("error");
      expect(api.reservations.markNoShow).not.toHaveBeenCalled();
    });
  });

  describe("cancel_reservation with a reason", () => {
    it("records the reason and note the user gave", async () => {
      api.reservations.cancelWithReason.mockResolvedValue(reservation({ status: "CANCELLED" }));

      await run("cancel_reservation", {
        reservationId: "r1",
        reason: "guest_cancelled",
        note: "Called at 5",
      });

      expect(api.reservations.cancelWithReason).toHaveBeenCalledWith("r1", {
        cancellationReason: "guest_cancelled",
        cancellationNote: "Called at 5",
      });
      expect(api.reservations.cancel).not.toHaveBeenCalled();
    });

    it("cancels without a reason as before", async () => {
      api.reservations.cancel.mockResolvedValue(reservation({ status: "CANCELLED" }));

      await run("cancel_reservation", { reservationId: "r1" });

      expect(api.reservations.cancel).toHaveBeenCalledWith("r1");
      expect(api.reservations.cancelWithReason).not.toHaveBeenCalled();
    });

    it("accepts only the reasons the timeline offers", () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools.cancel_reservation!.inputSchema as unknown as {
        safeParse: (v: unknown) => { success: boolean };
      };

      expect(schema.safeParse({ reservationId: "r1", reason: "bored" }).success).toBe(false);
      expect(schema.safeParse({ reservationId: "r1", reason: "no_show" }).success).toBe(true);
    });
  });
  describe.each([
    ["seat_reservation", { reservationId: "r1" }],
    ["mark_no_show", { reservationId: "r1" }],
    ["cancel_reservation", { reservationId: "r1", reason: "other" }],
  ])("%s", (toolName, input) => {
    it("holds the change for the user's confirmation", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.reservations.update).not.toHaveBeenCalled();
      expect(api.reservations.markNoShow).not.toHaveBeenCalled();
      expect(api.reservations.cancelWithReason).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const tools = createAgentTools(log, api as never, {
        confirmedAction: { actionId: "call-1", toolName, toolInput: input },
      });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
      expect(api.reservations.get).not.toHaveBeenCalled();
      expect(api.reservations.cancelWithReason).not.toHaveBeenCalled();
    });
  });
});
