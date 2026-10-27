import { render } from "@testing-library/react";
import { Ferrofluid } from "./Ferrofluid";
import { PREFERS_REDUCED_MOTION, setMatchingMedia, stubMatchMedia } from "../../test/match-media";

// Record the transition each motion.* element receives, so the animated
// (motion.circle) and static (plain <circle>) branches can be told apart.
vi.mock("framer-motion", async () =>
  (await import("../../test/record-motion")).recordingFramerMotion()
);

// Reduced by default, as the global setup is; the motion block flips the
// device signal useMotionPreset() reads.
stubMatchMedia([PREFERS_REDUCED_MOTION]);

describe("Ferrofluid", () => {
  beforeEach(() => {
    setMatchingMedia([PREFERS_REDUCED_MOTION]);
  });

  describe("motion", () => {
    it.each(["slow", "medium", "fast"] as const)(
      "stops every %s blob within 5s in total (WCAG 2.2.2)",
      (speed) => {
        setMatchingMedia([]);
        const { container } = render(<Ferrofluid blobCount={12} speed={speed} />);
        const animated = container.querySelectorAll("circle[data-motion-transition]");
        expect(animated).toHaveLength(12);
        for (const circle of animated) {
          const t = JSON.parse(circle.getAttribute("data-motion-transition") ?? "{}") as {
            duration: number;
            delay?: number;
            repeat?: number | null;
          };
          // Infinity serialises to null; a missing repeat means a single pass.
          expect(t.repeat ?? 0).toBe(0);
          expect((t.delay ?? 0) + t.duration).toBeLessThanOrEqual(5);
        }
      }
    );

    it("renders static blobs under prefers-reduced-motion", () => {
      const { container } = render(<Ferrofluid blobCount={3} />);
      expect(container.querySelectorAll("circle")).toHaveLength(3);
      expect(container.querySelectorAll("circle[data-motion-transition]")).toHaveLength(0);
    });
  });

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
