import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { VenueProvider } from "../contexts/VenueContext.js";
import { useVenueReadiness } from "./useVenueReadiness.js";

/*
 * Regression for #3889: a genuinely zero-venue account, distinct from the
 * #3314 "unreconciled but present" case covered by
 * useVenueReadiness.fresh-context.test.tsx (which seeds a real venue and
 * asserts the selection never flaps through "no-venue"). Here the venues
 * list actually resolves empty, so "no-venue" is the correct — and only —
 * terminal status. This is the fixture DashboardLayout's redirect-timing
 * fix (render-time <Navigate>, not a useEffect) depends on: the hook must
 * settle from "loading" straight to "no-venue" with no unstable status.
 */

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "tok" }),
}));

const mockVenuesList = vi.fn();
const mockFloorPlansList = vi.fn();
const mockApiClient = {
  venues: { list: mockVenuesList },
  floorPlans: { list: mockFloorPlansList },
};

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => mockApiClient,
}));

const storageMap = new Map<string, string>();
let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  storageMap.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  });

  mockVenuesList.mockReset();
  mockFloorPlansList.mockReset();
  mockVenuesList.mockResolvedValue({ data: [] });
  mockFloorPlansList.mockResolvedValue({ data: [] });
});

function wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <VenueProvider>{children}</VenueProvider>
    </QueryClientProvider>
  );
}

describe("useVenueReadiness — true zero-venue account (#3889)", () => {
  it("settles from loading straight to no-venue, never operational or setup", async () => {
    const statuses: string[] = [];

    const { result } = renderHook(
      () => {
        const readiness = useVenueReadiness();
        statuses.push(readiness.status);
        return readiness;
      },
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.status).not.toBe("loading");
    });

    expect(result.current.status).toBe("no-venue");
    expect(statuses).not.toContain("operational");
    expect(statuses).not.toContain("setup");
    expect(storageMap.get("mbe-hospitality-venue-id")).toBeUndefined();
  });
});
