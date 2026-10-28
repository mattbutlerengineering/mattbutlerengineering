import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppNav } from "./AppNav.js";
import { hostConfig } from "../lib/host-brand.js";

// #7709: eat-sheet.com serves only this app, so it gets a brand bar instead of
// the cross-site GlobalNav, whose Home / Design System links do not exist there.
describe("AppNav", () => {
  it("renders the eat-sheet brand bar on eat-sheet.com, linking home to the root", () => {
    render(<AppNav host={hostConfig("eat-sheet.com")} theme="light" onThemeToggle={vi.fn()} />);
    const brand = screen.getByRole("link", { name: "eat-sheet" });
    expect(brand.getAttribute("href")).toBe(`${window.location.origin}/`);
    expect(screen.queryByRole("link", { name: "Design System" })).toBeNull();
    expect(screen.getByRole("banner")).toBeDefined();
  });

  it("keeps the cross-site GlobalNav on mattbutlerengineering.com", () => {
    render(
      <AppNav
        host={hostConfig("mattbutlerengineering.com")}
        theme="light"
        onThemeToggle={vi.fn()}
      />
    );
    expect(screen.getByRole("link", { name: "MBE" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Design System" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "eat-sheet" })).toBeNull();
  });
});
