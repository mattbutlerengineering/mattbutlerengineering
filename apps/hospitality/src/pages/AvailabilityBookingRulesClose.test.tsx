import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { BookingRulesRoute } from "../components/availability/BookingRulesRoute.js";
import { TODAY, venue } from "../components/availability/hub/hub-rows-test-helpers.js";
import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityHubPage } from "./AvailabilityHubPage.js";

/**
 * Leaving the booking rules drawer (availability-hub C2.5 review): where focus lands and what
 * history is left, with the hub and the drawer route mounted as `main.tsx` mounts them.
 */

const selected = vi.hoisted(() => ({ id: "venue-1", settings: {} as Record<string, unknown> }));
const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1", selectedVenue: selected }),
}));
vi.mock("../hooks/useVenues.js", () => ({
  VENUES_QUERY_KEY: "venues",
  useUpdateVenue: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("../hooks/useNow.js", () => ({ useNow: () => new Date("2026-11-12T18:00:00Z") }));
vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({ data: [] }),
}));
vi.mock("../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({ data: [] }),
}));
vi.mock("../components/availability/use-holidays.js", () => ({
  useHolidayCountry: () => null,
}));
vi.mock("../components/availability/TodayLine.js", () => ({ TodayLine: () => null }));

const scope: AvailabilityScope = {
  venueId: "venue-1",
  timezone: "America/Los_Angeles",
  today: TODAY,
  state: { config: venue(), version: 1, source: "rows" } as AvailabilityConfigState,
  load: "ready",
  loadError: null,
  isManager: true,
  rolePending: false,
  refresh: vi.fn(),
  offerUndo: vi.fn(),
  openClose: vi.fn(),
  openPause: vi.fn(),
};

/** `/setup`, then `url`: the hub and the drawer route as siblings, as in `main.tsx`. */
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { path: "setup", element: <div>Setup Hub</div> },
      {
        path: "availability",
        element: <Outlet context={scope} />,
        children: [
          { index: true, element: <AvailabilityHubPage /> },
          {
            path: "booking-rules",
            element: (
              <AvailabilityHubPage>
                <BookingRulesRoute />
              </AvailabilityHubPage>
            ),
          },
        ],
      },
    ],
    { initialEntries: ["/setup", url], initialIndex: 1 }
  );
  const client = new QueryClient();
  client.setQueryData(["venues", { limit: 100 }], [selected]);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <main>
          <RouterProvider router={router} />
        </main>
      </ToastProvider>
    </QueryClientProvider>
  );
  return router;
}

const address = (router: ReturnType<typeof renderAt>) =>
  `${router.state.location.pathname}${router.state.location.search}`;
const editLink = () => screen.getByRole("link", { name: "Edit Booking rules" });
const drawer = () => screen.getByRole("dialog", { name: "Booking rules" });
const back = async (router: ReturnType<typeof renderAt>) => {
  await act(() => router.navigate(-1));
};

describe("leaving the booking rules drawer", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "venue-1" });
    selected.settings = {};
  });

  describe("loaded by its address", () => {
    it("Cancel returns to the hub with focus on row 5's Edit link, and leaves no drawer entry", async () => {
      const router = renderAt("/availability/booking-rules");
      fireEvent.click(within(drawer()).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(address(router)).toBe("/availability"));
      await waitFor(() => expect(editLink()).toHaveFocus());
      // A replace: the entry before is the one before the drawer.
      await back(router);
      expect(address(router)).toBe("/setup");
    });

    it("Save returns to the hub with focus on row 5's Edit link", async () => {
      const router = renderAt("/availability/booking-rules");
      fireEvent.change(screen.getByLabelText(/How far ahead guests can book/), {
        target: { value: "60" },
      });
      fireEvent.click(within(drawer()).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(address(router)).toBe("/availability"));
      expect(mutateAsync).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(editLink()).toHaveFocus());
    });

    it("keeps the way back to Venue Setup, with focus on row 5's Edit link", async () => {
      const router = renderAt("/availability/booking-rules?from=setup");
      fireEvent.click(within(drawer()).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(address(router)).toBe("/availability?from=setup"));
      expect(screen.getByRole("link", { name: "Venue Setup" })).toBeVisible();
      await waitFor(() => expect(editLink()).toHaveFocus());
      await back(router);
      expect(address(router)).toBe("/setup");
    });
  });

  describe("opened from the hub", () => {
    it("Cancel goes back to the hub's own entry, focus returns to the Edit link, and Back leaves Availability", async () => {
      const router = renderAt("/availability");
      await userEvent.setup().click(editLink());
      await waitFor(() => expect(address(router)).toBe("/availability/booking-rules"));
      expect(drawer()).toBeInTheDocument();

      fireEvent.click(within(drawer()).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(address(router)).toBe("/availability"));
      expect(router.state.historyAction).toBe("POP");
      await waitFor(() => expect(editLink()).toHaveFocus());
      // No second hub entry was left: one Back leaves Availability.
      await back(router);
      expect(address(router)).toBe("/setup");
    });

    it("carries the way back to Venue Setup the hub had", async () => {
      const router = renderAt("/availability?from=setup");
      await userEvent.setup().click(editLink());
      await waitFor(() => expect(drawer()).toBeInTheDocument());
      fireEvent.click(within(drawer()).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(address(router)).toBe("/availability?from=setup"));
      await waitFor(() => expect(editLink()).toHaveFocus());
    });
  });
});
