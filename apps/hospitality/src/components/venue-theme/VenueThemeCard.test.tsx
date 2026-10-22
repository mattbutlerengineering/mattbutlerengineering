import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Venue } from "@mbe/types";
import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { VenueThemeCard } from "./VenueThemeCard.js";

const update = vi.fn();
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ venues: { update } }),
}));

const AXE = { rules: { "color-contrast": { enabled: false } } };

const venue: Venue = {
  id: "v1",
  venueGroupId: null,
  name: "V",
  slug: "v",
  ianaTimezone: "UTC",
  currencyCode: "USD",
  operatingHours: null,
  settings: { maxPartySize: 8 },
  createdAt: "",
  updatedAt: "",
};
const ctx: VenueContextValue = {
  venues: [venue],
  selectedVenueId: "v1",
  selectedVenue: venue,
  setVenueId: () => {},
  isLoading: false,
  venuesError: null,
  isMultiVenue: false,
  refetchVenues: async () => {},
};

function setup() {
  return render(
    <main>
      <QueryClientProvider client={new QueryClient()}>
        <VenueContext.Provider value={ctx}>
          <VenueThemeCard />
        </VenueContext.Provider>
      </QueryClientProvider>
    </main>
  );
}

const accent = () => screen.getByLabelText("Accent colour");
const hover = () => screen.getByLabelText("Accent hover colour");

beforeEach(() => update.mockReset().mockResolvedValue(venue));

describe("VenueThemeCard", () => {
  it("has no axe violations", async () => {
    const { container } = setup();
    expect((await axe(container, AXE)).violations).toEqual([]);
  });

  it("saves a readable manual palette alongside existing settings", async () => {
    setup();
    fireEvent.change(accent(), { target: { value: "#7a1f3d" } });
    fireEvent.change(hover(), { target: { value: "#8c2a4a" } });
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith("v1", {
      settings: {
        maxPartySize: 8,
        theme: { accent: "#7a1f3d", accentHover: "#8c2a4a", source: "manual" },
      },
    });
  });

  it("updates the preview as colours are typed", () => {
    setup();
    fireEvent.change(accent(), { target: { value: "#7a1f3d" } });
    fireEvent.change(hover(), { target: { value: "#8c2a4a" } });
    expect(screen.getByTestId("theme-preview").style.getPropertyValue("--rialto-accent")).toBe(
      "#7a1f3d"
    );
  });

  it("blocks saving an unreadable palette and says why", () => {
    setup();
    fireEvent.change(accent(), { target: { value: "#808080" } });
    fireEvent.change(hover(), { target: { value: "#888888" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/contrast/i);
    expect(screen.getByRole("button", { name: "Save theme" })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks saving malformed hex", () => {
    setup();
    fireEvent.change(accent(), { target: { value: "purple" } });
    expect(screen.getByRole("button", { name: "Save theme" })).toBeDisabled();
  });
});
