import { render, screen } from "@testing-library/react";
import { Footer } from "./Footer";
import type { FooterColumn } from "./Footer";

const columns: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "About", href: "/about" }],
  },
];

describe("Footer", () => {
  describe("minimal variant (default)", () => {
    it("renders a footer element", () => {
      render(<Footer>Copyright 2026</Footer>);
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    });

    it("renders children in minimal mode", () => {
      render(<Footer>Copyright 2026</Footer>);
      expect(screen.getByText("Copyright 2026")).toBeInTheDocument();
    });

    it("applies minimal class by default", () => {
      const { container } = render(<Footer>Content</Footer>);
      expect(container.querySelector("footer")?.className).toMatch(/minimal/);
    });
  });

  describe("rich variant", () => {
    it("renders column titles", () => {
      render(<Footer variant="rich" columns={columns} />);
      expect(screen.getByText("Product")).toBeInTheDocument();
      expect(screen.getByText("Company")).toBeInTheDocument();
    });

    it("renders column links", () => {
      render(<Footer variant="rich" columns={columns} />);
      expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
      expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    });

    it("renders copyright text when provided", () => {
      render(<Footer variant="rich" copyright="2026 Rialto" />);
      expect(screen.getByText("2026 Rialto")).toBeInTheDocument();
    });

    it("renders default logo text when no logo prop", () => {
      render(<Footer variant="rich" />);
      // Default logo contains "Rialto" text split with accent span
      const footer = screen.getByRole("contentinfo");
      expect(footer.textContent).toMatch(/Rialto/);
    });

    it("renders custom logo when provided", () => {
      render(<Footer variant="rich" logo={<span>MyBrand</span>} />);
      expect(screen.getByText("MyBrand")).toBeInTheDocument();
    });

    it("renders footer navigation when columns provided", () => {
      render(<Footer variant="rich" columns={columns} />);
      expect(screen.getByRole("navigation", { name: /footer links/i })).toBeInTheDocument();
    });

    it("does not render navigation when no columns", () => {
      render(<Footer variant="rich" />);
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });

    it("applies rich class", () => {
      const { container } = render(<Footer variant="rich" />);
      expect(container.querySelector("footer")?.className).toMatch(/rich/);
    });
  });

  describe("className and ref", () => {
    it("forwards custom className", () => {
      const { container } = render(<Footer className="my-footer">Content</Footer>);
      expect(container.querySelector("footer")?.className).toMatch(/my-footer/);
    });

    it("forwards ref to the footer element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<Footer ref={ref}>Content</Footer>);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });
});
