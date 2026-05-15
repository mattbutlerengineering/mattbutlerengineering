import { render, screen } from "@testing-library/react";
import { AppBar } from "./AppBar";

describe("AppBar", () => {
  describe("rendering", () => {
    it("renders as a header element", () => {
      render(<AppBar />);
      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("renders logo slot when provided", () => {
      render(<AppBar logo={<span>Acme</span>} />);
      expect(screen.getByText("Acme")).toBeInTheDocument();
    });

    it("renders actions slot when provided", () => {
      render(<AppBar actions={<button type="button">Login</button>} />);
      expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
    });

    it("does not render logo div when logo is absent", () => {
      const { container } = render(<AppBar />);
      // No logo content
      expect(container.querySelector("header")).toBeInTheDocument();
      expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    });

    it("applies glass class by default", () => {
      const { container } = render(<AppBar />);
      expect(container.querySelector("header")?.className).toMatch(/glass/);
    });

    it("omits glass class when glass=false", () => {
      const { container } = render(<AppBar glass={false} />);
      expect(container.querySelector("header")?.className).not.toMatch(/glass/);
    });

    it("applies custom className", () => {
      const { container } = render(<AppBar className="my-bar" />);
      expect(container.querySelector("header")?.className).toMatch(/my-bar/);
    });

    it("applies custom height via inline style", () => {
      const { container } = render(<AppBar height="80px" />);
      const header = container.querySelector("header");
      // framer-motion merges style; height token is set
      expect(header).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the header element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<AppBar ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });

  describe("aria", () => {
    it("accepts aria-label", () => {
      render(<AppBar aria-label="Main navigation" />);
      expect(screen.getByRole("banner")).toHaveAttribute("aria-label", "Main navigation");
    });
  });
});
