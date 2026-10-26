import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useStaffBookingCheck, type StaffCheckParams } from "./useStaffBookingCheck.js";

const mockCheck = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ availability: { checkBooking: mockCheck } }),
}));

const WINDOW = { start: "2026-04-10T18:30:00.000Z", end: "2026-04-10T20:00:00.000Z" };
const LATER = { start: "2026-04-10T19:00:00.000Z", end: "2026-04-10T20:30:00.000Z" };

const BASE: StaffCheckParams = {
  venueId: "venue-1",
  window: WINDOW,
  partySize: 2,
  selectedTableId: "t1",
};

function setup(initial: StaffCheckParams = BASE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook((props: StaffCheckParams) => useStaffBookingCheck(props), {
    wrapper,
    initialProps: initial,
  });
}

describe("useStaffBookingCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockResolvedValue({ kind: "ok" });
  });

  it("is idle, and asks nothing, until a time window exists", async () => {
    vi.useFakeTimers();
    try {
      const { result } = setup({ ...BASE, window: null });
      expect(result.current.phase).toBe("idle");
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(mockCheck).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks only the selected table, as a phone booking with the real end", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(mockCheck).toHaveBeenCalledWith("venue-1", {
      ...WINDOW,
      partySize: 2,
      channel: "phone",
      tableId: "t1",
    });
  });

  it("sends one request when the window changes during the pause", async () => {
    const { result, rerender } = setup({ ...BASE, window: null });
    rerender({ ...BASE, window: WINDOW });
    rerender({ ...BASE, window: LATER });
    expect(result.current.phase).toBe("checking");
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(mockCheck).toHaveBeenCalledWith("venue-1", expect.objectContaining(LATER));
  });

  it("answers with the verdict", async () => {
    const soft = { kind: "soft", limits: ["pacing"], message: "m" };
    mockCheck.mockResolvedValue(soft);
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.verdict).toEqual(soft);
  });

  it("reports failed when the check errors", async () => {
    mockCheck.mockRejectedValue(new Error("network"));
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(result.current.verdict).toBeNull();
  });
});
