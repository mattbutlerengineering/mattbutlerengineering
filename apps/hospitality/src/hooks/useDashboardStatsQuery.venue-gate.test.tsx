import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// #8563: before the venue list resolves `selectedVenueId` is null. The list
// route 403s a non-admin request that names no venue, so the dashboard must
// not fire it (or the waitlist/deposit reads) until a venue is selected.
const list = vi.fn();

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: null }),
}));
vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    reservations: { list },
    waitlist: { list: vi.fn().mockResolvedValue([]) },
    deposits: { listByVenueAndDate: vi.fn().mockResolvedValue([]) },
  }),
}));

import { useDashboardStatsQuery } from "./useDashboardStatsQuery.js";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDashboardStatsQuery without a selected venue", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not request reservations until a venue is selected", async () => {
    list.mockResolvedValue({ data: [] });
    renderHook(() => useDashboardStatsQuery(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(list).not.toHaveBeenCalled();
  });
});
