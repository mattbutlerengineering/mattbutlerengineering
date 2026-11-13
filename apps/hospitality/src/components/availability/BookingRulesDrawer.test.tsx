import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { VenueSettings } from "@mbe/types";
import type { VenueContextValue } from "../../contexts/venue-context-object.js";

const mutateAsync = vi.fn();
vi.mock("../../hooks/useVenues.js", () => ({
  VENUES_QUERY_KEY: "venues",
  useUpdateVenue: () => ({ mutateAsync, isPending: false }),
}));
const venueContext = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../../contexts/VenueContext.js", () => ({ useVenue: () => venueContext.value }));

import { BookingRulesDrawer } from "./BookingRulesDrawer.js";

function renderDrawer(settings: VenueSettings | null) {
  const venue = {
    id: "venue-1",
    venueGroupId: null,
    name: "The Oak Table",
    slug: "the-oak-table",
    ianaTimezone: "America/Los_Angeles",
    currencyCode: "USD",
    operatingHours: null,
    settings,
    createdAt: "",
    updatedAt: "",
  };
  venueContext.value = {
    venues: [venue],
    selectedVenueId: "venue-1",
    selectedVenue: venue,
    setVenueId: vi.fn(),
    isLoading: false,
    venuesError: null,
    isMultiVenue: false,
    refetchVenues: vi.fn(),
  } satisfies VenueContextValue;
  const onClose = vi.fn();
  const client = new QueryClient();
  client.setQueryData(["venues", { limit: 100 }], [venue]);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <main>
          <BookingRulesDrawer onClose={onClose} />
        </main>
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onClose };
}

const daysAhead = () => screen.getByLabelText(/How far ahead guests can book/);
const notice = () => screen.getByLabelText(/Minimum notice/);
const largest = () => screen.getByLabelText(/Largest party online/);
const save = () => screen.getByRole("button", { name: "Save" });

describe("BookingRulesDrawer", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "venue-1" });
  });

  it("shows the stored rules, and what applies to one that is not set", () => {
    renderDrawer({ maxAdvanceBooking: 60, maxPartySize: 10 });
    expect(daysAhead()).toHaveValue(60);
    expect(notice()).toHaveValue(null);
    expect(notice()).toHaveAttribute("placeholder", "None");
    expect(largest()).toHaveValue(10);
    expect(save()).toBeDisabled();
  });

  it("says its changes are not listed in History", () => {
    renderDrawer(null);
    expect(screen.getByText("Changes here are not listed in History.")).toBeInTheDocument();
  });

  it("saves the changed rules with every other setting kept, and clearing one unsets it", async () => {
    const { onClose } = renderDrawer({
      maxAdvanceBooking: 60,
      maxPartySize: 10,
      profile: { website: "https://oak.example.com" },
    });
    fireEvent.change(daysAhead(), { target: { value: "" } });
    fireEvent.change(notice(), { target: { value: "2" } });
    fireEvent.click(save());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      venueId: "venue-1",
      data: {
        settings: {
          minAdvanceBooking: 2,
          maxPartySize: 10,
          profile: { website: "https://oak.example.com" },
        },
      },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText("Booking rules saved")).toBeInTheDocument();
    // Undo puts back the three values this save replaced: 60 days, no notice, parties up to 10.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1]?.[0].data.settings).toEqual({
      maxAdvanceBooking: 60,
      maxPartySize: 10,
      profile: { website: "https://oak.example.com" },
    });
  });

  it("says what is wrong with a value that cannot be saved, and keeps Save off", () => {
    renderDrawer(null);
    fireEvent.change(largest(), { target: { value: "0" } });
    expect(screen.getByText("Use a whole number from 1 to 100.")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("keeps the drawer open with the reason when the save fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Network down"));
    const { onClose } = renderDrawer(null);
    fireEvent.change(daysAhead(), { target: { value: "14" } });
    fireEvent.click(save());
    expect(await screen.findByText("Couldn't save booking rules")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
