import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { AutopilotMove } from "@mbe/types";

const proposals = vi.fn();
vi.mock("./useAutopilotProposals.js", () => ({
  useAutopilotProposals: (params: unknown) => proposals(params),
}));

import { useTonightAutopilot } from "./useTonightAutopilot.js";

const move = { id: "m1" } as AutopilotMove;

describe("useTonightAutopilot", () => {
  beforeEach(() => {
    window.localStorage.clear();
    proposals.mockReset();
    proposals.mockReturnValue({ data: { date: "2026-06-19", venueId: "v1", moves: [move] } });
  });

  it("asks for the service date the Timeline is showing, not the calendar day", () => {
    renderHook(() => useTonightAutopilot("v1", "2026-06-19", true));
    expect(proposals).toHaveBeenCalledWith({ venueId: "v1", date: "2026-06-19" });
  });

  it("asks for nothing when the Timeline is not on tonight", () => {
    const { result } = renderHook(() => useTonightAutopilot("v1", "2026-06-18", false));
    expect(proposals).toHaveBeenCalledWith({ venueId: null, date: "2026-06-18" });
    expect(result.current.moves).toEqual([]);
  });

  it("returns the moves for tonight", () => {
    const { result } = renderHook(() => useTonightAutopilot("v1", "2026-06-19", true));
    expect(result.current.moves).toEqual([move]);
  });
});
