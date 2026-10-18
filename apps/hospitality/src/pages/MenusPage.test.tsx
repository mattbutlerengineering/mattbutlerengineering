import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => ({ menus: api })),
}));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: vi.fn(() => ({
    selectedVenueId: "v1",
    selectedVenue: { id: "v1", ianaTimezone: "America/Toronto", currencyCode: "CAD" },
  })),
}));

import { MenusPage } from "./MenusPage.js";

const menu = (id: string, name: string, slug: string, status: string) => ({
  id,
  venueId: "v1",
  name,
  slug,
  description: null,
  status,
  displayOrder: 0,
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
});

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/menus" element={<MenusPage />} />
          <Route path="/menus/:menuId" element={<MenusPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MenusPage", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.list.mockResolvedValue([
      menu("m1", "Dinner", "dinner", "ACTIVE"),
      menu("m2", "Brunch", "brunch", "DRAFT"),
    ]);
    api.create.mockResolvedValue(menu("m3", "Late Night", "late-night", "DRAFT"));
    api.delete.mockResolvedValue(undefined);
  });

  it("lists the venue's menus with status and edit links", async () => {
    renderAt("/menus");

    expect(await screen.findByText("Dinner")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Dinner" })).toHaveAttribute("href", "/menus/m1");
    expect(api.list).toHaveBeenCalledWith("v1");
  });

  it("shows an empty state with a create action when there are no menus", async () => {
    api.list.mockResolvedValue([]);
    renderAt("/menus");

    expect(await screen.findByText("No menus yet")).toBeInTheDocument();
  });

  it("shows a retryable error when the list fails to load", async () => {
    api.list.mockRejectedValue(new Error("down"));
    renderAt("/menus");

    expect(await screen.findByRole("alert")).toHaveTextContent("Menus not loaded.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("creates a menu, deriving the slug from the name", async () => {
    const user = userEvent.setup();
    renderAt("/menus");
    await screen.findByText("Dinner");

    await user.click(screen.getByRole("button", { name: "New menu" }));
    await user.type(screen.getByLabelText("Name"), "Late Night");
    expect(screen.getByLabelText("URL slug")).toHaveValue("late-night");
    await user.click(screen.getByRole("button", { name: "Create menu" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith("v1", {
        name: "Late Night",
        slug: "late-night",
        status: "DRAFT",
      })
    );
  });

  it("blocks creation while the slug is invalid", async () => {
    const user = userEvent.setup();
    renderAt("/menus");
    await screen.findByText("Dinner");

    await user.click(screen.getByRole("button", { name: "New menu" }));
    await user.type(screen.getByLabelText("Name"), "Late Night");
    const slug = screen.getByLabelText("URL slug");
    await user.clear(slug);
    await user.type(slug, "Not Valid!");

    expect(screen.getByRole("button", { name: "Create menu" })).toBeDisabled();
  });

  it("deletes a menu only after confirmation", async () => {
    renderAt("/menus");

    fireEvent.click(await screen.findByRole("button", { name: "Delete Brunch" }));
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("v1", "m2"));
  });

  it("opens the editor for /menus/:menuId", async () => {
    api.getById.mockResolvedValue({
      ...menu("m1", "Dinner", "dinner", "ACTIVE"),
      sections: [],
    });
    renderAt("/menus/m1");

    expect(await screen.findByLabelText("URL slug")).toHaveValue("dinner");
    expect(screen.getByRole("link", { name: "All menus" })).toHaveAttribute("href", "/menus");
    expect(api.getById).toHaveBeenCalledWith("v1", "m1");
  });

  it("passes axe on the list", async () => {
    const { container } = renderAt("/menus");
    await screen.findByText("Dinner");

    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });

    expect(results.violations).toEqual([]);
  });
});
