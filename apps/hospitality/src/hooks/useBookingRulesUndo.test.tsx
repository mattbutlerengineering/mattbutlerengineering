import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { VenueSettings } from "@mbe/types";
import type { BookingRulesForm } from "../components/availability/booking-rules.js";

const mutateAsync = vi.fn();
vi.mock("./useVenues.js", () => ({
  VENUES_QUERY_KEY: "venues",
  useUpdateVenue: () => ({ mutateAsync, isPending: false }),
}));

import { useBookingRulesUndo } from "./useBookingRulesUndo.js";

const PREVIOUS: BookingRulesForm = { daysAhead: "30", noticeHours: "", largestParty: "12" };

/** The venue list as `VenueProvider` caches it. */
const cacheVenue = (client: QueryClient, settings: VenueSettings | null, id = "venue-1") =>
  client.setQueryData(["venues", { limit: 100 }], [{ id, settings }]);

function Offer({ previous }: { readonly previous: BookingRulesForm }) {
  const offerUndo = useBookingRulesUndo();
  return (
    <button type="button" onClick={() => offerUndo({ venueId: "venue-1", previous })}>
      offer
    </button>
  );
}

function renderOffer(settings: VenueSettings | null) {
  const client = new QueryClient();
  cacheVenue(client, settings);
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <main>
          <Offer previous={PREVIOUS} />
        </main>
      </ToastProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "offer" }));
  return { client, ...view };
}

const undo = () => screen.findByRole("button", { name: "Undo" });

describe("useBookingRulesUndo", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "venue-1" });
  });

  it("says the rules were saved and offers Undo", async () => {
    renderOffer({ maxAdvanceBooking: 60 });
    expect(await screen.findByText("Booking rules saved")).toBeInTheDocument();
    expect(await undo()).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("re-saves the previous three values onto the settings current at that moment, and keeps every other key", async () => {
    const { client } = renderOffer({ maxAdvanceBooking: 60, maxPartySize: 12 });
    // Since the save: someone else set all three rules and changed the profile and the phone.
    cacheVenue(client, {
      maxAdvanceBooking: 90,
      minAdvanceBooking: 4,
      maxPartySize: 6,
      profile: { website: "https://oak.example.com" },
      phone: "555-0100",
    });
    fireEvent.click(await undo());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      venueId: "venue-1",
      data: {
        settings: {
          // The three rules as they were: 30 days, no notice, parties up to 12.
          maxAdvanceBooking: 30,
          maxPartySize: 12,
          // Every other key as it is now, not as it was at the save.
          profile: { website: "https://oak.example.com" },
          phone: "555-0100",
        },
      },
    });
    expect(await screen.findByText("Change undone")).toBeInTheDocument();
  });

  it("still undoes after the component that offered it has gone", async () => {
    const client = new QueryClient();
    cacheVenue(client, { maxPartySize: 4 });
    function Host({ editing }: { readonly editing: boolean }) {
      return (
        <QueryClientProvider client={client}>
          <ToastProvider>
            <main>{editing && <Offer previous={PREVIOUS} />}</main>
          </ToastProvider>
        </QueryClientProvider>
      );
    }
    const { rerender } = render(<Host editing />);
    fireEvent.click(screen.getByRole("button", { name: "offer" }));
    rerender(<Host editing={false} />);
    expect(screen.queryByRole("button", { name: "offer" })).not.toBeInTheDocument();
    fireEvent.click(await undo());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]?.[0].data.settings).toEqual({
      maxAdvanceBooking: 30,
      maxPartySize: 12,
    });
  });

  it("sends one re-save for a double press", async () => {
    renderOffer({ maxAdvanceBooking: 60 });
    const button = await undo();
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText("Change undone");
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("says when the re-save failed, with the reason, and Retry sends it again", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Network down"));
    renderOffer({ maxAdvanceBooking: 60 });
    fireEvent.click(await undo());
    expect(await screen.findByText("Couldn't undo booking rules")).toBeInTheDocument();
    expect(screen.queryByText("Change undone")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Change undone")).toBeInTheDocument();
  });

  it("writes nothing when the venue's settings cannot be read, and says the undo failed", async () => {
    const { client } = renderOffer({ maxAdvanceBooking: 60 });
    // Writing the three values onto nothing would erase every other setting.
    client.removeQueries({ queryKey: ["venues"] });
    fireEvent.click(await undo());
    expect(await screen.findByText("Couldn't undo booking rules")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
