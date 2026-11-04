import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

    const menuId = screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-controls");
    expect(menuId).toBeTruthy();
    expect(document.getElementById(menuId!)).toBeNull();
  });

  it("toggles mobile menu on hamburger click", async () => {
    const user = userEvent.setup();
    render(<GlobalNav currentApp="marketing" />);

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    const menuId = hamburger.getAttribute("aria-controls")!;
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");

    // Open
    await user.click(hamburger);
    expect(document.getElementById(menuId)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe(
      "true"
    );

    // Close
    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(document.getElementById(menuId)).toBeNull();
  });

  it("closes mobile menu on Escape key", async () => {
    const user = userEvent.setup();
    render(<GlobalNav currentApp="marketing" />);

    const menuId = screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-controls")!;

    // Open menu
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.getElementById(menuId)).toBeTruthy();

    // Press Escape
    await user.keyboard("{Escape}");
    expect(document.getElementById(menuId)).toBeNull();
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

  it("generates unique mobile-menu ids across instances (useId)", () => {
    const { container: a } = render(<GlobalNav currentApp="marketing" />);
    const { container: b } = render(<GlobalNav currentApp="marketing" />);
    const idA = a.querySelector("button[aria-controls]")?.getAttribute("aria-controls");
    const idB = b.querySelector("button[aria-controls]")?.getAttribute("aria-controls");
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
  });

  it("shows the labels a consumer passes, falling back to the English defaults", () => {
    render(
      <GlobalNav currentApp="marketing" labels={{ marketing: "Inicio", rialto: "Sistema" }} />
    );

    expect(screen.getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Sistema" }).getAttribute("href")).toBe("/rialto");
    expect(screen.getByRole("link", { name: "Hospitality" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
  });
  describe("menu", () => {
    const menu = {
      label: "Engineering",
      items: [
        { label: "Metrics", href: "/metrics" },
        { label: "Status", href: "/status", current: true },
        { label: "ACMM", href: "/acmm" },
      ],
    };

    it("renders a collapsed trigger and no links until opened", async () => {
      const user = userEvent.setup();
      render(<GlobalNav currentApp="marketing" menu={menu} />);

      const trigger = screen.getByRole("button", { name: "Engineering" });
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("link", { name: "Metrics" })).toBeNull();

      await user.click(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByRole("link", { name: "Metrics" }).getAttribute("href")).toBe("/metrics");
    });

    it("marks the trigger and the current item with aria-current", async () => {
      const user = userEvent.setup();
      render(<GlobalNav currentApp="marketing" menu={menu} />);

      const trigger = screen.getByRole("button", { name: "Engineering" });
      expect(trigger.getAttribute("aria-current")).toBe("true");
      await user.click(trigger);
      expect(screen.getByRole("link", { name: "Status" }).getAttribute("aria-current")).toBe(
        "page"
      );
      expect(screen.getByRole("link", { name: "Metrics" }).getAttribute("aria-current")).toBeNull();
    });

    it("omits aria-current on the trigger when no item is current", () => {
      render(
        <GlobalNav
          currentApp="marketing"
          menu={{ label: "Engineering", items: [{ label: "Metrics", href: "/metrics" }] }}
        />
      );
      expect(
        screen.getByRole("button", { name: "Engineering" }).getAttribute("aria-current")
      ).toBeNull();
    });

    it("moves focus with arrow keys and wraps", async () => {
      const user = userEvent.setup();
      render(<GlobalNav currentApp="marketing" menu={menu} />);

      await user.click(screen.getByRole("button", { name: "Engineering" }));
      await user.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "Metrics" }));
      await user.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "Status" }));
      await user.keyboard("{ArrowUp}{ArrowUp}");
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "ACMM" }));
    });

    it("closes on Escape and returns focus to the trigger", async () => {
      const user = userEvent.setup();
      render(<GlobalNav currentApp="marketing" menu={menu} />);

      const trigger = screen.getByRole("button", { name: "Engineering" });
      await user.click(trigger);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Escape}");

      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("link", { name: "Metrics" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("closes when focus leaves the menu", async () => {
      const user = userEvent.setup();
      render(<GlobalNav currentApp="marketing" menu={menu} />);

      await user.click(screen.getByRole("button", { name: "Engineering" }));
      await user.click(screen.getByRole("link", { name: "Home" }));
      expect(screen.queryByRole("link", { name: "Metrics" })).toBeNull();
    });

    it("closes on a press outside the menu", async () => {
      const user = userEvent.setup();
      render(<GlobalNav currentApp="marketing" menu={menu} />);

      await user.click(screen.getByRole("button", { name: "Engineering" }));
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole("link", { name: "Metrics" })).toBeNull();
    });

    it("lists the items as a named group, with a visible name, in the mobile menu", async () => {
      const user = userEvent.setup();
      render(<GlobalNav currentApp="marketing" menu={menu} />);

      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const group = screen.getByRole("group", { name: "Engineering" });
      expect(
        within(group)
          .getAllByRole("link")
          .map((a) => a.textContent)
      ).toEqual(["Metrics", "Status", "ACMM"]);
      expect(
        document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent
      ).toBe("Engineering");
    });

    it("has no axe violations with the mobile menu open", async () => {
      const user = userEvent.setup();
      const { container } = render(<GlobalNav currentApp="marketing" menu={menu} />);

      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations).toEqual([]);
    });

    it("has no axe violations with the dropdown open", async () => {
      const user = userEvent.setup();
      const { container } = render(<GlobalNav currentApp="marketing" menu={menu} />);

      await user.click(screen.getByRole("button", { name: "Engineering" }));
      const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations).toEqual([]);
    });
  });
});
