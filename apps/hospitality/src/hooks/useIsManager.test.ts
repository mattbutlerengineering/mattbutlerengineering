// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseVenue = vi.fn();
const mockUseVenueTeam = vi.fn();

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => mockUseVenue() }));
vi.mock("./useVenueTeam.js", () => ({
  useVenueTeam: (params: unknown) => mockUseVenueTeam(params),
}));

import { useIsManager, useManagerAccess } from "./useIsManager.js";

function teamRead(over: Record<string, unknown>) {
  return { data: undefined, isLoading: false, error: null, refetch: vi.fn(), ...over };
}

describe("useIsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseVenue.mockReturnValue({ selectedVenueId: "v1", isLoading: false });
  });

  it("is false while the team read loads", () => {
    mockUseVenueTeam.mockReturnValue(teamRead({ isLoading: true }));
    const { result } = renderHook(() => useIsManager());
    expect(result.current).toBe(false);
  });

  it("is false when the team read failed", () => {
    mockUseVenueTeam.mockReturnValue(teamRead({ error: new Error("boom") }));
    const { result } = renderHook(() => useIsManager());
    expect(result.current).toBe(false);
  });

  it("is false for a host", () => {
    mockUseVenueTeam.mockReturnValue(teamRead({ data: { viewerRole: "host" } }));
    const { result } = renderHook(() => useIsManager());
    expect(result.current).toBe(false);
  });

  it("is true for viewerRole manager", () => {
    mockUseVenueTeam.mockReturnValue(teamRead({ data: { viewerRole: "manager" } }));
    const { result } = renderHook(() => useIsManager());
    expect(result.current).toBe(true);
  });

  it("reads the team of the selected venue", () => {
    mockUseVenueTeam.mockReturnValue(teamRead({ data: { viewerRole: "manager" } }));
    renderHook(() => useIsManager());
    expect(mockUseVenueTeam).toHaveBeenCalledWith({ venueId: "v1" });
  });
});

describe("useManagerAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is pending while the venue list loads", () => {
    mockUseVenue.mockReturnValue({ selectedVenueId: null, isLoading: true });
    mockUseVenueTeam.mockReturnValue(teamRead({}));
    const { result } = renderHook(() => useManagerAccess());
    expect(result.current).toEqual({ isManager: false, isPending: true });
  });

  it("is pending while the team read loads", () => {
    mockUseVenue.mockReturnValue({ selectedVenueId: "v1", isLoading: false });
    mockUseVenueTeam.mockReturnValue(teamRead({ isLoading: true }));
    const { result } = renderHook(() => useManagerAccess());
    expect(result.current).toEqual({ isManager: false, isPending: true });
  });

  it("settles as non-manager when the read failed", () => {
    mockUseVenue.mockReturnValue({ selectedVenueId: "v1", isLoading: false });
    mockUseVenueTeam.mockReturnValue(teamRead({ error: new Error("boom") }));
    const { result } = renderHook(() => useManagerAccess());
    expect(result.current).toEqual({ isManager: false, isPending: false });
  });

  it("settles as manager", () => {
    mockUseVenue.mockReturnValue({ selectedVenueId: "v1", isLoading: false });
    mockUseVenueTeam.mockReturnValue(teamRead({ data: { viewerRole: "manager" } }));
    const { result } = renderHook(() => useManagerAccess());
    expect(result.current).toEqual({ isManager: true, isPending: false });
  });
});
