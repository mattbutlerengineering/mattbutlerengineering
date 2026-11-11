import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { Venue, VenueSettings } from "@mbe/types";

const mutateAsync = vi.fn();
const teamState = vi.hoisted(() => ({ value: null as unknown }));
const venueContext = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../hooks/useVenues.js", () => ({ useUpdateVenue: () => ({ mutateAsync }) }));
vi.mock("../../hooks/useVenueTeam.js", () => ({ useVenueTeam: () => teamState.value }));
vi.mock("../../contexts/VenueContext.js", () => ({ useVenue: () => venueContext.value }));

import { TonightNoteCard } from "./TonightNoteCard.js";

function setVenue(settings: VenueSettings | null): void {
  const venue = { id: "venue-1", settings } as unknown as Venue;
  venueContext.value = { selectedVenueId: "venue-1", selectedVenue: venue };
}

function setTeam(isOwner: boolean): void {
  teamState.value = {
    data: { members: [{ userSub: "me", role: "manager", isViewer: true, isOwner }] },
    isLoading: false,
  };
}

describe("TonightNoteCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ id: "venue-1" });
    setVenue({ maxPartySize: 12, tonightNote: "Park on Elm St" });
    setTeam(true);
  });

  it("renders nothing for a viewer who is not an owner", () => {
    setTeam(false);
    const { container } = render(<TonightNoteCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("seeds the field from the stored note", () => {
    render(<TonightNoteCard />);
    expect(screen.getByLabelText("Tonight note")).toHaveValue("Park on Elm St");
  });

  it("saves the note and keeps other settings", async () => {
    render(<TonightNoteCard />);
    fireEvent.change(screen.getByLabelText("Tonight note"), {
      target: { value: "Walk-ins at the bar" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        venueId: "venue-1",
        data: { settings: { maxPartySize: 12, tonightNote: "Walk-ins at the bar" } },
      })
    );
    expect(await screen.findByText("Tonight note saved.")).toBeInTheDocument();
  });

  it("clearing the field drops the key", async () => {
    render(<TonightNoteCard />);
    fireEvent.change(screen.getByLabelText("Tonight note"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        venueId: "venue-1",
        data: { settings: { maxPartySize: 12 } },
      })
    );
  });

  it("shows the server error when saving fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("boom"));
    render(<TonightNoteCard />);
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
