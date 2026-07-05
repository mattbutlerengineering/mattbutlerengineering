import { render, screen, act } from "@testing-library/react";
import { createRef } from "react";
import { Odometer } from "./Odometer";

describe("Odometer", () => {
  describe("formatting", () => {
    it("formats an integer with locale grouping", () => {
      render(<Odometer value={1234567} locale="en-US" />);
      expect(screen.getByRole("status")).toHaveTextContent("1,234,567");
    });

    it("honors Intl.NumberFormat options (currency)", () => {
      render(
        <Odometer
          value={1234.5}
          locale="en-US"
          formatOptions={{ style: "currency", currency: "USD" }}
        />
      );
      expect(screen.getByRole("status")).toHaveTextContent("$1,234.50");
    });

    it("renders negative values with a sign", () => {
      render(<Odometer value={-42} locale="en-US" />);
      expect(screen.getByRole("status")).toHaveTextContent("-42");
    });

    it("updates the announced value when the value prop changes", () => {
      const { rerender } = render(<Odometer value={100} locale="en-US" />);
      expect(screen.getByRole("status")).toHaveTextContent("100");
      act(() => {
        rerender(<Odometer value={2500} locale="en-US" />);
      });
      expect(screen.getByRole("status")).toHaveTextContent("2,500");
    });
  });

  describe("composition", () => {
    it("composes SplitFlap — one reel per digit run", () => {
      const { container } = render(<Odometer value={1234} locale="en-US" />);
      // "1,234" -> digit runs "1" and "234" -> two SplitFlap boards (role=img)
      const reels = container.querySelectorAll('[role="img"]');
      expect(reels.length).toBe(2);
    });

    it("renders grouping separators as static glyphs between reels", () => {
      const { container } = render(<Odometer value={1234} locale="en-US" />);
      // The comma is not a SplitFlap cell; it lives in a separator span.
      expect(container.textContent).toContain(",");
    });
  });

  describe("reduced motion", () => {
    // setup.ts mocks framer-motion useReducedMotion => true globally, so this
    // renders the reduced-motion path: the final formatted value, no roll.
    it("renders the final formatted value without rolling", () => {
      render(<Odometer value={9999} locale="en-US" />);
      expect(screen.getByRole("status")).toHaveTextContent("9,999");
    });
  });

  describe("accessibility", () => {
    it("announces the whole number via a single polite, atomic live region", () => {
      render(<Odometer value={42} locale="en-US" />);
      const live = screen.getByRole("status");
      expect(live).toHaveAttribute("aria-live", "polite");
      expect(live).toHaveAttribute("aria-atomic", "true");
      expect(live).toHaveTextContent("42");
    });

    it("hides the per-digit reels from assistive tech", () => {
      const { container } = render(<Odometer value={1234} locale="en-US" />);
      const reelWrap = container.querySelector('[aria-hidden="true"]');
      expect(reelWrap).not.toBeNull();
      // Every SplitFlap reel must sit inside the aria-hidden wrapper so AT
      // never hears per-digit output.
      const reels = container.querySelectorAll('[role="img"]');
      reels.forEach((reel) => {
        expect(reelWrap?.contains(reel)).toBe(true);
      });
    });

    it("forwards a ref to the root element", () => {
      const ref = createRef<HTMLDivElement>();
      render(<Odometer value={7} locale="en-US" ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
