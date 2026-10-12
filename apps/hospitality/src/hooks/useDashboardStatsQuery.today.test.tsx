import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useDashboardStatsQuery } from "./useDashboardStatsQuery.js";

const reservationsList = vi.fn().mockResolvedValue({ data: [] });
const depositsList = vi.fn().mockResolvedValue([]);

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1" }),
}));
vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    reservations: { list: reservationsList },
    waitlist: { list: vi.fn().mockResolvedValue([]) },
    deposits: { listByVenueAndDate: depositsList },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDashboardStatsQuery service day", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("requests the device-local date at 01:00Z (still the previous evening in Los Angeles)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-04T01:00:00Z"));

    const { result } = renderHook(() => useDashboardStatsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(reservationsList).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-03" }));
    expect(depositsList).toHaveBeenCalledWith("venue-1", "2026-09-03");
  });
});
