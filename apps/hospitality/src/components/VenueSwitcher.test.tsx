import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VenueSwitcher } from "./VenueSwitcher.js";
import type { Venue } from "@mbe/types";

/* ── Mock VenueContext ──────────────────────────────────────── */

const mockSetVenueId = vi.fn();

let mockContextValue = {
  venues: [] as readonly Venue[],
  selectedVenueId: null as string | null,
  selectedVenue: null as Venue | null,
  setVenueId: mockSetVenueId,
  isLoading: false,
  isMultiVenue: false,
};

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => mockContextValue,
}));

/* ── Mock CSS modules ───────────────────────────────────────── */

vi.mock("./VenueSwitcher.module.css", () => ({
  default: {
    root: "root",
    trigger: "trigger",
    triggerInteractive: "triggerInteractive",
    chevron: "chevron",
    chevronOpen: "chevronOpen",
    venueName: "venueName",
    dropdown: "dropdown",
    option: "option",
    optionSelected: "optionSelected",
    checkmark: "checkmark",
    divider: "divider",
    addVenue: "addVenue",
  },
}));

/* ── Fixtures ───────────────────────────────────────────────── */

const VENUE_A: Venue = {
  id: "venue-a",
  venueGroupId: null,
  name: "Venue Alpha",
  slug: "venue-alpha",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const VENUE_B: Venue = {
  id: "venue-b",
  venueGroupId: null,
  name: "Venue Beta",
  slug: "venue-beta",
  ianaTimezone: "America/Chicago",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

/* ── Tests ──────────────────────────────────────────────────── */

describe("VenueSwitcher", () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("single venue", () => {
    beforeEach(() => {
      mockContextValue = {
        venues: [VENUE_A],
        selectedVenueId: VENUE_A.id,
        selectedVenue: VENUE_A,
        setVenueId: mockSetVenueId,
        isLoading: false,
        isMultiVenue: false,
      };
    });

    it("shows the venue name", () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      expect(screen.getByText("Venue Alpha")).toBeDefined();
    });

    it("does not render a dropdown chevron (not interactive)", () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      // The chevron SVG is only rendered when isMultiVenue is true
      const trigger = screen.getByRole("button", { name: /Venue Alpha/ });
      // aria-haspopup is not set for single venue
      expect(trigger.getAttribute("aria-haspopup")).toBeNull();
    });

    it("does not open a dropdown on click", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      const trigger = screen.getByRole("button", { name: /Venue Alpha/ });
      await userEvent.click(trigger);
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  describe("multi venue", () => {
    beforeEach(() => {
      mockContextValue = {
        venues: [VENUE_A, VENUE_B],
        selectedVenueId: VENUE_A.id,
        selectedVenue: VENUE_A,
        setVenueId: mockSetVenueId,
        isLoading: false,
        isMultiVenue: true,
      };
    });

    it("opens dropdown on trigger click", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      const trigger = screen.getByRole("button", { name: /Current venue/ });
      await userEvent.click(trigger);
      expect(screen.getByRole("listbox")).toBeDefined();
    });

    it("lists all venues in the dropdown", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      await userEvent.click(screen.getByRole("button", { name: /Current venue/ }));
      // Venue Alpha appears in both trigger and dropdown option
      expect(screen.getAllByText("Venue Alpha").length).toBeGreaterThan(0);
      expect(screen.getByText("Venue Beta")).toBeDefined();
    });

    it("calls setVenueId when selecting a venue", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      await userEvent.click(screen.getByRole("button", { name: /Current venue/ }));
      // Click Venue Beta option
      const options = screen.getAllByRole("option");
      const venueBOption = options.find((o) => o.textContent?.includes("Venue Beta"));
      expect(venueBOption).toBeDefined();
      await userEvent.click(venueBOption!);
      expect(mockSetVenueId).toHaveBeenCalledWith(VENUE_B.id);
    });

    it("closes dropdown after selecting a venue", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      await userEvent.click(screen.getByRole("button", { name: /Current venue/ }));
      const options = screen.getAllByRole("option");
      await userEvent.click(options[0]);
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("calls onNavigate with /onboarding when '+ Add Venue' is clicked", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      await userEvent.click(screen.getByRole("button", { name: /Current venue/ }));
      const addButton = screen.getByText("Add Venue");
      await userEvent.click(addButton);
      expect(onNavigate).toHaveBeenCalledWith("/onboarding");
    });

    it("closes dropdown after clicking '+ Add Venue'", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      await userEvent.click(screen.getByRole("button", { name: /Current venue/ }));
      await userEvent.click(screen.getByText("Add Venue"));
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("closes dropdown on Escape key", async () => {
      render(<VenueSwitcher onNavigate={onNavigate} />);
      await userEvent.click(screen.getByRole("button", { name: /Current venue/ }));
      expect(screen.getByRole("listbox")).toBeDefined();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  describe("no selected venue", () => {
    beforeEach(() => {
      mockContextValue = {
        venues: [],
        selectedVenueId: null,
        selectedVenue: null,
        setVenueId: mockSetVenueId,
        isLoading: false,
        isMultiVenue: false,
      };
    });

    it("renders nothing when there is no selected venue", () => {
      const { container } = render(<VenueSwitcher onNavigate={onNavigate} />);
      expect(container.firstChild).toBeNull();
    });
  });
});
