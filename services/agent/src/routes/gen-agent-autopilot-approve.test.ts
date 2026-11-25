import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";

const log = {
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

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

const reseat = {
  id: "reseat:r1>t2",
  kind: "reseat",
  partyLabel: "Ana",
  reservationId: "r1",
  waitlistEntryId: null,
  partySize: 2,
  fromTableId: "t6",
  fromTableName: "Booth",
  toTableId: "t2",
  toTableName: "Two-top",
  startTime: "2026-06-19T02:00:00.000Z",
  endTime: "2026-06-19T03:30:00.000Z",
  reason: "Move Ana (2) to Two-top",
};

const offer = {
  ...reseat,
  id: "offer:w1>t6",
  kind: "waitlist_offer",
  partyLabel: "Kim",
  reservationId: null,
  waitlistEntryId: "w1",
  partySize: 5,
  fromTableId: null,
  fromTableName: null,
  toTableId: "t6",
  toTableName: "Booth",
};

const INPUT = { moveId: "reseat:r1>t2", party: "Ana", to: "Two-top" };

describe("approve_autopilot_move chat tool", () => {
  let api: {
    reservations: {
      getAutopilotProposals: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      walkIn: ReturnType<typeof vi.fn>;
    };
    waitlist: { seat: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    api = {
      reservations: {
        getAutopilotProposals: vi
          .fn()
          .mockResolvedValue({ date: "2026-06-19", venueId: "v1", moves: [reseat, offer] }),
        update: vi.fn().mockResolvedValue({ id: "r1" }),
        walkIn: vi.fn().mockResolvedValue({ id: "r9" }),
      },
      waitlist: { seat: vi.fn().mockResolvedValue({ id: "w1" }) },
    };
  });

  function run(
    input: Record<string, unknown> = INPUT,
    options: { venueId?: string; confirmed?: boolean } = {}
  ) {
    const { venueId = "v1", confirmed = true } = options;
    const tools = createAgentTools(log, api as never, {
      venueId,
      ...(confirmed
        ? {
            confirmedAction: {
              actionId: "call-1",
              toolName: "approve_autopilot_move",
              toolInput: input,
            },
          }
        : {}),
    });
    return tools.approve_autopilot_move!.execute!(input as never, toolCtx);
  }

  it("is a confirm-gated write", () => {
    expect(GEN_WRITE_TOOL_NAMES).toContain("approve_autopilot_move");
  });

  it("holds the move for the user's confirmation and changes nothing", async () => {
    const result = await run(INPUT, { confirmed: false });

    expect(result).toMatchObject({ pendingConfirmation: true });
    expect(api.reservations.getAutopilotProposals).not.toHaveBeenCalled();
    expect(api.reservations.update).not.toHaveBeenCalled();
    expect(api.reservations.walkIn).not.toHaveBeenCalled();
  });

  it("moves the booking to the proposed table, exactly as suggested", async () => {
    const result = await run();

    expect(api.reservations.getAutopilotProposals).toHaveBeenCalledWith({ venueId: "v1" });
    expect(api.reservations.update).toHaveBeenCalledWith("r1", { tableId: "t2" });
    expect(result).toMatchObject({ moved: true, party: "Ana", to: "Two-top" });
  });

  it("seats a waiting party: a walk-in at the table, then off the waitlist", async () => {
    const result = await run({ moveId: "offer:w1>t6", party: "Kim", to: "Booth" });

    expect(api.reservations.walkIn).toHaveBeenCalledWith({
      venueId: "v1",
      partySize: 5,
      tableId: "t6",
      guestName: "Kim",
    });
    expect(api.waitlist.seat).toHaveBeenCalledWith("w1");
    expect(result).toMatchObject({ seated: true, party: "Kim", to: "Booth" });
  });

  it("refuses a move that is no longer suggested, without writing", async () => {
    api.reservations.getAutopilotProposals.mockResolvedValue({
      date: "2026-06-19",
      venueId: "v1",
      moves: [],
    });

    const result = await run();

    expect(result).toMatchObject({ error: expect.stringMatching(/no longer/i) });
    expect(api.reservations.update).not.toHaveBeenCalled();
  });

  it("says when the party is seated but still shown on the waitlist", async () => {
    api.waitlist.seat.mockRejectedValue(new Error("boom"));

    const result = await run({ moveId: "offer:w1>t6", party: "Kim", to: "Booth" });

    expect(result).toMatchObject({ seated: true, waitlistStale: true });
  });

  it("refuses when the confirmed party or table is not the move's own", async () => {
    const result = await run({ ...INPUT, to: "Booth" });

    expect(result).toMatchObject({ error: expect.stringMatching(/doesn't match/i) });
    expect(api.reservations.update).not.toHaveBeenCalled();
  });

  it("does not claim the move happened when the write fails", async () => {
    api.reservations.update.mockRejectedValue(new Error("boom"));

    const result = await run();

    expect(result).not.toHaveProperty("moved");
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("asks for a venue when none is selected", async () => {
    const result = await run(INPUT, { venueId: "" });

    expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
    expect(api.reservations.update).not.toHaveBeenCalled();
  });
});
