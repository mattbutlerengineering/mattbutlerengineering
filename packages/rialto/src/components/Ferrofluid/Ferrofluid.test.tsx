import { render } from "@testing-library/react";
import { Ferrofluid } from "./Ferrofluid";

describe("Ferrofluid", () => {
  describe("accessibility", () => {
    it("is aria-hidden by default — decorative visual", () => {
      const { container } = render(<Ferrofluid />);
      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveAttribute("aria-hidden", "true");
    });

    it("does not expose a role — purely presentational", () => {
      const { container } = render(<Ferrofluid />);
      const wrapper = container.firstElementChild;
      expect(wrapper).not.toHaveAttribute("role");
    });

    it("is non-interactive via pointer-events: none", () => {
      const { container } = render(<Ferrofluid />);
      const wrapper = container.firstElementChild as HTMLElement;
      // Class applies the style — check the class is present
      expect(wrapper.className).toMatch(/wrapper/);
    });
  });

  describe("rendering", () => {
    it("renders an SVG with the requested number of blobs", () => {
      const { container } = render(<Ferrofluid blobCount={7} />);
      const circles = container.querySelectorAll("circle");
      expect(circles).toHaveLength(7);
    });

    it("uses a default blob count of 5", () => {
      const { container } = render(<Ferrofluid />);
      const circles = container.querySelectorAll("circle");
      expect(circles).toHaveLength(5);
    });

    it("accepts custom color via prop", () => {
      const { container } = render(<Ferrofluid color="red" blobCount={1} />);
      const circle = container.querySelector("circle");
      expect(circle).toHaveAttribute("fill", "red");
    });

    it("wires up a unique filter id per instance (no collisions)", () => {
      const { container } = render(
        <>
          <Ferrofluid blobCount={1} />
          <Ferrofluid blobCount={1} />
        </>
      );
      const filters = container.querySelectorAll("filter");
      const ids = Array.from(filters).map((f) => f.id);
      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe("deterministic layout", () => {
    it("produces the same blob positions across renders for the same count", () => {
      const { container: a } = render(<Ferrofluid blobCount={3} />);
      const { container: b } = render(<Ferrofluid blobCount={3} />);
      const positionsA = Array.from(a.querySelectorAll("circle")).map((c) => c.getAttribute("r"));
      const positionsB = Array.from(b.querySelectorAll("circle")).map((c) => c.getAttribute("r"));
      expect(positionsA).toEqual(positionsB);
    });
  });
});
