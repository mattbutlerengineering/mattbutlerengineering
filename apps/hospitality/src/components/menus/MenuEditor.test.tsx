import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MenuWithSections } from "@mbe/api-client";

const api = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  reorderSections: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  reorderItems: vi.fn(),
}));

vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => ({ menus: api })),
}));

import { MenuEditor } from "./MenuEditor.js";

const item = (id: string, name: string, priceCents: number, status = "AVAILABLE") => ({
  id,
  venueId: "v1",
  sectionId: "s1",
  name,
  description: null,
  priceCents,
  status,
  displayOrder: 0,
});

const menu = {
  id: "m1",
  venueId: "v1",
  name: "Dinner",
  slug: "dinner",
  description: null,
  status: "ACTIVE",
  displayOrder: 0,
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
  sections: [
    {
      id: "s1",
      venueId: "v1",
      menuId: "m1",
      name: "Starters",
      displayOrder: 0,
      items: [item("i1", "Soup", 850), item("i2", "Bread", 400)],
    },
    { id: "s2", venueId: "v1", menuId: "m1", name: "Mains", displayOrder: 1, items: [] },
  ],
} as MenuWithSections;

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MenuEditor
        venueId="v1"
        menuId="m1"
        venueSlug="oak-table"
        currencyCode="USD"
        formatMoney={(cents) => `$${(cents / 100).toFixed(2)}`}
      />
    </QueryClientProvider>
  );
}

describe("MenuEditor", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getById.mockResolvedValue(menu);
    for (const name of [
      "update",
      "createSection",
      "updateSection",
      "deleteSection",
      "reorderSections",
      "createItem",
      "updateItem",
      "deleteItem",
      "reorderItems",
    ] as const) {
      api[name].mockResolvedValue(undefined);
    }
  });

  it("renders each section with its dishes and venue-formatted prices", async () => {
    renderEditor();

    expect(await screen.findByRole("heading", { name: "Starters" })).toBeInTheDocument();
    expect(screen.getByText("Soup")).toBeInTheDocument();
    expect(screen.getByText("$8.50")).toBeInTheDocument();
    expect(screen.getByText("No dishes in this section yet.")).toBeInTheDocument();
  });

  it("offers a QR download for the menu's public page", async () => {
    renderEditor();

    expect(await screen.findByRole("button", { name: "Download QR" })).toBeInTheDocument();
  });

  it("marks a dish sold out immediately and sends SOLD_OUT", async () => {
    let settle!: () => void;
    api.updateItem.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)));
    renderEditor();

    const toggle = await screen.findByRole("switch", { name: "Soup sold out" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Soup sold out" })).toBeChecked()
    );
    expect(api.updateItem).toHaveBeenCalledWith("v1", "m1", "s1", "i1", { status: "SOLD_OUT" });
    expect(screen.getByRole("status")).toHaveTextContent("Soup marked sold out.");
    settle();
  });

  it("rolls the toggle back and shows an alert when the request fails", async () => {
    api.updateItem.mockRejectedValue(new Error("boom"));
    renderEditor();

    fireEvent.click(await screen.findByRole("switch", { name: "Soup sold out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Change not saved.");
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Soup sold out" })).not.toBeChecked()
    );
  });

  it("reorders dishes with the move buttons (keyboard path)", async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Move Soup down" }));

    await waitFor(() =>
      expect(api.reorderItems).toHaveBeenCalledWith("v1", "m1", "s1", ["i2", "i1"])
    );
    expect(screen.getByRole("status")).toHaveTextContent("Soup moved to position 2 of 2.");
  });

  it("disables moving the first dish up and the last dish down", async () => {
    renderEditor();

    expect(await screen.findByRole("button", { name: "Move Soup up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Bread down" })).toBeDisabled();
  });

  it("reorders dishes by dragging the grip onto another row", async () => {
    renderEditor();

    const grip = await screen.findByRole("img", { name: "Drag Bread to reorder" });
    const soupRow = screen.getByText("Soup").closest("li") as HTMLElement;
    fireEvent.dragStart(grip);
    fireEvent.drop(soupRow);

    await waitFor(() =>
      expect(api.reorderItems).toHaveBeenCalledWith("v1", "m1", "s1", ["i2", "i1"])
    );
  });

  it("reorders sections with the move buttons", async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Move Starters down" }));

    await waitFor(() => expect(api.reorderSections).toHaveBeenCalledWith("v1", "m1", ["s2", "s1"]));
  });

  it("adds a dish with the price converted to integer cents", async () => {
    const user = userEvent.setup();
    renderEditor();

    const form = await screen.findByRole("form", { name: "Add a dish to Mains" });
    await user.type(within(form).getByLabelText("Dish name"), "Steak");
    await user.type(within(form).getByLabelText("Price (USD)"), "12.50");
    await user.click(within(form).getByRole("button", { name: "Add dish" }));

    await waitFor(() =>
      expect(api.createItem).toHaveBeenCalledWith("v1", "m1", "s2", {
        name: "Steak",
        description: null,
        priceCents: 1250,
      })
    );
  });

  it("rejects a price with more than two decimals and keeps Add disabled", async () => {
    const user = userEvent.setup();
    renderEditor();

    const form = await screen.findByRole("form", { name: "Add a dish to Mains" });
    await user.type(within(form).getByLabelText("Dish name"), "Steak");
    await user.type(within(form).getByLabelText("Price (USD)"), "12.505");

    expect(within(form).getByText(/at most two decimals/)).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Add dish" })).toBeDisabled();
  });

  it("rejects a negative price", async () => {
    const user = userEvent.setup();
    renderEditor();

    const form = await screen.findByRole("form", { name: "Add a dish to Mains" });
    await user.type(within(form).getByLabelText("Dish name"), "Steak");
    await user.type(within(form).getByLabelText("Price (USD)"), "-3");

    expect(within(form).getByRole("button", { name: "Add dish" })).toBeDisabled();
  });

  it("deletes a section only after confirmation", async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Delete section Mains" }));
    expect(api.deleteSection).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteSection).toHaveBeenCalledWith("v1", "m1", "s2"));
  });

  it("saves menu details with a validated slug", async () => {
    const user = userEvent.setup();
    renderEditor();

    const slug = await screen.findByLabelText("URL slug");
    await user.clear(slug);
    await user.type(slug, "Bad Slug");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await user.clear(slug);
    await user.type(slug, "late-dinner");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("v1", "m1", {
        name: "Dinner",
        slug: "late-dinner",
        status: "ACTIVE",
      })
    );
  });

  it("discards a half-typed dish edit on Cancel", async () => {
    const user = userEvent.setup();
    renderEditor();

    const row = () => screen.getByText("Soup").closest("li") as HTMLElement;
    await user.click(await screen.findByRole("button", { name: "Edit Soup" }));
    const price = () =>
      within(
        screen.getByLabelText("Price (USD)", { selector: "li input" }).closest("li") as HTMLElement
      ).getByLabelText("Price (USD)");
    await user.clear(price());
    await user.type(price(), "abc");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(row()).getByRole("button", { name: "Edit Soup" }));

    expect(price()).toHaveValue("8.50");
    expect(screen.getByRole("button", { name: "Save dish" })).toBeEnabled();
  });

  it("passes axe", async () => {
    const { container } = renderEditor();
    await screen.findByRole("heading", { name: "Starters" });

    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });

    expect(results.violations).toEqual([]);
  });
});
