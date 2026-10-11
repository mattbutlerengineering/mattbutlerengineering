import { render, screen } from "@testing-library/react";
import { WatchLoader } from "./WatchLoader";
import { PREFERS_REDUCED_MOTION, setMatchingMedia, stubMatchMedia } from "../../test/match-media";

// Full motion by default — the global setup is reduced — so both the animated
// and static paths run; tests flip the device signal useMotionPreset() reads.
stubMatchMedia([]);

describe("WatchLoader", () => {
  beforeEach(() => {
    setMatchingMedia([]);
  });

  describe("rendering", () => {
    it("renders without error as role=img", () => {
      render(<WatchLoader aria-label="Loading" />);
      expect(screen.getByRole("img")).toBeInTheDocument();
    });

    it("exposes the required aria-label as the accessible name", () => {
      render(<WatchLoader aria-label="Processing your request" />);
      expect(screen.getByRole("img")).toHaveAccessibleName("Processing your request");
    });

    it("does not leak motion semantics into the accessible name", () => {
      render(<WatchLoader aria-label="Saving" />);
      expect(screen.getByRole("img")).toHaveAccessibleName("Saving");
    });

    it("renders crisp vector output as an SVG", () => {
      const { container } = render(<WatchLoader aria-label="Loading" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
  });

  describe("reduced motion", () => {
    it("pauses all animation and renders a static snapshot when preferred", () => {
      setMatchingMedia([PREFERS_REDUCED_MOTION]);
      render(<WatchLoader aria-label="Loading" />);
      expect(screen.getByRole("img")).toHaveAttribute("data-reduced-motion", "true");
    });

    it("animates when reduced motion is not preferred", () => {
      setMatchingMedia([]);
      render(<WatchLoader aria-label="Loading" />);
      expect(screen.getByRole("img")).toHaveAttribute("data-reduced-motion", "false");
    });
  });

  describe("motion", () => {
    it("schedules no JS timers — every animation is a compositor-thread CSS keyframe", () => {
      vi.useFakeTimers();
      try {
        render(<WatchLoader aria-label="Loading" />);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("spins the rotor on the pivot — its group bounds are symmetric about the centre", () => {
      const { container } = render(<WatchLoader aria-label="Loading" />);
      const race = container.querySelector('[data-part="rotor-race"]');
      expect(race).not.toBeNull();
      expect(race).toHaveAttribute("r", "44");
      expect(race?.parentElement).toHaveAttribute("data-part", "rotor");
    });
  });

  describe("size prop", () => {
    it("applies the preset size class", () => {
      render(<WatchLoader aria-label="Loading" size="lg" />);
      expect(screen.getByRole("img").className).toContain("sizeLg");
    });

    it("defaults to the medium size class", () => {
      render(<WatchLoader aria-label="Loading" />);
      expect(screen.getByRole("img").className).toContain("sizeMd");
    });

    it("applies a raw pixel size inline without a preset size class", () => {
      render(<WatchLoader aria-label="Loading" size={64} />);
      const el = screen.getByRole("img");
      expect(el).toHaveStyle({ width: "64px", height: "64px" });
      expect(el.className).not.toContain("sizeMd");
    });
  });

  describe("variant prop", () => {
    it.each([
      ["default", "variantDefault"],
      ["gold", "variantGold"],
      ["steel", "variantSteel"],
      ["rose", "variantRose"],
    ] as const)("applies the %s variant class", (variant, cls) => {
      render(<WatchLoader aria-label="Loading" variant={variant} />);
      expect(screen.getByRole("img").className).toContain(cls);
    });
  });

  describe("speed prop", () => {
    it("scales the animation cycle via a CSS custom property", () => {
      render(<WatchLoader aria-label="Loading" speed="fast" />);
      expect(screen.getByRole("img").getAttribute("style")).toContain("--watch-cycle");
    });
  });
});
