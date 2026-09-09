import { render, screen } from "@testing-library/react";
import { NeonSign, type NeonSignState } from "./NeonSign";

const STATES: readonly NeonSignState[] = ["open", "opening-soon", "closed", "unset"];

describe("NeonSign", () => {
  describe("structure", () => {
    it("renders as an image with the required accessible name and exposes its state", () => {
      render(<NeonSign state="open" aria-label="Open until 10:00 PM" />);
      const sign = screen.getByRole("img", { name: "Open until 10:00 PM" });
      expect(sign).toBeInTheDocument();
      expect(sign).toHaveAttribute("data-state", "open");
    });

    it("hides the housing and the caption from assistive tech", () => {
      const { container } = render(<NeonSign state="open" aria-label="Open until 10:00 PM" />);
      expect(container.querySelector(".housing")).toHaveAttribute("aria-hidden", "true");
      expect(container.querySelector(".caption")).toHaveAttribute("aria-hidden", "true");
    });

    it("prints the accessible name as the caption by default", () => {
      const { container } = render(<NeonSign state="open" aria-label="Open until 10:00 PM" />);
      expect(container.querySelector(".caption")).toHaveTextContent("Open until 10:00 PM");
    });

    it("drops the caption on request without touching the accessible name", () => {
      const { container } = render(
        <NeonSign state="open" aria-label="Open until 10:00 PM" showCaption={false} />
      );
      expect(container.querySelector(".caption")).toBeNull();
      expect(screen.getByRole("img", { name: "Open until 10:00 PM" })).toBeInTheDocument();
    });
  });

  describe("state", () => {
    it.each(STATES)("exposes data-state=%s on the root", (state) => {
      const { container } = render(<NeonSign state={state} aria-label="x" />);
      expect(container.firstElementChild).toHaveAttribute("data-state", state);
    });

    it.each(STATES)("the tube always spells OPEN (%s)", (state) => {
      const { container } = render(<NeonSign state={state} aria-label="x" />);
      expect(container.querySelector("[data-tube]")).toHaveTextContent("OPEN");
    });

    it("lights the tube only while open or opening soon", () => {
      const { container, rerender } = render(<NeonSign state="open" aria-label="x" />);
      const tube = () => container.querySelector("[data-tube]");
      expect(tube()).toHaveAttribute("data-lit", "true");
      rerender(<NeonSign state="opening-soon" aria-label="x" />);
      expect(tube()).toHaveAttribute("data-lit", "true");
      rerender(<NeonSign state="closed" aria-label="x" />);
      expect(tube()).toHaveAttribute("data-lit", "false");
      rerender(<NeonSign state="unset" aria-label="x" />);
      expect(tube()).toHaveAttribute("data-lit", "false");
    });

    it("keeps the tube in the DOM when hours are unset so the footprint never changes", () => {
      const { container } = render(<NeonSign state="unset" aria-label="No operating hours set" />);
      expect(container.querySelector("[data-tube]")).not.toBeNull();
    });
  });

  describe("size", () => {
    it("applies md by default", () => {
      const { container } = render(<NeonSign state="open" aria-label="x" />);
      expect(container.firstElementChild?.className).toMatch(/sizeMd/);
    });

    it("applies sm and lg presets", () => {
      const { container, rerender } = render(<NeonSign state="open" aria-label="x" size="sm" />);
      expect(container.firstElementChild?.className).toMatch(/sizeSm/);
      rerender(<NeonSign state="open" aria-label="x" size="lg" />);
      expect(container.firstElementChild?.className).toMatch(/sizeLg/);
    });
  });

  describe("reduced motion", () => {
    it("flags the reduced-motion branch (setup.ts mocks useReducedMotion to true)", () => {
      const { container } = render(<NeonSign state="open" aria-label="x" />);
      expect(container.firstElementChild).toHaveAttribute("data-reduced-motion", "true");
      expect(container.firstElementChild?.className).toMatch(/reduced/);
    });
  });

  describe("className, ref and rest", () => {
    it("forwards className, ref and extra attributes to the root", () => {
      const ref = { current: null as HTMLDivElement | null };
      const { container } = render(
        <NeonSign state="open" aria-label="x" className="custom" ref={ref} data-testid="sign" />
      );
      expect(container.firstElementChild?.className).toMatch(/custom/);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(screen.getByTestId("sign")).toBe(container.firstElementChild);
    });
  });
});
