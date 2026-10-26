import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useStaffBookingCheck } from "./useStaffBookingCheck.js";

const mockCheck = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ availability: { checkBooking: mockCheck } }),
}));

const WINDOW = { start: "2026-04-10T18:30:00.000Z", end: "2026-04-10T20:00:00.000Z" };

function setup(overrides: Partial<Parameters<typeof useStaffBookingCheck>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(
    () =>
      useStaffBookingCheck({
        venueId: "venue-1",
        window: WINDOW,
        partySize: 2,
        tableIds: ["t1", "t2"],
        selectedTableId: "t1",
        ...overrides,
      }),
    { wrapper }
  );
}

describe("useStaffBookingCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockResolvedValue({ kind: "ok" });
  });

  it("is idle, and asks nothing, until a time window exists", () => {
    const { result } = setup({ window: null });
    expect(result.current.phase).toBe("idle");
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("checks every candidate table as a phone booking with the real end", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(mockCheck).toHaveBeenCalledWith("venue-1", {
      ...WINDOW,
      partySize: 2,
      channel: "phone",
      tableId: "t1",
    });
    expect(mockCheck).toHaveBeenCalledWith("venue-1", expect.objectContaining({ tableId: "t2" }));
  });

  it("answers with the selected table's verdict and lists blocked tables", async () => {
    const soft = { kind: "soft", limits: ["pacing"], message: "m" };
    mockCheck.mockImplementation(async (_v: string, body: { tableId: string }) =>
      body.tableId === "t1" ? soft : { kind: "hard", reason: "table_blocked", message: "x" }
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.verdict).toEqual(soft);
    expect([...result.current.blockedTableIds]).toEqual(["t2"]);
  });

  it("reports failed when the selected table's check errors", async () => {
    mockCheck.mockRejectedValue(new Error("network"));
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(result.current.verdict).toBeNull();
  });
});
