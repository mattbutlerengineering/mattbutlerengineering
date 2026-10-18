import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockGetBySlug, mockGetPublic } = vi.hoisted(() => ({
  mockGetBySlug: vi.fn(),
  mockGetPublic: vi.fn(),
}));

vi.mock("../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: vi.fn(() => ({
    venues: { getBySlug: mockGetBySlug },
    menus: { getPublic: mockGetPublic },
  })),
}));

import { PublicMenuPage } from "./PublicMenuPage.js";

const venue = { id: "v1", name: "The Grand Table", slug: "grand", currencyCode: "USD" };

function menu(currencyCode: string) {
  return {
    id: "m1",
    name: "Dinner",
    slug: "dinner",
    description: "Evening plates",
    displayOrder: 0,
    currencyCode,
    sections: [
      {
        id: "s2",
        name: "Mains",
        displayOrder: 1,
        items: [
          {
            id: "i3",
            name: "Steak",
            description: "Dry aged",
            priceCents: 3250,
            status: "AVAILABLE",
            displayOrder: 0,
          },
        ],
      },
      {
        id: "s1",
        name: "Starters",
        displayOrder: 0,
        items: [
          {
            id: "i2",
            name: "Soup",
            description: null,
            priceCents: 900,
            status: "SOLD_OUT",
            displayOrder: 1,
          },
          {
            id: "i1",
            name: "Bread",
            description: "Warm",
            priceCents: 450,
            status: "AVAILABLE",
            displayOrder: 0,
          },
        ],
      },
    ],
  };
}

function renderPage(path = "/menu/grand/dinner") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="menu/:venueSlug/:menuSlug" element={<PublicMenuPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PublicMenuPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBySlug.mockResolvedValue(venue);
  });

  it("renders sections and items in display order", async () => {
    mockGetPublic.mockResolvedValue(menu("USD"));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Dinner" })).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Starters", "Mains"]);
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names[0]).toContain("Bread");
    expect(names[1]).toContain("Soup");
    expect(names[2]).toContain("Steak");
    expect(mockGetPublic).toHaveBeenCalledWith("grand", "dinner");
  });

  it("formats prices in the venue currency (USD)", async () => {
    mockGetPublic.mockResolvedValue(menu("USD"));
    renderPage();
    expect(await screen.findByText("$32.50")).toBeTruthy();
    expect(screen.getByText("$4.50")).toBeTruthy();
  });

  it("formats prices in the venue currency (CAD)", async () => {
    mockGetPublic.mockResolvedValue(menu("CAD"));
    renderPage();
    expect(await screen.findByText("CA$32.50")).toBeTruthy();
  });

  it("marks sold-out items visibly with text a screen reader announces", async () => {
    mockGetPublic.mockResolvedValue(menu("USD"));
    renderPage();
    const badge = await screen.findByText("Sold out");
    expect(badge.getAttribute("aria-hidden")).not.toBe("true");
    expect(badge.closest("li")?.textContent).toContain("Soup");
    expect(screen.getAllByText("Sold out")).toHaveLength(1);
  });

  it("shows a not-found state, not a crash, for an unknown menu", async () => {
    mockGetPublic.mockRejectedValue(new Error("GET /public/v1/venues/grand/menus/x failed: 404"));
    renderPage("/menu/grand/x");
    await waitFor(() => expect(screen.getByText("Menu not found")).toBeTruthy());
    expect(screen.queryByText(/public\/v1/)).toBeNull();
  });

  it("shows a not-found state for an unknown venue", async () => {
    mockGetBySlug.mockRejectedValue(new Error("404"));
    mockGetPublic.mockRejectedValue(new Error("404"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Menu not found")).toBeTruthy());
  });
});
