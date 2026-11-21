import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OverviewPage } from "./OverviewPage.js";
import { NAV_SECTIONS } from "../data/nav-sections.js";

describe("OverviewPage", () => {
  it("makes the scrolling install snippet keyboard-reachable (axe scrollable-region-focusable)", () => {
    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );
    const snippet = screen.getByRole("group", { name: "Install snippet" });
    expect(snippet).toHaveAttribute("tabindex", "0");
    expect(snippet).toHaveTextContent("RialtoProvider");
  });

  it("names each category card by its visible content (WCAG 2.5.3 Label in Name)", () => {
    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );
    const section = NAV_SECTIONS.find((s) => s.items.length > 4);
    if (!section) throw new Error("expected a category with more than four items");
    const card = screen.getByRole("button", { name: new RegExp(`^${section.label} `) });
    const visibleWords = [
      section.label,
      String(section.items.length),
      ...section.items.slice(0, 4).map((item) => item.label),
      `+${section.items.length - 4} more`,
    ];
    const expected = visibleWords.join(" ");
    // Words must not glue: axe joins text nodes with no separator.
    expect(card.textContent?.replace(/\s+/g, " ").trim()).toBe(expected);
    expect(card).toHaveAccessibleName(expected);
    expect(card).not.toHaveAttribute("aria-label");
  });
});
