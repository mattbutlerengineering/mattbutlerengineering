import { render, screen } from "@testing-library/react";
import { Handshake } from "./Handshake";

const stations = ["Browser", "Identity", "API"] as const;

const ledClass = (station: Element) => station.querySelector("span")?.className ?? "";

describe("Handshake", () => {
  describe("structure", () => {
    it("renders as an image with the required accessible name", () => {
      render(<Handshake aria-label="Verifying sign-in" stations={stations} />);
      expect(screen.getByRole("img", { name: "Verifying sign-in" })).toBeInTheDocument();
    });

    it("renders one station per name and one leg per gap", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} />);
      expect(container.querySelectorAll("[data-station]")).toHaveLength(3);
      expect(container.querySelectorAll("[data-leg]")).toHaveLength(2);
    });

    it("prints station labels by default and hides them on request", () => {
      const { rerender } = render(<Handshake aria-label="x" stations={stations} />);
      expect(screen.getByText("Identity")).toBeInTheDocument();
      rerender(<Handshake aria-label="x" stations={stations} showLabels={false} />);
      expect(screen.queryByText("Identity")).not.toBeInTheDocument();
    });

    it("hides the decorative track from assistive tech", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} />);
      expect(container.querySelector("[data-track]")).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("state", () => {
    it("defaults to negotiating on lane 0: endpoints lit gold and pulsing, the rest neutral", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} />);
      expect(container.firstElementChild).toHaveAttribute("data-state", "negotiating");
      const [a, b, c] = Array.from(container.querySelectorAll("[data-station]"));
      expect(ledClass(a!)).toMatch(/accent/);
      expect(ledClass(a!)).toMatch(/pulse/);
      expect(ledClass(b!)).toMatch(/accent/);
      expect(ledClass(c!)).toMatch(/neutral/);
      expect(ledClass(c!)).not.toMatch(/pulse/);
    });

    it("shuttles the credential pulse along the active lane only", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} lane={1} />);
      const legs = Array.from(container.querySelectorAll("[data-leg]"));
      expect(legs[0]!.querySelector("[data-pulse]")).toBeNull();
      expect(legs[1]!.querySelector("[data-pulse]")).not.toBeNull();
      expect(legs[1]).toHaveAttribute("data-active", "true");
    });

    it("clamps an out-of-range lane to the last leg", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} lane={9} />);
      const legs = Array.from(container.querySelectorAll("[data-leg]"));
      expect(legs[1]!.querySelector("[data-pulse]")).not.toBeNull();
    });

    it("idle: every LED is off and no pulse is in flight", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} state="idle" />);
      for (const station of container.querySelectorAll("[data-station]")) {
        expect(ledClass(station)).toMatch(/off/);
      }
      expect(container.querySelector("[data-pulse]")).toBeNull();
    });

    it("settled: every LED reads success and no pulse is in flight", () => {
      const { container } = render(
        <Handshake aria-label="x" stations={stations} state="settled" />
      );
      for (const station of container.querySelectorAll("[data-station]")) {
        expect(ledClass(station)).toMatch(/success/);
      }
      expect(container.querySelector("[data-pulse]")).toBeNull();
    });

    it("failed: the active lane's endpoints read danger, the rest neutral", () => {
      const { container } = render(
        <Handshake aria-label="x" stations={stations} state="failed" lane={1} />
      );
      const [a, b, c] = Array.from(container.querySelectorAll("[data-station]"));
      expect(ledClass(a!)).toMatch(/neutral/);
      expect(ledClass(b!)).toMatch(/danger/);
      expect(ledClass(c!)).toMatch(/danger/);
      expect(container.querySelector("[data-pulse]")).toBeNull();
    });

    it("exposes each station's LED variant for styling", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} />);
      const [a, , c] = Array.from(container.querySelectorAll("[data-station]"));
      expect(a).toHaveAttribute("data-variant", "accent");
      expect(c).toHaveAttribute("data-variant", "neutral");
    });
  });

  describe("size", () => {
    it("applies md by default", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} />);
      expect(container.firstElementChild?.className).toMatch(/sizeMd/);
    });

    it("applies sm and lg presets", () => {
      const { container, rerender } = render(
        <Handshake aria-label="x" stations={stations} size="sm" />
      );
      expect(container.firstElementChild?.className).toMatch(/sizeSm/);
      rerender(<Handshake aria-label="x" stations={stations} size="lg" />);
      expect(container.firstElementChild?.className).toMatch(/sizeLg/);
    });
  });

  describe("reduced motion", () => {
    it("flags the reduced-motion branch (setup.ts mocks useReducedMotion to true)", () => {
      const { container } = render(<Handshake aria-label="x" stations={stations} />);
      expect(container.firstElementChild).toHaveAttribute("data-reduced-motion", "true");
      expect(container.firstElementChild?.className).toMatch(/reduced/);
    });
  });

  describe("className and ref", () => {
    it("forwards className and ref to the root", () => {
      const ref = { current: null as HTMLDivElement | null };
      const { container } = render(
        <Handshake aria-label="x" stations={stations} className="custom" ref={ref} />
      );
      expect(container.firstElementChild?.className).toMatch(/custom/);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
