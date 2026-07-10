import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Venue, FloorPlan, Table } from "@mbe/types";
import { VenueProvider } from "../contexts/VenueContext.js";
import { useVenueReadiness } from "./useVenueReadiness.js";

/*
 * Integration regression for #3314: exercise the REAL VenueProvider (not a
 * mocked useVenue) through useVenueReadiness on a FRESH browser context — no
 * pre-seeded localStorage["mbe-hospitality-venue-id"]. The e2e suite pre-seeds
 * that key, so it no longer covers this race. On the render where the venues
 * query settles, the selection must already be reconciled; otherwise readiness
 * flaps to "no-venue" for one commit and DashboardLayout bounces to /onboarding.
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

/* ── Fixtures (fully-onboarded venue → operational once floor plans load) ── */

const VENUE: Venue = {
  id: "venue-1",
  venueGroupId: null,
  name: "Downtown Bistro",
  slug: "downtown-bistro",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: {
    monday: { open: "09:00", close: "22:00" },
  },
  settings: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const TABLE: Table = {
  id: "table-1",
  name: "Table 1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: null,
  isActive: true,
  priority: 0,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const FLOOR_PLAN: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Floor",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [TABLE],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

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
  mockVenuesList.mockResolvedValue({ data: [VENUE] });
  mockFloorPlansList.mockResolvedValue({ data: [FLOOR_PLAN] });
});

function wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <VenueProvider>{children}</VenueProvider>
    </QueryClientProvider>
  );
}

describe("useVenueReadiness — fresh context, no pre-seeded venue id (regression #3314)", () => {
  it("never reports 'no-venue' once venues are present, so the redirect guard never fires", async () => {
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

    // The bug: on the commit where the venues query settles, the selection was
    // still null (reconciled only in a later effect), so readiness flapped to
    // "no-venue" — long enough for DashboardLayout to navigate to /onboarding.
    expect(statuses).not.toContain("no-venue");

    // Selection settled to the real venue → operational (fully-onboarded fixture).
    expect(result.current.status).toBe("operational");
    expect(storageMap.get("mbe-hospitality-venue-id")).toBe("venue-1");
  });
});
