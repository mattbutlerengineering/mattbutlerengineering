import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  AvailabilityHeaderActions,
  type AvailabilityHeaderActionsProps,
} from "./AvailabilityHeaderActions.js";

function handlers() {
  return {
    onPause: vi.fn(),
    onClose: vi.fn(),
    onCompareServices: vi.fn(),
    onDuplicateRegularWeek: vi.fn(),
    onHistory: vi.fn(),
    onGoToDate: vi.fn(),
  };
}

function renderActions(extra: Partial<AvailabilityHeaderActionsProps> = {}) {
  const on = handlers();
  render(<AvailabilityHeaderActions viewport="desktop" pending={false} {...on} {...extra} />);
  return on;
}

const menuItems = () =>
  within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);

describe("AvailabilityHeaderActions", () => {
  it("shows Close…, Pause online booking and ⋯ on a desktop, one interaction each", () => {
    const on = renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Close…" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause online booking" }));
    expect(on.onClose).toHaveBeenCalledTimes(1);
    expect(on.onPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "More actions" })).toHaveTextContent(/^⋯$/);
  });

  // Booking rules is the hub's row 5 (availability-hub C2.5), no longer an entry here.
  it("the ⋯ menu holds Compare services, Duplicate regular week…, History, Go to date", () => {
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(menuItems()).toEqual([
      "Compare services",
      "Duplicate regular week…",
      "History",
      "Go to date",
    ]);
  });

  it.each([
    ["Compare services", "onCompareServices"],
    ["Duplicate regular week…", "onDuplicateRegularWeek"],
    ["History", "onHistory"],
    ["Go to date", "onGoToDate"],
  ] as const)("%s runs after the menu has closed", async (label, handler) => {
    const on = renderActions();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    await waitFor(() => expect(on[handler]).toHaveBeenCalledTimes(1));
  });

  it("a phone keeps Close… and puts Pause online booking first in ⋯", async () => {
    const on = renderActions({ viewport: "phone" });
    expect(screen.getByRole("button", { name: "Close…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause online booking" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(menuItems()[0]).toBe("Pause online booking");
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause online booking" }));
    await waitFor(() => expect(on.onPause).toHaveBeenCalledTimes(1));
  });

  it("offers no pause while online booking is already paused", () => {
    renderActions({ onPause: undefined });
    expect(screen.queryByRole("button", { name: "Pause online booking" })).not.toBeInTheDocument();
  });

  it("leaves Duplicate regular week… out when there is no regular week", () => {
    renderActions({ onDuplicateRegularWeek: undefined });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(menuItems()).not.toContain("Duplicate regular week…");
  });

  it("renders disabled while the role or the config is being read", () => {
    renderActions({ pending: true });
    expect(screen.getByRole("button", { name: "Close…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause online booking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More actions" })).toBeDisabled();
  });

  it("gives a Host a ⋯ with only History and Go to date", async () => {
    const on = renderActions({
      onClose: undefined,
      onPause: undefined,
      onCompareServices: undefined,
      onDuplicateRegularWeek: undefined,
    });
    expect(screen.queryByRole("button", { name: "Close…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause online booking" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(menuItems()).toEqual(["History", "Go to date"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Go to date" }));
    await waitFor(() => expect(on.onGoToDate).toHaveBeenCalledTimes(1));
  });
});
