/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useParams: vi.fn(),
}));

// Hoisted mocks for api-client
const { mockGetBySlug } = vi.hoisted(() => ({
  mockGetBySlug: vi.fn(),
}));

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(() => ({
    venues: {
      getBySlug: mockGetBySlug,
    },
  })),
}));

// Mock BookingWidget — heavy component, not testing internals here
vi.mock("../components/booking-widget/index.js", () => ({
  BookingWidget: ({ venueId }: any) => <div data-testid="booking-widget" data-venue-id={venueId} />,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
}));

vi.mock("./PublicBookingPage.module.css", () => ({
  default: {
    page: "page",
    loadingCenter: "loadingCenter",
    errorCard: "errorCard",
    header: "header",
    widgetWrapper: "widgetWrapper",
    footer: "footer",
  },
}));

import { useParams } from "react-router-dom";
import { PublicBookingPage } from "./PublicBookingPage.js";

const mockUseParams = vi.mocked(useParams);

const mockVenue = {
  id: "venue-abc",
  name: "The Grand Table",
  slug: "the-grand-table",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  venueGroupId: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
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
      mockGetBySlug.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();
      expect(screen.getByText("Loading venue...")).toBeDefined();
    });
  });

  describe("error state", () => {
    it("shows venue not found when fetch fails", async () => {
      mockGetBySlug.mockRejectedValue(new Error("Not Found"));
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Venue Not Found")).toBeDefined();
      });
      expect(screen.getByText("Not Found")).toBeDefined();
    });

    it("shows error when no slug in params", async () => {
      mockUseParams.mockReturnValue({});
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Venue Not Found")).toBeDefined();
      });
    });
  });

  describe("success state", () => {
    it("shows venue name and BookingWidget after fetch", async () => {
      mockGetBySlug.mockResolvedValue(mockVenue);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("The Grand Table")).toBeDefined();
      });

      const widget = screen.getByTestId("booking-widget");
      expect(widget).toBeDefined();
      expect(widget.getAttribute("data-venue-id")).toBe("venue-abc");
    });

    it("calls getBySlug with the slug from params", async () => {
      mockGetBySlug.mockResolvedValue(mockVenue);
      renderPage();

      await waitFor(() => {
        expect(mockGetBySlug).toHaveBeenCalledWith("the-grand-table");
      });
    });

    it("shows footer text", async () => {
      mockGetBySlug.mockResolvedValue(mockVenue);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Powered by Matt Butler Engineering")).toBeDefined();
      });
    });
  });
});
