import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      expect(screen.getByRole("button", { name: /products/i })).toHaveAttribute(
        "aria-haspopup",
        "menu"
      );
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
      await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument(), { timeout: 1000 });
      expect(screen.getByRole("menuitem", { name: "Widgets" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Gadgets" })).toBeInTheDocument();
    });

    it("hides dropdown after blur (onBlur schedules close)", async () => {
      render(<NavigationMenu items={items} />);
      const trigger = screen.getByRole("button", { name: /products/i });
      fireEvent.focus(trigger);
      await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument(), { timeout: 1000 });

      fireEvent.blur(trigger);
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument(), {
        timeout: 1000,
      });
    });
  });

  describe("keyboard navigation into dropdown", () => {
    it("moves focus to the first child menuitem on ArrowDown from the trigger", async () => {
      render(<NavigationMenu items={items} />);
      const trigger = screen.getByRole("button", { name: /products/i });
      fireEvent.focus(trigger);
      await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument(), { timeout: 1000 });

      fireEvent.keyDown(trigger, { key: "ArrowDown" });

      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Widgets" }));
    });
  });

  describe("keyboard focus stays inside the open dropdown", () => {
    const CLOSE_DELAY_PLUS = 400;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    it("keeps the panel open and focus on the menuitem after ArrowDown past CLOSE_DELAY", async () => {
      const user = userEvent.setup();
      render(<NavigationMenu items={items} />);
      await user.tab(); // Home link
      await user.tab(); // Products trigger
      await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument(), { timeout: 1000 });

      await user.keyboard("{ArrowDown}");
      await act(() => sleep(CLOSE_DELAY_PLUS));

      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Widgets" }));

      await user.keyboard("{ArrowDown}");
      await act(() => sleep(CLOSE_DELAY_PLUS));
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Gadgets" }));
      await user.keyboard("{Home}");
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Widgets" }));
      await user.keyboard("{End}");
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Gadgets" }));
      await user.keyboard("{ArrowUp}");
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Widgets" }));
    });

    it("closes when focus leaves the trigger and panel", async () => {
      const user = userEvent.setup();
      render(<NavigationMenu items={items} />);
      await user.tab();
      await user.tab();
      await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument(), { timeout: 1000 });
      await user.keyboard("{ArrowDown}");
      await user.tab(); // Gadgets (tabIndex -1 skipped) -> leaves to About link
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument(), {
        timeout: 1500,
      });
    });

    it("closes on Escape", async () => {
      const user = userEvent.setup();
      render(<NavigationMenu items={items} />);
      await user.tab();
      await user.tab();
      await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument(), { timeout: 1000 });
      await user.keyboard("{ArrowDown}{Escape}");
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument(), {
        timeout: 1500,
      });
    });
  });

  describe("aria attributes", () => {
    it("sets aria-expanded=false initially", () => {
      render(<NavigationMenu items={items} />);
      expect(screen.getByRole("button", { name: /products/i })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
    });

    it("sets aria-expanded=true when open", async () => {
      render(<NavigationMenu items={items} />);
      const trigger = screen.getByRole("button", { name: /products/i });
      fireEvent.focus(trigger);
      await waitFor(
        () =>
          expect(screen.getByRole("button", { name: /products/i })).toHaveAttribute(
            "aria-expanded",
            "true"
          ),
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
