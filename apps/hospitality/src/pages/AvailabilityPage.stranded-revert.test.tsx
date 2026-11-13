import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";

/**
 * #8042: the page owns the dialog that lists a refused Undo's bookings, so it must be there on
 * every tab, not only the calendar's.
 */
const revert = vi.hoisted(() => vi.fn());
const config = {
  config: {
    schedules: [{ id: "s1", name: "Weeknight", kind: "regular", isRegular: true }],
    venueServices: [{ id: "vs1", name: "Dinner", position: 0 }],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
  version: 1,
  source: "rows",
};

vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({
    data: [{ id: "sec-bar", name: "Bar" }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityDays: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useAvailabilityConfig: () => ({ data: config, isLoading: false, error: null, refetch: vi.fn() }),
  useAvailabilityChanges: () => ({
    data: undefined,
    isLoading: true,
    error: null,
    refetch: vi.fn(),
  }),
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: revert }),
  AVAILABILITY_CONFIG_QUERY_KEY: "availabilityConfig",
  AVAILABILITY_DAYS_QUERY_KEY: "availabilityDays",
}));
vi.mock("../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSetHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig: vi.fn() } }),
}));
vi.mock("../hooks/useClosures.js", () => ({
  useClosureImpact: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({
    data: { viewerRole: "manager" },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: vi.fn() }),
}));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1",
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../contexts/venue-context-object.js", () => ({ useOptionalVenue: () => venue }));
// The tab's own save flow has its own suite: here it only offers Undo, as a saved schedule does.
vi.mock("../components/availability/SchedulesTab.js", async () => {
  const { useAvailabilityUndo } = await import("../hooks/useAvailabilityUndo.js");
  return {
    SchedulesTab: ({ venueId }: { venueId: string }) => {
      const offerUndo = useAvailabilityUndo();
      return (
        <button
          type="button"
          onClick={() =>
            offerUndo({ venueId, title: "Spare saved", saved: { version: 2, changeId: "chg-2" } })
          }
        >
          Save a schedule
        </button>
      );
    },
  };
});

import { AvailabilityPage } from "./AvailabilityPage.js";

/** The page opens Close and Pause through the layout's scope (C2.4); these tests open neither. */
const SCOPE = { openClose: vi.fn(), openPause: vi.fn() };
const underLayout = (
  <Routes>
    <Route element={<Outlet context={SCOPE} />}>
      <Route path="*" element={<AvailabilityPage />} />
    </Route>
  </Routes>
);

const refusal = () =>
  new ApiClientError(
    {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "x",
      code: "stranded-bookings",
      reservations: [
        {
          id: "res-okafor",
          startTime: "2026-10-31T01:30:00.000Z",
          partySize: 4,
          reason: "closed",
          guestName: "Okafor",
          serviceDate: "2026-10-30",
        },
      ],
    } as never,
    "POST",
    "/revert"
  );

describe("a refused Undo on the Availability page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revert.mockRejectedValue(refusal());
    venue.selectedVenueId = "venue-1";
  });

  it("lists the bookings after a save on the Schedules tab", async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <main>{underLayout}</main>
        </ToastProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("radio", { name: "Schedules" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save a schedule" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    const dialog = await screen.findByRole("dialog", {
      name: "These bookings would lose their service",
    });
    expect(within(dialog).getByRole("link", { name: /Okafor/ })).toBeInTheDocument();
  });
});
