import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Venue } from "@mbe/types";

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useParams: vi.fn(),
}));

// Hoisted mock for the seam hook — the public booking page resolves the venue
// through the unauthenticated by-slug read (getBySlug -> /api/v1/venues/by-slug/:slug),
// the endpoint dedicated to public booking URLs.
const { mockGetBySlug } = vi.hoisted(() => ({
  mockGetBySlug: vi.fn(),
}));

vi.mock("../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: vi.fn(() => ({
    venues: {
      getBySlug: mockGetBySlug,
    },
  })),
}));

// Mock BookingWidget — heavy component, not testing internals here. Imports the
// real (pure, separately unit-tested) hasOperatingHours module so its wiring is
// genuinely exercised, without pulling in the rest of the heavy booking-widget
// barrel (Stripe, GuestDetailsForm, etc.). The async factory + import is the
// required Vitest pattern: vi.mock is hoisted above top-level imports, so a
// static import cannot be referenced here.
vi.mock("../components/booking-widget/index.js", async () => {
  const { hasOperatingHours } = await import(
    "../components/booking-widget/hasOperatingHours.js"
  );
  return {
    BookingWidget: ({
      venueId,
      hasOperatingHours: hasHours,
    }: {
      venueId: string;
      hasOperatingHours: boolean;
    }) => (
      <div
        data-testid="booking-widget"
        data-venue-id={venueId}
        data-has-operating-hours={String(hasHours)}
      />
    ),
    hasOperatingHours,
  };
});

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  EmptyState: ({
    heading,
    description,
    action,
  }: {
    heading?: string;
    description?: string;
    action?: ReactNode;
  }) => (
    <div data-testid="empty-state">
      {heading ? <p>{heading}</p> : null}
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  ),
}));

vi.mock("./PublicBookingPage.module.css", () => ({
  default: {
    page: "page",
    loadingCenter: "loadingCenter",
    errorCenter: "errorCenter",
    header: "header",
    widgetWrapper: "widgetWrapper",
    footer: "footer",
  },
}));

import { useParams } from "react-router-dom";
import { PublicBookingPage } from "./PublicBookingPage.js";

const mockUseParams = vi.mocked(useParams);

const mockVenue: Venue = {
  id: "venue-abc",
  venueGroupId: null,
  name: "The Grand Table",
  slug: "the-grand-table",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// Simulates the ApiClientError the transport throws on a 404 — its `.message`
// carries the internal endpoint path, which must NEVER reach the guest.
const LEAKY_404_MESSAGE = "GET /api/v1/venues/by-slug/the-grand-table failed: 404 Not Found";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <PublicBookingPage />
    </Wrapper>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ venueSlug: "the-grand-table" });
});

describe("PublicBookingPage", () => {
  describe("loading state", () => {
    it("shows loading text while fetching venue", () => {
      // Never-resolving promise keeps the query pending.
      const pending = new Promise<Venue>(() => {});
      mockGetBySlug.mockReturnValue(pending);
      renderPage();
      expect(screen.getByText("Loading venue...")).toBeDefined();
    });
  });

  describe("resolution", () => {
    it("resolves the venue via the typed getBySlug client with the slug from params", async () => {
      mockGetBySlug.mockResolvedValue(mockVenue);
      renderPage();

      await waitFor(() => {
        expect(mockGetBySlug).toHaveBeenCalledWith("the-grand-table");
      });
    });
  });

  describe("unknown / error slug", () => {
    it("shows a branded not-found message and never leaks the internal API path", async () => {
      mockGetBySlug.mockRejectedValue(new Error(LEAKY_404_MESSAGE));
      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText("Venue not found")).toBeDefined();
      });

      // The raw transport error — including any internal endpoint path — must
      // not appear anywhere in the rendered output. Fragments are matched
      // without a leading "/api/" so this assertion is not itself a hardcoded
      // route.
      const rendered = container.textContent ?? "";
      expect(rendered).not.toContain(LEAKY_404_MESSAGE);
      expect(rendered).not.toContain("v1/venues");
      expect(rendered).not.toContain("by-slug");
      expect(rendered).not.toContain("failed: 404");
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });

    it("shows the branded not-found when no slug is present in params", async () => {
      mockUseParams.mockReturnValue({});
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Venue not found")).toBeDefined();
      });
      expect(mockGetBySlug).not.toHaveBeenCalled();
    });
  });

  describe("valid slug", () => {
    it("renders the BookingWidget with the venue id from the resolved venue", async () => {
      mockGetBySlug.mockResolvedValue(mockVenue);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("The Grand Table")).toBeDefined();
      });

      const widget = screen.getByTestId("booking-widget");
      expect(widget).toBeDefined();
      expect(widget.getAttribute("data-venue-id")).toBe("venue-abc");
    });

    it("passes hasOperatingHours=false when the venue has no hours configured", async () => {
      mockGetBySlug.mockResolvedValue(mockVenue); // operatingHours: null
      renderPage();

      await waitFor(() => {
        const widget = screen.getByTestId("booking-widget");
        expect(widget.getAttribute("data-has-operating-hours")).toBe("false");
      });
    });

    it("passes hasOperatingHours=true when the venue has hours configured", async () => {
      mockGetBySlug.mockResolvedValue({
        ...mockVenue,
        operatingHours: { monday: { open: "09:00", close: "22:00" } },
      });
      renderPage();

      await waitFor(() => {
        const widget = screen.getByTestId("booking-widget");
        expect(widget.getAttribute("data-has-operating-hours")).toBe("true");
      });
    });

    it("shows the footer branding", async () => {
      mockGetBySlug.mockResolvedValue(mockVenue);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Powered by Matt Butler Engineering")).toBeDefined();
      });
    });
  });
});
