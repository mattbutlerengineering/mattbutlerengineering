import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Navbar, type NavbarLink } from "./Navbar";

const links: NavbarLink[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "docs", label: "Documentation", href: "/docs", badge: 3 },
];

const nestedLinks: NavbarLink[] = [
  {
    id: "products",
    label: "Products",
    href: "/products",
    children: [
      { id: "widgets", label: "Widgets", href: "/widgets" },
      { id: "gadgets", label: "Gadgets", href: "/gadgets" },
    ],
  },
  { id: "about", label: "About", href: "/about" },
];

describe("Navbar", () => {
  describe("rendering", () => {
    it("renders a nav element", () => {
      render(<Navbar links={links} />);
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    it("renders all top-level links", () => {
      render(<Navbar links={links} />);
      expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Settings/ })).toBeInTheDocument();
    });

    it("renders logo when provided", () => {
      render(<Navbar links={links} logo={<img src="/logo.png" alt="Logo" />} />);
      expect(screen.getByAltText("Logo")).toBeInTheDocument();
    });

    it("renders user name when user prop provided", () => {
      render(<Navbar links={links} user={{ name: "Alice", email: "alice@example.com" }} />);
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    it("renders user initial as avatar fallback", () => {
      render(<Navbar links={links} user={{ name: "Bob" }} />);
      expect(screen.getByText("B")).toBeInTheDocument();
    });

    it("renders badge count on link with badge prop", () => {
      render(<Navbar links={links} />);
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders search input when search prop provided", () => {
      render(<Navbar links={links} search={{ placeholder: "Find…" }} />);
      expect(screen.getByPlaceholderText("Find…")).toBeInTheDocument();
    });

    it("renders footer content when footer prop provided", () => {
      render(<Navbar links={links} footer={<span>v1.0</span>} />);
      expect(screen.getByText("v1.0")).toBeInTheDocument();
    });
  });

  describe("search interaction", () => {
    it("calls onSearch callback on input change", async () => {
      const user = userEvent.setup();
      const onSearch = vi.fn();
      render(<Navbar links={links} search={{ onSearch }} />);
      await user.type(screen.getByRole("textbox"), "foo");
      expect(onSearch).toHaveBeenCalledWith(expect.stringContaining("f"));
    });
  });

  describe("nested links (sub-menu)", () => {
    it("does not render child links before toggle is clicked", () => {
      render(<Navbar links={nestedLinks} />);
      expect(screen.queryByRole("link", { name: "Widgets" })).not.toBeInTheDocument();
    });

    it("renders child links after toggle button is clicked", async () => {
      const user = userEvent.setup();
      render(<Navbar links={nestedLinks} />);
      const toggle = screen.getByRole("button", { name: /toggle submenu/i });
      await user.click(toggle);
      expect(screen.getByRole("link", { name: "Widgets" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Gadgets" })).toBeInTheDocument();
    });

    it("sets aria-expanded on toggle button", async () => {
      const user = userEvent.setup();
      render(<Navbar links={nestedLinks} />);
      const toggle = screen.getByRole("button", { name: /toggle submenu/i });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("collapses sub-menu on second click", async () => {
      const user = userEvent.setup();
      render(<Navbar links={nestedLinks} />);
      const toggle = screen.getByRole("button", { name: /toggle submenu/i });
      await user.click(toggle);
      await user.click(toggle);
      expect(screen.queryByRole("link", { name: "Widgets" })).not.toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the nav element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<Navbar ref={ref} links={links} />);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });
});
