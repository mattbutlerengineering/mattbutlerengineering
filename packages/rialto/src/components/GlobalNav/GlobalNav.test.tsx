import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlobalNav } from "./GlobalNav";

describe("GlobalNav", () => {
  it("renders all navigation links", () => {
    render(<GlobalNav currentApp="marketing" />);

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Hospitality" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Design System" })).toBeTruthy();
  });

  it("renders the brand link pointing to root", () => {
    render(<GlobalNav currentApp="marketing" />);

    const brand = screen.getByRole("link", { name: "MBE" });
    expect(brand).toBeTruthy();
    expect(brand.getAttribute("href")).toBe("/");
  });

  it("applies active class to the current app link", () => {
    render(<GlobalNav currentApp="hospitality" />);

    const hospitalityLink = screen.getByRole("link", { name: "Hospitality" });
    expect(hospitalityLink.className).toContain("active");
    expect(hospitalityLink.getAttribute("aria-current")).toBe("page");

    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink.className).not.toContain("active");
    expect(homeLink.getAttribute("aria-current")).toBeNull();
  });

  it("applies active class for marketing app", () => {
    render(<GlobalNav currentApp="marketing" />);

    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink.className).toContain("active");
    expect(homeLink.getAttribute("aria-current")).toBe("page");
  });

  it("applies active class for rialto app", () => {
    render(<GlobalNav currentApp="rialto" />);

    const designLink = screen.getByRole("link", { name: "Design System" });
    expect(designLink.className).toContain("active");
    expect(designLink.getAttribute("aria-current")).toBe("page");
  });

  it("links use correct href values", () => {
    render(<GlobalNav currentApp="marketing" />);

    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Hospitality" }).getAttribute("href")).toBe(
      "/hospitality"
    );
    expect(screen.getByRole("link", { name: "Design System" }).getAttribute("href")).toBe(
      "/rialto"
    );
  });

  it("mobile menu is hidden by default", () => {
    render(<GlobalNav currentApp="marketing" />);

    expect(document.getElementById("global-nav-mobile-menu")).toBeNull();
  });

  it("toggles mobile menu on hamburger click", async () => {
    const user = userEvent.setup();
    render(<GlobalNav currentApp="marketing" />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");

    // Open
    await user.click(hamburger);
    expect(document.getElementById("global-nav-mobile-menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe(
      "true"
    );

    // Close
    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(document.getElementById("global-nav-mobile-menu")).toBeNull();
  });

  it("closes mobile menu on Escape key", async () => {
    const user = userEvent.setup();
    render(<GlobalNav currentApp="marketing" />);

    // Open menu
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.getElementById("global-nav-mobile-menu")).toBeTruthy();

    // Press Escape
    await user.keyboard("{Escape}");
    expect(document.getElementById("global-nav-mobile-menu")).toBeNull();
  });

  it("has accessible navigation landmark", () => {
    render(<GlobalNav currentApp="marketing" />);

    const nav = screen.getByRole("navigation", { name: "Global navigation" });
    expect(nav).toBeTruthy();
  });

  it("forwards ref to the nav element", () => {
    const ref = { current: null } as React.RefObject<HTMLElement | null>;
    render(<GlobalNav ref={ref} currentApp="marketing" />);

    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe("NAV");
  });

  it("applies custom className", () => {
    render(<GlobalNav currentApp="marketing" className="custom-class" />);

    const nav = screen.getByRole("navigation", { name: "Global navigation" });
    expect(nav.className).toContain("custom-class");
  });

  it("renders theme toggle when theme and onThemeToggle are provided", () => {
    const onToggle = vi.fn();
    render(<GlobalNav currentApp="marketing" theme="light" onThemeToggle={onToggle} />);

    const toggle = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(toggle).toBeTruthy();
  });

  it("does not render theme toggle when props are omitted", () => {
    render(<GlobalNav currentApp="marketing" />);

    expect(screen.queryByRole("button", { name: /switch to .* mode/i })).toBeNull();
  });

  it("calls onThemeToggle when theme toggle is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<GlobalNav currentApp="marketing" theme="dark" onThemeToggle={onToggle} />);

    const toggle = screen.getByRole("button", { name: "Switch to light mode" });
    await user.click(toggle);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows correct icon label for dark theme", () => {
    render(<GlobalNav currentApp="marketing" theme="dark" onThemeToggle={() => {}} />);

    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
  });

  it("shows correct icon label for light theme", () => {
    render(<GlobalNav currentApp="marketing" theme="light" onThemeToggle={() => {}} />);

    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  });
});
