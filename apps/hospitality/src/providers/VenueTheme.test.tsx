import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Venue } from "@mbe/types";
import { VenueContext, type VenueContextValue } from "../contexts/venue-context-object.js";
import { VenueThemeProvider } from "./VenueTheme.js";

function venueWith(settings: Venue["settings"]): VenueContextValue {
  const v: Venue = {
    id: "v1",
    venueGroupId: null,
    name: "V",
    slug: "v",
    ianaTimezone: "UTC",
    currencyCode: "USD",
    operatingHours: null,
    settings,
    createdAt: "",
    updatedAt: "",
  };
  return {
    venues: [v],
    selectedVenueId: "v1",
    selectedVenue: v,
    setVenueId: () => {},
    isLoading: false,
    venuesError: null,
    isMultiVenue: false,
    refetchVenues: async () => {},
  };
}

function setup(settings: Venue["settings"]) {
  render(
    <VenueContext.Provider value={venueWith(settings)}>
      <VenueThemeProvider>
        <p>child</p>
      </VenueThemeProvider>
    </VenueContext.Provider>
  );
  return screen.getByText("child").parentElement as HTMLElement;
}

describe("VenueThemeProvider", () => {
  it("overrides rialto colour properties for a valid theme", () => {
    const wrapper = setup({
      theme: { accent: "#7a1f3d", accentHover: "#8c2a4a", source: "manual" },
    });
    expect(wrapper.style.getPropertyValue("--rialto-accent")).toBe("#7a1f3d");
    expect(wrapper.style.getPropertyValue("--rialto-accent-hover")).toBe("#8c2a4a");
  });

  it("applies nothing when the theme is absent", () => {
    expect(setup({}).style.getPropertyValue("--rialto-accent")).toBe("");
  });

  it("applies nothing — not a half theme — when the theme is unparseable or unreadable", () => {
    const bad = setup({ theme: { accent: "nope" } } as unknown as Venue["settings"]);
    expect(bad.style.getPropertyValue("--rialto-accent")).toBe("");
  });
});
