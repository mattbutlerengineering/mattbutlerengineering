import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AvailabilityToolbar, type AvailabilityToolbarProps } from "./AvailabilityToolbar.js";

const selectItems = [
  { id: "select-days", label: "Select days", onSelect: vi.fn() },
  { id: "weekday", label: "Every Thursday in November", onSelect: vi.fn() },
];

function renderToolbar(extra: Partial<AvailabilityToolbarProps> = {}) {
  return render(
    <AvailabilityToolbar
      viewport="desktop"
      view="month"
      onViewChange={vi.fn()}
      period="November 2026"
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      onToday={vi.fn()}
      selectItems={selectItems}
      {...extra}
    />
  );
}

describe("AvailabilityToolbar", () => {
  it("no longer renders ⋯, Close…, Pause or Change regular week…", () => {
    renderToolbar();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause online booking" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change regular week…" })).not.toBeInTheDocument();
  });

  it("keeps date navigation, Month | Week and Select… on a desktop", () => {
    renderToolbar();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select…" })).toBeInTheDocument();
  });

  it("a phone's menu is labelled Select… and holds only the Select… items", () => {
    renderToolbar({ viewport: "phone" });
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select…" }));
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Select days",
      "Every Thursday in November",
    ]);
  });

  it.each(["desktop", "phone"] as const)("opens the Select… menu right-aligned on a %s", (viewport) => {
    renderToolbar({ viewport });
    fireEvent.click(screen.getByRole("button", { name: "Select…" }));
    expect(screen.getByRole("menu").className).toContain("menuRight");
  });

  it("offers no Select… menu when there is nothing to select", () => {
    renderToolbar({ viewport: "phone", selectItems: [] });
    expect(screen.queryByRole("button", { name: "Select…" })).not.toBeInTheDocument();
  });
});
