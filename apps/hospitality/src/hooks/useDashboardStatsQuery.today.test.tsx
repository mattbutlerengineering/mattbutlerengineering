import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

process.env.TZ = "America/Los_Angeles";

const list = vi.fn();
const listByVenueAndDate = vi.fn();

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1" }),
}));
vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    reservations: { list },
    waitlist: { list: vi.fn().mockResolvedValue([]) },
    deposits: { listByVenueAndDate },
  }),
}));

import { useDashboardStatsQuery } from "./useDashboardStatsQuery.js";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDashboardStatsQuery today", () => {
  beforeEach(() => {
    list.mockResolvedValue({ data: [] });
    listByVenueAndDate.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requests the local service day at 18:00 Pacific, not the UTC day (tomorrow)", async () => {
    // 18:00 PDT on 2026-10-12 is 01:00Z on 2026-10-13.
    const now = new Date(2026, 9, 12, 18, 0);
    expect(now.toISOString().slice(0, 10)).toBe("2026-10-13");
    vi.useFakeTimers({ toFake: ["Date"], now });
    try {
      renderHook(() => useDashboardStatsQuery(), { wrapper });
      await waitFor(() => expect(list).toHaveBeenCalled());
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-12" }));
      await waitFor(() => expect(listByVenueAndDate).toHaveBeenCalledWith("venue-1", "2026-10-12"));
    } finally {
      vi.useRealTimers();
    }
  });
});
