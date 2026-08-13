import { render, screen, act } from "@testing-library/react";
import { createRef } from "react";
import { axe } from "vitest-axe";
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

    it("names the role=status live region with the aria-label (not the nameless wrapper)", () => {
      render(<Odometer value={128540} locale="en-US" aria-label="Total signups" />);
      // The accessible name must sit on the role="status" live region itself —
      // a screen reader announces "Total signups" alongside the value, not an
      // anonymous status update. The label must NOT rely on the role-less
      // wrapper, whose aria-label assistive tech ignores.
      const live = screen.getByRole("status", { name: "Total signups" });
      expect(live).toHaveTextContent("128,540");
    });

    it("forwards aria-labelledby to the live region", () => {
      render(
        <>
          <span id="odometer-label">Signups</span>
          <Odometer value={7} locale="en-US" aria-labelledby="odometer-label" />
        </>
      );
      expect(screen.getByRole("status", { name: "Signups" })).toHaveTextContent("7");
    });

    it("keeps the wrapper's aria-label with role=status as a descendant (StatRow binding contract)", () => {
      // apps/hospitality StatRow binds value->label via getByLabel(wrapper)
      // .getByRole('status'); the status region must remain a descendant of the
      // aria-labelled wrapper. Guard that DOM contract here.
      const { container } = render(
        <Odometer value={3} locale="en-US" aria-label="Today's Reservations" />
      );
      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveAttribute("aria-label", "Today's Reservations");
      const status = wrapper?.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(status).toHaveTextContent("3");
    });

    it("names TWO nodes, so consumers must scope by role rather than by label", () => {
      // The two tests above are both intentional, and together they mean the
      // accessible name appears on the role-less wrapper AND on the
      // role="status" region. A query by name alone therefore matches two
      // elements, which is a Playwright strict-mode failure in E2E.
      //
      // This bit the venue journey the moment it got far enough to assert on
      // the dashboard: `getByLabel("Today's Reservations")` resolved to 2
      // elements. apps/hospitality's StatRow unit tests mock Odometer down to
      // a single node, so nothing below the E2E layer could catch it.
      //
      // If a future change makes the name single-sourced, this test fails and
      // the E2E locators that rely on `getByRole("status", { name })` should
      // be revisited at the same time.
      render(<Odometer value={3} locale="en-US" aria-label="Today's Reservations" />);

      expect(screen.getAllByLabelText("Today's Reservations")).toHaveLength(2);
      expect(screen.getByRole("status", { name: "Today's Reservations" })).toHaveTextContent("3");
    });

    it("has no axe violations when labeled", async () => {
      const { container } = render(
        <Odometer value={128540} locale="en-US" aria-label="Total signups" />
      );
      // color-contrast is disabled in jsdom (see setup.ts); token-contrast
      // is covered separately.
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
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
