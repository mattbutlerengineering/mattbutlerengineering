import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockGetBySlug, mockListPublic, mockGetPublic } = vi.hoisted(() => ({
  mockGetBySlug: vi.fn(),
  mockListPublic: vi.fn(),
  mockGetPublic: vi.fn(),
}));

vi.mock("../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: vi.fn(() => ({
    venues: { getBySlug: mockGetBySlug },
    menus: { listPublic: mockListPublic, getPublic: mockGetPublic },
  })),
}));

import { PublicMenusPage } from "./PublicMenusPage.js";

const venue = { id: "v1", name: "The Grand Table", slug: "grand", currencyCode: "USD" };

function renderPage(path = "/menu/grand") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="menu/:venueSlug" element={<PublicMenusPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PublicMenusPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBySlug.mockResolvedValue(venue);
  });

  it("lists the venue's active menus as links to each menu", async () => {
    mockListPublic.mockResolvedValue([
      { id: "m1", name: "Dinner", slug: "dinner", description: "Evening plates", displayOrder: 0 },
      { id: "m2", name: "Brunch", slug: "brunch", description: null, displayOrder: 1 },
    ]);
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "The Grand Table" })).toBeTruthy();
    const dinner = screen.getByRole("link", { name: /Dinner/ });
    expect(dinner.getAttribute("href")).toBe("/menu/grand/dinner");
    expect(screen.getByText("Evening plates")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Brunch/ }).getAttribute("href")).toBe(
      "/menu/grand/brunch"
    );
    expect(mockListPublic).toHaveBeenCalledWith("grand");
  });

  it("shows an empty state when the venue has no active menus", async () => {
    mockListPublic.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No menus yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Dinner/ })).toBeNull();
  });

  it("shows a not-found state, not a crash, for an unknown venue", async () => {
    mockGetBySlug.mockRejectedValue(new Error("GET /api/v1/venues/by-slug/nope failed: 404"));
    mockListPublic.mockRejectedValue(new Error("404"));
    renderPage("/menu/grand");
    await waitFor(() => expect(screen.getByText("Menu not found")).toBeTruthy());
    expect(screen.queryByText(/by-slug/)).toBeNull();
  });
});
