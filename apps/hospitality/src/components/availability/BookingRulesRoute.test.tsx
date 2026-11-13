import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { VenueSettings } from "@mbe/types";
import type { AvailabilityScope } from "../../hooks/useAvailabilityScope.js";

const mutateAsync = vi.fn();
vi.mock("../../hooks/useVenues.js", () => ({
  VENUES_QUERY_KEY: "venues",
  useUpdateVenue: () => ({ mutateAsync, isPending: false }),
}));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1" as string | null,
  selectedVenue: { id: "venue-1", settings: {} } as { id: string; settings: unknown } | null,
}));
vi.mock("../../contexts/VenueContext.js", () => ({ useVenue: () => venue }));

import { BookingRulesRoute } from "./BookingRulesRoute.js";

const scopeOf = (rest: Partial<AvailabilityScope> = {}): AvailabilityScope => ({
  venueId: "venue-1",
  timezone: "America/Los_Angeles",
  today: "2026-11-12",
  state: null,
  load: "ready",
  loadError: null,
  isManager: true,
  rolePending: false,
  refresh: vi.fn(),
  offerUndo: vi.fn(),
  ...rest,
});

function renderRoute(scope: AvailabilityScope, url = "/availability/booking-rules") {
  const client = new QueryClient();
  client.setQueryData(["venues", { limit: 100 }], [venue.selectedVenue]);
  const router = createMemoryRouter(
    [
      { path: "timeline", element: <div>Timeline</div> },
      {
        path: "availability",
        element: (
          <main>
            <h1 tabIndex={-1}>Availability</h1>
            <Outlet context={scope} />
          </main>
        ),
        children: [
          { index: true, element: null },
          { path: "booking-rules", element: <BookingRulesRoute /> },
        ],
      },
    ],
    { initialEntries: ["/timeline", url], initialIndex: 1 }
  );
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return router;
}

const address = (router: ReturnType<typeof renderRoute>) =>
  `${router.state.location.pathname}${router.state.location.search}`;
const drawer = () => screen.getByRole("dialog", { name: "Booking rules" });
const daysAhead = () => screen.getByLabelText(/How far ahead guests can book/);
const prompt = () => screen.queryByRole("alertdialog", { name: "Discard your changes?" });

describe("BookingRulesRoute", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "venue-1" });
    venue.selectedVenueId = "venue-1";
    venue.selectedVenue = {
      id: "venue-1",
      settings: { maxAdvanceBooking: 30 } satisfies VenueSettings,
    };
  });

  it("opens the three fields for a Manager who loads the address, with focus inside", async () => {
    renderRoute(scopeOf());
    expect(daysAhead()).toHaveValue(30);
    expect(within(drawer()).getByText("Changes here are not listed in History.")).toBeVisible();
    await waitFor(() => expect(drawer()).toContainElement(document.activeElement as HTMLElement));
  });

  it("sends a Host to the hub with a replace, and opens nothing", async () => {
    const router = renderRoute(scopeOf({ isManager: false }));
    await waitFor(() => expect(address(router)).toBe("/availability"));
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits for the role: no drawer and no redirect while it is pending", () => {
    const router = renderRoute(scopeOf({ isManager: false, rolePending: true }));
    expect(address(router)).toBe("/availability/booking-rules");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens once the venue's settings are loaded", () => {
    venue.selectedVenue = null;
    renderRoute(scopeOf());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes to the hub without asking when nothing changed, and keeps the way back to Venue Setup", async () => {
    const router = renderRoute(scopeOf(), "/availability/booking-rules?from=setup");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(address(router)).toBe("/availability?from=setup"));
    expect(prompt()).not.toBeInTheDocument();
  });

  it("asks before leaving with an unsaved change, and stays on Keep editing", async () => {
    const router = renderRoute(scopeOf());
    fireEvent.change(daysAhead(), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(prompt()).toBeInTheDocument());
    expect(address(router)).toBe("/availability/booking-rules");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(prompt()).not.toBeInTheDocument());
    expect(address(router)).toBe("/availability/booking-rules");
    expect(daysAhead()).toHaveValue(60);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("offers no Save in the prompt while a value cannot be saved, so it never closes without saving", async () => {
    const router = renderRoute(scopeOf());
    fireEvent.change(screen.getByLabelText(/Largest party online/), { target: { value: "0" } });
    act(() => void router.navigate("/timeline"));
    await waitFor(() => expect(prompt()).toBeInTheDocument());
    const asked = within(prompt() as HTMLElement);
    expect(asked.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
    expect(asked.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(asked.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    fireEvent.click(asked.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(prompt()).not.toBeInTheDocument());
    expect(address(router)).toBe("/availability/booking-rules");
    expect(screen.getByText("Use a whole number from 1 to 100.")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("asks on a move to another page too, and Discard goes there with nothing saved", async () => {
    const router = renderRoute(scopeOf());
    fireEvent.change(daysAhead(), { target: { value: "60" } });
    act(() => void router.navigate("/timeline"));
    await waitFor(() => expect(prompt()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(address(router)).toBe("/timeline"));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("saves from the prompt and then goes where the Manager was going", async () => {
    const router = renderRoute(scopeOf());
    fireEvent.change(daysAhead(), { target: { value: "60" } });
    act(() => void router.navigate("/timeline"));
    await waitFor(() => expect(prompt()).toBeInTheDocument());
    fireEvent.click(within(prompt() as HTMLElement).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(address(router)).toBe("/timeline"));
    expect(mutateAsync).toHaveBeenCalledWith({
      venueId: "venue-1",
      data: { settings: { maxAdvanceBooking: 60 } },
    });
    expect(await screen.findByText("Booking rules saved")).toBeInTheDocument();
  });

  it("saves, returns to the hub without asking, and offers Undo", async () => {
    const router = renderRoute(scopeOf());
    fireEvent.change(daysAhead(), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(address(router)).toBe("/availability"));
    expect(router.state.historyAction).toBe("REPLACE");
    expect(prompt()).not.toBeInTheDocument();
    expect(await screen.findByText("Booking rules saved")).toBeInTheDocument();
    // Undo outlives the drawer: it puts back the 30 days the save replaced.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1]?.[0]).toEqual({
      venueId: "venue-1",
      data: { settings: { maxAdvanceBooking: 30 } },
    });
  });

  it("stays open with the reason when the save fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Network down"));
    const router = renderRoute(scopeOf());
    fireEvent.change(daysAhead(), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Couldn't save booking rules")).toBeInTheDocument();
    expect(address(router)).toBe("/availability/booking-rules");
  });
});
