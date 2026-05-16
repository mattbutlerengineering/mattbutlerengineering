import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { NavigationMenu } from "./NavigationMenu";
import type { NavItem } from "./NavigationMenu";

const items: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Products",
    children: [
      { label: "Widgets", href: "/widgets" },
      { label: "Gadgets", href: "/gadgets" },
    ],
  },
  { label: "About", href: "/about" },
];

describe("NavigationMenu", () => {
  describe("rendering", () => {
    it("renders as nav with aria-label", () => {
      render(<NavigationMenu items={items} />);
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });

    it("renders leaf link items", () => {
      render(<NavigationMenu items={items} />);
      expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
    });

    it("renders parent item as a button with aria-haspopup=menu", () => {
      render(<NavigationMenu items={items} />);
      expect(
        screen.getByRole("button", { name: /products/i })
      ).toHaveAttribute("aria-haspopup", "menu");
    });

    it("does not show dropdown by default", () => {
      render(<NavigationMenu items={items} />);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  describe("focus interactions", () => {
    it("shows dropdown after focus (onFocus schedules open)", async () => {
      render(<NavigationMenu items={items} />);
      const trigger = screen.getByRole("button", { name: /products/i });
      // onFocus triggers startOpen with OPEN_DELAY = 200ms
      fireEvent.focus(trigger);
      await waitFor(
        () => expect(screen.getByRole("menu")).toBeInTheDocument(),
        { timeout: 1000 }
      );
      expect(screen.getByRole("menuitem", { name: "Widgets" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Gadgets" })).toBeInTheDocument();
    });

    it("hides dropdown after blur (onBlur schedules close)", async () => {
      render(<NavigationMenu items={items} />);
      const trigger = screen.getByRole("button", { name: /products/i });
      fireEvent.focus(trigger);
      await waitFor(
        () => expect(screen.getByRole("menu")).toBeInTheDocument(),
        { timeout: 1000 }
      );

      fireEvent.blur(trigger);
      await waitFor(
        () => expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
        { timeout: 1000 }
      );
    });
  });

  describe("aria attributes", () => {
    it("sets aria-expanded=false initially", () => {
      render(<NavigationMenu items={items} />);
      expect(
        screen.getByRole("button", { name: /products/i })
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("sets aria-expanded=true when open", async () => {
      render(<NavigationMenu items={items} />);
      const trigger = screen.getByRole("button", { name: /products/i });
      fireEvent.focus(trigger);
      await waitFor(
        () =>
          expect(
            screen.getByRole("button", { name: /products/i })
          ).toHaveAttribute("aria-expanded", "true"),
        { timeout: 1000 }
      );
    });
  });

  describe("accessibility", () => {
    it("passes axe when closed", async () => {
      const { container } = render(<NavigationMenu items={items} />);
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
