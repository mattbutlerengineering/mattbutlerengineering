import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Navbar } from "./Navbar";
import type { NavbarLink } from "./Navbar";

const links: NavbarLink[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "settings", label: "Settings", href: "/settings" },
  {
    id: "docs",
    label: "Documentation",
    href: "/docs",
    children: [
      { id: "docs-start", label: "Getting Started", href: "/docs/start" },
      { id: "docs-api", label: "API Reference", href: "/docs/api" },
    ],
  },
];

describe("Navbar", () => {
  describe("rendering", () => {
    it("renders as nav element", () => {
      render(<Navbar links={links} />);
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    it("renders all top-level link labels", () => {
      render(<Navbar links={links} />);
      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByText("Documentation")).toBeInTheDocument();
    });

    it("renders logo when provided", () => {
      render(<Navbar links={links} logo={<img src="/logo.svg" alt="Logo" />} />);
      expect(screen.getByAltText("Logo")).toBeInTheDocument();
    });

    it("renders user info when provided", () => {
      render(
        <Navbar
          links={links}
          user={{ name: "Alice", email: "alice@example.com" }}
        />
      );
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    it("renders user avatar fallback (first letter)", () => {
      render(<Navbar links={links} user={{ name: "Bob" }} />);
      expect(screen.getByText("B")).toBeInTheDocument();
    });

    it("renders custom avatar", () => {
      render(
        <Navbar
          links={links}
          user={{ name: "Charlie", avatar: <img src="/avatar.jpg" alt="avatar" /> }}
        />
      );
      expect(screen.getByAltText("avatar")).toBeInTheDocument();
    });

    it("renders search input when search prop is provided", () => {
      render(
        <Navbar
          links={links}
          search={{ placeholder: "Search...", onSearch: vi.fn() }}
        />
      );
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });

    it("renders footer content", () => {
      render(<Navbar links={links} footer={<p>v1.0.0</p>} />);
      expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    });

    it("renders badge on link", () => {
      const linksWithBadge: NavbarLink[] = [
        { id: "notifications", label: "Notifications", href: "/n", badge: 5 },
      ];
      render(<Navbar links={linksWithBadge} />);
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("shows submenu toggle button for links with children", () => {
      render(<Navbar links={links} />);
      expect(
        screen.getByRole("button", { name: /toggle submenu/i })
      ).toBeInTheDocument();
    });

    it("toggles submenu open on chevron click", async () => {
      const user = userEvent.setup();
      render(<Navbar links={links} />);
      expect(screen.queryByText("Getting Started")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /toggle submenu/i }));
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
      expect(screen.getByText("API Reference")).toBeInTheDocument();
    });

    it("toggles submenu closed on second chevron click", async () => {
      const user = userEvent.setup();
      render(<Navbar links={links} />);
      const toggle = screen.getByRole("button", { name: /toggle submenu/i });
      await user.click(toggle);
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
      await user.click(toggle);
      expect(screen.queryByText("Getting Started")).not.toBeInTheDocument();
    });

    it("calls onSearch callback when search input changes", async () => {
      const user = userEvent.setup();
      const onSearch = vi.fn();
      render(
        <Navbar
          links={links}
          search={{ placeholder: "Search...", onSearch }}
        />
      );
      await user.type(screen.getByPlaceholderText("Search..."), "home");
      expect(onSearch).toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <Navbar
          links={links}
          user={{ name: "Alice", email: "alice@example.com" }}
        />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
