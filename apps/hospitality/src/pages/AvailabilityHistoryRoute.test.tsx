import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityChangeEntry, AvailabilityConfigState } from "@mbe/types";
import { AvailabilityHistoryRoute } from "../components/availability/AvailabilityHistoryRoute.js";
import { TODAY, venue } from "../components/availability/hub/hub-rows-test-helpers.js";
import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityHubPage } from "./AvailabilityHubPage.js";

/**
 * History at its own address (availability-hub C2.6): a drawer over the hub, with the hub and the
 * drawer route mounted as `main.tsx` mounts them. Back closes it; View day lands on the calendar
 * with the date in the address.
 */

const mutateAsync = vi.hoisted(() => vi.fn());
const role = vi.hoisted(() => ({ isManager: true, pending: false }));

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1", selectedVenue: { id: "venue-1", settings: {} } }),
}));
vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityChanges: () => ({
    data: { total: 1, offset: 0, items: [ENTRY] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAvailabilityConfig: () => ({ data: { version: 7 } }),
  useRevertAvailabilityChange: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
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

const ENTRY: AvailabilityChangeEntry = {
  id: "chg-1",
  actorId: "auth0|me",
  at: "2026-11-10T18:00:00.000Z",
  kind: "config",
  summary: "Availability updated: 1 added, 0 changed, 0 removed",
  affectedFrom: "2026-11-20",
  affectedTo: "2026-11-20",
  notifiedGuests: false,
  revertedById: null,
  revertible: true,
};

const scope = (): AvailabilityScope => ({
  venueId: "venue-1",
  timezone: "America/Los_Angeles",
  today: TODAY,
  state: { config: venue(), version: 7, source: "rows" } as AvailabilityConfigState,
  load: "ready",
  loadError: null,
  // While the role is read the scope says `isManager: false` too (useAvailabilityScope).
  isManager: role.isManager && !role.pending,
  rolePending: role.pending,
  refresh: vi.fn(),
  offerUndo: vi.fn(),
});

/** `/setup`, then `url`: the hub, the History route and the calendar as siblings, as in `main.tsx`. */
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { path: "setup", element: <div>Setup Hub</div> },
      {
        path: "availability",
        element: <Outlet context={scope()} />,
        children: [
          { index: true, element: <AvailabilityHubPage /> },
          {
            path: "history",
            element: (
              <AvailabilityHubPage>
                <AvailabilityHistoryRoute />
              </AvailabilityHubPage>
            ),
          },
          { path: "calendar", element: <div>Calendar page</div> },
        ],
      },
    ],
    { initialEntries: ["/setup", url], initialIndex: 1 }
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
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
const historyLink = () => screen.getByRole("link", { name: "History" });
const drawer = () => screen.getByRole("dialog", { name: "History" });
const back = async (router: ReturnType<typeof renderAt>) => {
  await act(() => router.navigate(-1));
};

describe("History at /availability/history", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ version: 8 });
    role.isManager = true;
    role.pending = false;
  });

  it("loaded by its address, opens the drawer over the hub with focus inside", async () => {
    renderAt("/availability/history");
    expect(drawer()).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Availability" })).toBeInTheDocument();
    await waitFor(() => expect(drawer()).toContainElement(document.activeElement as HTMLElement));
  });

  it("closing a drawer loaded by its address replaces it with the hub, focus on the History link", async () => {
    const router = renderAt("/availability/history?from=setup");
    fireEvent.click(within(drawer()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(address(router)).toBe("/availability?from=setup"));
    await waitFor(() => expect(historyLink()).toHaveFocus());
    // A replace: the entry before is the one before the drawer.
    await back(router);
    expect(address(router)).toBe("/setup");
  });

  it("opened from the hub's History link, Back closes it and focus returns to the link", async () => {
    const router = renderAt("/availability");
    await userEvent.setup().click(historyLink());
    await waitFor(() => expect(address(router)).toBe("/availability/history"));
    expect(drawer()).toBeInTheDocument();

    await back(router);
    expect(address(router)).toBe("/availability");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "History" })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(historyLink()).toHaveFocus());
  });

  it("Close, when opened from the hub, goes back to the hub's own entry", async () => {
    const router = renderAt("/availability");
    await userEvent.setup().click(historyLink());
    await waitFor(() => expect(drawer()).toBeInTheDocument());
    fireEvent.click(within(drawer()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(address(router)).toBe("/availability"));
    expect(router.state.historyAction).toBe("POP");
  });

  it("View day lands on the calendar with that date in the address", async () => {
    const router = renderAt("/availability/history");
    fireEvent.click(within(drawer()).getByRole("button", { name: "View day" }));
    await waitFor(() => expect(address(router)).toBe("/availability/calendar?date=2026-11-20"));
    expect(screen.getByText("Calendar page")).toBeInTheDocument();
    // The drawer's entry was replaced, so Back does not reopen it.
    await back(router);
    expect(address(router)).toBe("/setup");
  });

  it("offers a Manager Undo, which sends the same revert call", async () => {
    renderAt("/availability/history");
    fireEvent.click(within(drawer()).getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        venueId: "venue-1",
        changeId: "chg-1",
        expectedVersion: 7,
      })
    );
  });

  it("offers no Undo while the role is still being read", () => {
    role.pending = true;
    renderAt("/availability/history");
    expect(within(drawer()).getByRole("button", { name: "View day" })).toBeInTheDocument();
    expect(within(drawer()).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("shows a Host the list with View day and no Undo", () => {
    role.isManager = false;
    renderAt("/availability/history");
    expect(within(drawer()).getByRole("button", { name: "View day" })).toBeInTheDocument();
    expect(within(drawer()).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
