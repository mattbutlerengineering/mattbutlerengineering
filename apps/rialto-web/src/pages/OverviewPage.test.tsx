import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OverviewPage } from "./OverviewPage.js";

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
});
