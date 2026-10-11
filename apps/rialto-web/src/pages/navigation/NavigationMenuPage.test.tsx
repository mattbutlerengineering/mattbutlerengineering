import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavigationMenuPage } from "./NavigationMenuPage";

describe("NavigationMenuPage accessibility", () => {
  it("gives every navigation landmark a unique accessible name (axe `landmark-unique`)", () => {
    render(<NavigationMenuPage />);
    const navs = screen.getAllByRole("navigation");
    expect(navs.length).toBeGreaterThan(1);
    const names = navs.map((nav) => nav.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });
});
