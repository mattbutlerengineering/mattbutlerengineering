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

const move = {
  id: "reseat:r1>t2",
  kind: "reseat",
  partyLabel: "Ana",
  partySize: 2,
  fromTableId: "t6",
  fromTableName: "Booth",
  toTableId: "t2",
  toTableName: "Two-top",
  startTime: "2026-06-19T02:00:00.000Z",
  endTime: "2026-06-19T03:30:00.000Z",
  reason: "Move Ana (2) to Two-top",
};

describe("get_autopilot_suggestions chat tool", () => {
  let api: { reservations: { getAutopilotProposals: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    api = {
      reservations: {
        getAutopilotProposals: vi
          .fn()
          .mockResolvedValue({ date: "2026-06-19", venueId: "v1", moves: [move] }),
      },
    };
  });

  function run(options: { venueId?: string } = { venueId: "v1" }) {
    const tools = createAgentTools(log, api as never, options);
    return tools.get_autopilot_suggestions!.execute!({} as never, toolCtx);
  }

  it("is a read: not confirm-gated", () => {
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("get_autopilot_suggestions");
  });

  it("returns the proposed moves for the selected venue, in plain words", async () => {
    const result = await run();

    expect(api.reservations.getAutopilotProposals).toHaveBeenCalledWith({ venueId: "v1" });
    expect(result).toEqual({
      date: "2026-06-19",
      count: 1,
      moves: [
        {
          party: "Ana",
          partySize: 2,
          from: "Booth",
          to: "Two-top",
          reason: "Move Ana (2) to Two-top",
        },
      ],
    });
  });

  it("says there is nothing to move when there are no proposals", async () => {
    api.reservations.getAutopilotProposals.mockResolvedValue({
      date: "2026-06-19",
      venueId: "v1",
      moves: [],
    });

    expect(await run()).toMatchObject({ count: 0, moves: [] });
  });

  it("describes an unnamed party by its size, never by an id", async () => {
    api.reservations.getAutopilotProposals.mockResolvedValue({
      date: "2026-06-19",
      venueId: "v1",
      moves: [{ ...move, partyLabel: null }],
    });
    expect(await run()).toMatchObject({ moves: [{ party: "party of 2" }] });
  });

  it("asks for a venue when none is selected", async () => {
    const result = await run({});
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(api.reservations.getAutopilotProposals).not.toHaveBeenCalled();
  });

  it("reports a failed read instead of saying there is nothing to move", async () => {
    api.reservations.getAutopilotProposals.mockRejectedValue(new Error("boom"));

    const result = await run();

    expect(result).toMatchObject({ error: expect.stringMatching(/couldn't/i) });
    expect(result).not.toHaveProperty("moves");
  });
});
