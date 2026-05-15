import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Meter } from "./Meter";

describe("Meter", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<Meter value={50} />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders with role=meter", () => {
      render(<Meter value={50} label="Fuel" />);
      expect(screen.getByRole("meter")).toBeInTheDocument();
    });

    it("sets aria-valuenow", () => {
      render(<Meter value={72} />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "72");
    });

    it("sets aria-valuemin and aria-valuemax", () => {
      render(<Meter value={50} min={0} max={200} />);
      const meter = screen.getByRole("meter");
      expect(meter).toHaveAttribute("aria-valuemin", "0");
      expect(meter).toHaveAttribute("aria-valuemax", "200");
    });

    it("sets aria-label from label prop", () => {
      render(<Meter value={50} label="Fuel Load" />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "Fuel Load");
    });

    it("renders label text", () => {
      render(<Meter value={50} label="Fuel Load" />);
      expect(screen.getByText("Fuel Load")).toBeInTheDocument();
    });

    it("renders percentage when showValue=true", () => {
      render(<Meter value={72} max={100} showValue />);
      expect(screen.getByText("72%")).toBeInTheDocument();
    });

    it("does not render percentage by default", () => {
      render(<Meter value={72} max={100} />);
      expect(screen.queryByText("72%")).not.toBeInTheDocument();
    });

    it("clamps value below min to 0%", () => {
      render(<Meter value={-10} min={0} max={100} showValue />);
      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    it("clamps value above max to 100%", () => {
      render(<Meter value={150} min={0} max={100} showValue />);
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
  });

  describe("variants", () => {
    it("renders default variant", () => {
      const { container } = render(<Meter value={50} variant="default" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders accent variant", () => {
      const { container } = render(<Meter value={50} variant="accent" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders success variant", () => {
      const { container } = render(<Meter value={50} variant="success" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders error variant", () => {
      const { container } = render(<Meter value={50} variant="error" />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("sizes", () => {
    it("renders sm size", () => {
      const { container } = render(<Meter value={50} size="sm" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders md size", () => {
      const { container } = render(<Meter value={50} size="md" />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to wrapper element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Meter ref={ref} value={50} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <Meter value={72} label="Fuel Load" max={100} showValue />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
