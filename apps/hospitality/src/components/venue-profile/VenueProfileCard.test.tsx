import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { Venue, VenueSettings } from "@mbe/types";
import type { VenueContextValue } from "../../contexts/venue-context-object.js";

const mutateAsync = vi.fn();

vi.mock("../../hooks/useVenues.js", () => ({
  useUpdateVenue: () => ({ mutateAsync }),
}));

const venueContext = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => venueContext.value,
}));

import { VenueProfileCard } from "./VenueProfileCard.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const PROFILE = {
  type: "fine_dining" as const,
  cuisines: ["Italian", "Seafood"],
  address: {
    line1: "1 Market St",
    line2: "Suite 400",
    city: "Seattle",
    region: "WA",
    postalCode: "98101",
    country: "US",
  },
  website: "https://theoaktable.example.com",
  description: "A small room with a long bar.",
};

function makeVenue(settings: VenueSettings | null): Venue {
  return {
    id: "venue-1",
    venueGroupId: null,
    name: "The Oak Table",
    slug: "the-oak-table",
    ianaTimezone: "America/Los_Angeles",
    currencyCode: "USD",
    operatingHours: null,
    settings,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function setVenue(settings: VenueSettings | null, venueId: string | null = "venue-1"): void {
  const venue = venueId ? makeVenue(settings) : null;
  venueContext.value = {
    venues: venue ? [venue] : [],
    selectedVenueId: venueId,
    selectedVenue: venue,
    setVenueId: vi.fn(),
    isLoading: false,
    venuesError: null,
    isMultiVenue: false,
    refetchVenues: vi.fn(),
  } satisfies VenueContextValue;
}

function renderCard() {
  return render(
    <main>
      <VenueProfileCard />
    </main>
  );
}

describe("VenueProfileCard", () => {
  // rialto's Select scrolls the focused option into view; jsdom has no such method.
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue(makeVenue({}));
    setVenue({ maxPartySize: 12, profile: PROFILE });
  });

  it("seeds every field from the venue's stored profile", () => {
    renderCard();

    expect(screen.getByLabelText("Cuisines")).toHaveValue("Italian, Seafood");
    expect(screen.getByLabelText("Street address")).toHaveValue("1 Market St");
    expect(screen.getByLabelText("Suite, unit, floor")).toHaveValue("Suite 400");
    expect(screen.getByLabelText("City")).toHaveValue("Seattle");
    expect(screen.getByLabelText("State or province")).toHaveValue("WA");
    expect(screen.getByLabelText("Postal code")).toHaveValue("98101");
    expect(screen.getByLabelText("Country")).toHaveValue("US");
    expect(screen.getByLabelText("Website")).toHaveValue("https://theoaktable.example.com");
    expect(screen.getByLabelText("Description")).toHaveValue("A small room with a long bar.");
    expect(screen.getByRole("combobox", { name: /Venue type/ })).toHaveTextContent("Fine dining");
  });

  it("renders empty fields for a venue with no profile", () => {
    setVenue({ maxPartySize: 12 });
    renderCard();

    expect(screen.getByLabelText("Cuisines")).toHaveValue("");
    expect(screen.getByLabelText("Website")).toHaveValue("");
  });

  it("tells the operator to choose a venue when none is selected", () => {
    setVenue(null, null);
    renderCard();

    expect(screen.getByText("Choose a venue to edit its profile.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Website")).toBeNull();
  });

  it("saves the profile through the venue-settings mutation, preserving other settings", async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "https://new.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        venueId: "venue-1",
        data: {
          settings: {
            maxPartySize: 12,
            profile: { ...PROFILE, website: "https://new.example.com" },
          },
        },
      });
    });
    expect(await screen.findByText("Venue profile saved")).toBeInTheDocument();
  });

  it("drops the profile key entirely when the operator clears every field", async () => {
    setVenue({ maxPartySize: 12, profile: { type: "bar" } });
    renderCard();

    fireEvent.click(screen.getByRole("combobox", { name: /Venue type/ }));
    fireEvent.click(screen.getByRole("option", { name: "Not set" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        venueId: "venue-1",
        data: { settings: { maxPartySize: 12 } },
      });
    });
  });

  it("rejects a non-URL website locally and never calls the mutation", async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Check the highlighted fields and try again.")).toBeDefined();
    expect(screen.getByLabelText("Website")).toHaveAttribute("aria-invalid", "true");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("reports a partially-filled address on the missing fields", async () => {
    setVenue({});
    renderCard();

    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "1 Market St" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(screen.getByLabelText("City")).toHaveAttribute("aria-invalid", "true");
    });
    expect(screen.getByLabelText("Street address")).not.toHaveAttribute("aria-invalid", "true");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces a save failure without claiming success", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Network error"));
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.queryByText("Venue profile saved")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = renderCard();

    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it("has no axe violations while showing field errors", async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Check the highlighted fields and try again.");

    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});
