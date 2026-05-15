/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef, @eslint-react/no-array-index-key */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { computeReadiness, useVenueReadiness } from "./useVenueReadiness.js";
import { useVenue } from "../contexts/VenueContext.js";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { Venue } from "@mbe/types";
import type { FloorPlan } from "@mbe/types";
import type { Table } from "@mbe/types";

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: vi.fn(),
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(),
}));

/* ── Fixtures ───────────────────────────────────────────────── */

const BASE_VENUE: Venue = {
  id: "venue-1",
  venueGroupId: null,
  name: "Test Venue",
  slug: "test-venue",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: null,
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

const FLOOR_PLAN_WITH_TABLES: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Floor",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [TABLE],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const FLOOR_PLAN_EMPTY: FloorPlan = {
  id: "fp-2",
  venueId: "venue-1",
  name: "Empty Floor",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const VENUE_WITH_HOURS: Venue = {
  ...BASE_VENUE,
  operatingHours: {
    monday: { open: "09:00", close: "22:00" },
  },
};

/* ── Tests ──────────────────────────────────────────────────── */

describe("computeReadiness", () => {
  it("no venue → status 'no-venue', nextStep null, progress 0", () => {
    const result = computeReadiness(null, []);

    expect(result.status).toBe("no-venue");
    expect(result.nextStep).toBeNull();
    expect(result.progress).toBe(0);
    expect(result.completedSteps).toHaveLength(0);
  });

  it("venue only → status 'setup', completedSteps ['onboarding'], nextStep 'operating-hours'", () => {
    const result = computeReadiness(BASE_VENUE, []);

    expect(result.status).toBe("setup");
    expect(result.completedSteps).toEqual(["onboarding"]);
    expect(result.nextStep).toBe("operating-hours");
  });

  it("venue + hours → status 'setup', completedSteps ['onboarding', 'operating-hours'], nextStep 'floor-plan'", () => {
    const result = computeReadiness(VENUE_WITH_HOURS, []);

    expect(result.status).toBe("setup");
    expect(result.completedSteps).toEqual(["onboarding", "operating-hours"]);
    expect(result.nextStep).toBe("floor-plan");
  });

  it("venue + hours + empty floor plan → status 'setup' (floor plan gate fails)", () => {
    const result = computeReadiness(VENUE_WITH_HOURS, [FLOOR_PLAN_EMPTY]);

    expect(result.status).toBe("setup");
    expect(result.completedSteps).toEqual(["onboarding", "operating-hours"]);
    expect(result.nextStep).toBe("floor-plan");
  });

  it("all gates satisfied → status 'operational', nextStep null, progress 100", () => {
    const result = computeReadiness(VENUE_WITH_HOURS, [FLOOR_PLAN_WITH_TABLES]);

    expect(result.status).toBe("operational");
    expect(result.nextStep).toBeNull();
    expect(result.progress).toBe(100);
    expect(result.completedSteps).toEqual(["onboarding", "operating-hours", "floor-plan"]);
  });

  it("venue + floor plan but no hours → status 'setup', nextStep 'operating-hours'", () => {
    const result = computeReadiness(BASE_VENUE, [FLOOR_PLAN_WITH_TABLES]);

    expect(result.status).toBe("setup");
    // onboarding and floor-plan are complete, but operating-hours is missing
    expect(result.completedSteps).toContain("onboarding");
    expect(result.completedSteps).toContain("floor-plan");
    expect(result.completedSteps).not.toContain("operating-hours");
    // next step is the first missing step in order
    expect(result.nextStep).toBe("operating-hours");
  });

  it("operating hours with all days closed → does not satisfy hours gate", () => {
    const venueAllClosed: Venue = {
      ...BASE_VENUE,
      operatingHours: {
        monday: { open: "09:00", close: "22:00", closed: true },
        tuesday: { open: "09:00", close: "22:00", closed: true },
      },
    };

    const result = computeReadiness(venueAllClosed, []);

    expect(result.completedSteps).toEqual(["onboarding"]);
    expect(result.nextStep).toBe("operating-hours");
  });

  it("operating hours with one open day → satisfies hours gate", () => {
    const venueMixed: Venue = {
      ...BASE_VENUE,
      operatingHours: {
        monday: { open: "09:00", close: "22:00", closed: true },
        tuesday: { open: "09:00", close: "22:00" }, // not closed
      },
    };

    const result = computeReadiness(venueMixed, []);

    expect(result.completedSteps).toContain("operating-hours");
  });

  it("progress reflects fraction of completed steps", () => {
    const oneOfThree = computeReadiness(BASE_VENUE, []);
    expect(oneOfThree.progress).toBeCloseTo((1 / 3) * 100);

    const twoOfThree = computeReadiness(VENUE_WITH_HOURS, []);
    expect(twoOfThree.progress).toBeCloseTo((2 / 3) * 100);
  });
});

/* ── useVenueReadiness hook tests ──────────────────────────── */

describe("useVenueReadiness", () => {
  const mockList = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createApiClient).mockReturnValue({
      floorPlans: { list: mockList },
    } as any);
  });

  it("returns no-venue state when loading", () => {
    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: null,
      selectedVenueId: null,
      isLoading: true,
      venues: [],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useAuth).mockReturnValue({ accessToken: "tok" } as any);

    const { result } = renderHook(() => useVenueReadiness());

    expect(result.current.status).toBe("no-venue");
    expect(result.current.progress).toBe(0);
    expect(result.current.nextStep).toBeNull();
  });

  it("fetches floor plans on mount when venue and token are available", async () => {
    mockList.mockResolvedValue({ data: [FLOOR_PLAN_WITH_TABLES] });

    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: VENUE_WITH_HOURS,
      selectedVenueId: "venue-1",
      isLoading: false,
      venues: [VENUE_WITH_HOURS],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useAuth).mockReturnValue({ accessToken: "tok-123" } as any);

    const { result } = renderHook(() => useVenueReadiness());

    await waitFor(() => {
      expect(result.current.status).toBe("operational");
    });

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", limit: 10 })
    );
  });

  it("handles fetch error gracefully by treating floor plans as empty", async () => {
    mockList.mockRejectedValue(new Error("Network error"));

    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: VENUE_WITH_HOURS,
      selectedVenueId: "venue-1",
      isLoading: false,
      venues: [VENUE_WITH_HOURS],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useAuth).mockReturnValue({ accessToken: "tok-456" } as any);

    const { result } = renderHook(() => useVenueReadiness());

    await waitFor(() => {
      // Floor plan gate not met due to error, but onboarding + hours pass
      expect(result.current.status).toBe("setup");
    });

    expect(result.current.completedSteps).toContain("onboarding");
    expect(result.current.completedSteps).toContain("operating-hours");
    expect(result.current.completedSteps).not.toContain("floor-plan");
    expect(result.current.nextStep).toBe("floor-plan");
  });

  it("skips duplicate fetches for same venueId", async () => {
    mockList.mockResolvedValue({ data: [] });

    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: BASE_VENUE,
      selectedVenueId: "venue-1",
      isLoading: false,
      venues: [BASE_VENUE],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useAuth).mockReturnValue({ accessToken: "tok-789" } as any);

    const { result, rerender } = renderHook(() => useVenueReadiness());

    await waitFor(() => {
      expect(result.current.status).toBe("setup");
    });

    // Re-render with same venue — should not trigger another fetch
    rerender();
    rerender();

    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when accessToken is missing", () => {
    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: BASE_VENUE,
      selectedVenueId: "venue-1",
      isLoading: false,
      venues: [BASE_VENUE],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useAuth).mockReturnValue({ accessToken: null } as any);

    renderHook(() => useVenueReadiness());

    expect(mockList).not.toHaveBeenCalled();
  });
});
