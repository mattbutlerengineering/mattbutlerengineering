import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(<Badge>Active</Badge>);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("defaults to neutral variant", () => {
      const { container } = render(<Badge>Neutral</Badge>);
      expect(container.querySelector("span")?.className).toMatch(/neutral/);
    });

    it("applies accent variant class", () => {
      const { container } = render(<Badge variant="accent">Accent</Badge>);
      expect(container.querySelector("span")?.className).toMatch(/accent/);
    });

    it("applies success variant class", () => {
      const { container } = render(<Badge variant="success">OK</Badge>);
      expect(container.querySelector("span")?.className).toMatch(/success/);
    });

    it("applies warning variant class", () => {
      const { container } = render(<Badge variant="warning">Warn</Badge>);
      expect(container.querySelector("span")?.className).toMatch(/warning/);
    });

    it("applies error variant class", () => {
      const { container } = render(<Badge variant="error">Error</Badge>);
      expect(container.querySelector("span")?.className).toMatch(/error/);
    });
  });

  describe("size", () => {
    it("defaults to md size (no sm class)", () => {
      const { container } = render(<Badge>Default</Badge>);
      expect(container.querySelector("span")?.className).not.toMatch(/\bsm\b/);
    });

    it("applies sm class when size is sm", () => {
      const { container } = render(<Badge size="sm">Small</Badge>);
      expect(container.querySelector("span")?.className).toMatch(/sm/);
    });
  });

  describe("dot", () => {
    it("does not render dot by default", () => {
      const { container } = render(<Badge>No dot</Badge>);
      // Only one span — the badge itself, no dot child
      const spans = container.querySelectorAll("span");
      expect(spans).toHaveLength(1);
    });

    it("renders dot span when dot prop is true", () => {
      const { container } = render(<Badge dot>With dot</Badge>);
      // badge span + dot span
      const spans = container.querySelectorAll("span");
      expect(spans).toHaveLength(2);
    });

    it("dot span has dot class", () => {
      const { container } = render(<Badge dot>With dot</Badge>);
      const inner = container.querySelectorAll("span")[1];
      expect(inner?.className).toMatch(/dot/);
    });
  });

  describe("accessibility", () => {
    it("forwards ref", () => {
      const ref = { current: null as HTMLSpanElement | null };
      render(<Badge ref={ref}>Ref</Badge>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it("forwards additional className", () => {
      const { container } = render(<Badge className="custom">Custom</Badge>);
      expect(container.querySelector("span")?.className).toMatch(/custom/);
    });

    it("forwards HTML attributes like aria-label", () => {
      render(<Badge aria-label="status badge">Active</Badge>);
      expect(screen.getByLabelText("status badge")).toBeInTheDocument();
    });
  });
});
