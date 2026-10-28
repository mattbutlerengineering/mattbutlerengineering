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
    it("flags the reduced-motion branch (setup.ts reports prefers-reduced-motion)", () => {
      const { container } = render(<NeonSign state="open" aria-label="x" />);
      expect(container.firstElementChild).toHaveAttribute("data-reduced-motion", "true");
      expect(container.firstElementChild?.className).toMatch(/reduced/);
    });
  });

  describe("shape", () => {
    const SHAPES = ["swoosh", "boxed", "vertical", "arrow", "banner", "vintage"] as const;
    /** The decorative elements each shape draws besides the word. */
    const PARTS: Readonly<Record<(typeof SHAPES)[number], readonly string[]>> = {
      swoosh: ["ring"],
      boxed: ["frame"],
      vertical: ["frame", "star", "star"],
      arrow: ["frame", "arrow"],
      banner: ["lead"],
      vintage: ["rails"],
    };
    const tubes = (c: HTMLElement) => [...c.querySelectorAll("[data-tube]")];

    it("defaults to classic with the original single OPEN tube and no frame parts", () => {
      const { container } = render(<NeonSign state="open" aria-label="x" />);
      expect(container.firstElementChild).toHaveAttribute("data-shape", "classic");
      expect(tubes(container)).toHaveLength(1);
      expect(container.querySelector("[data-part]")).toBeNull();
      expect(container.querySelector("[data-word-tone]")).toBeNull();
    });

    it.each(SHAPES)("%s sets data-shape and still spells OPEN once", (shape) => {
      const { container } = render(<NeonSign state="open" aria-label="x" shape={shape} />);
      expect(container.firstElementChild).toHaveAttribute("data-shape", shape);
      const words = container.querySelectorAll('[data-part="word"]');
      expect(words).toHaveLength(1);
      expect(words[0]).toHaveTextContent("OPEN");
    });

    it.each(SHAPES)("%s renders its frame elements", (shape) => {
      const { container } = render(<NeonSign state="open" aria-label="x" shape={shape} />);
      const parts = [...container.querySelectorAll("[data-part]")]
        .map((el) => el.getAttribute("data-part") as string)
        .filter((p) => p !== "word");
      expect([...parts].sort()).toEqual([...PARTS[shape]].sort());
    });

    it.each(SHAPES)("%s keeps one role=img with the aria-label and hides the rest", (shape) => {
      const { container } = render(<NeonSign state="open" aria-label="Open now" shape={shape} />);
      expect(screen.getAllByRole("img")).toHaveLength(1);
      expect(screen.getByRole("img", { name: "Open now" })).toBeInTheDocument();
      expect(container.querySelector(".housing")).toHaveAttribute("aria-hidden", "true");
      for (const svg of container.querySelectorAll("svg")) {
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(svg).toHaveAttribute("focusable", "false");
      }
    });

    it.each(SHAPES)("%s lights every tube when open and unlights them when closed", (shape) => {
      const { container, rerender } = render(
        <NeonSign state="open" aria-label="x" shape={shape} />
      );
      expect(tubes(container).length).toBeGreaterThan(0);
      for (const t of tubes(container)) expect(t).toHaveAttribute("data-lit", "true");
      rerender(<NeonSign state="opening-soon" aria-label="x" shape={shape} />);
      for (const t of tubes(container)) expect(t).toHaveAttribute("data-lit", "true");
      rerender(<NeonSign state="closed" aria-label="x" shape={shape} />);
      for (const t of tubes(container)) expect(t).toHaveAttribute("data-lit", "false");
      rerender(<NeonSign state="unset" aria-label="x" shape={shape} />);
      for (const t of tubes(container)) expect(t).toHaveAttribute("data-lit", "false");
    });

    it("banner prints the decorative lead line above OPEN", () => {
      const { container } = render(<NeonSign state="open" aria-label="x" shape="banner" />);
      expect(container.querySelector('[data-part="lead"]')).toHaveTextContent("Yes, we're");
    });

    it("vertical places a star at each end", () => {
      const { container } = render(<NeonSign state="open" aria-label="x" shape="vertical" />);
      expect(container.querySelectorAll('[data-part="star"]')).toHaveLength(2);
    });
  });

  describe("tone", () => {
    it("tones the word of a classic sign", () => {
      const { container } = render(
        <NeonSign state="open" aria-label="x" tone={{ word: "purple" }} />
      );
      expect(container.firstElementChild).toHaveAttribute("data-word-tone", "purple");
      expect(container.firstElementChild).not.toHaveAttribute("data-frame-tone");
    });

    it("applies each shape's own default tones when none are given", () => {
      const { container } = render(<NeonSign state="open" aria-label="x" shape="boxed" />);
      expect(container.firstElementChild).toHaveAttribute("data-word-tone", "red");
      expect(container.firstElementChild).toHaveAttribute("data-frame-tone", "blue");
    });

    it("lets the caller override word and frame independently", () => {
      const { container } = render(
        <NeonSign
          state="open"
          aria-label="x"
          shape="swoosh"
          tone={{ word: "green", frame: "orange" }}
        />
      );
      expect(container.firstElementChild).toHaveAttribute("data-word-tone", "green");
      expect(container.firstElementChild).toHaveAttribute("data-frame-tone", "orange");
    });

    it("keeps the default frame tone when only the word is overridden", () => {
      const { container } = render(
        <NeonSign state="open" aria-label="x" shape="boxed" tone={{ word: "pink" }} />
      );
      expect(container.firstElementChild).toHaveAttribute("data-word-tone", "pink");
      expect(container.firstElementChild).toHaveAttribute("data-frame-tone", "blue");
    });

    it("a toned sign that is closed is still unlit", () => {
      const { container } = render(
        <NeonSign state="closed" aria-label="x" shape="boxed" tone={{ word: "red" }} />
      );
      for (const t of container.querySelectorAll("[data-tube]")) {
        expect(t).toHaveAttribute("data-lit", "false");
      }
    });
  });

  describe("reduced motion on the new tubes", () => {
    it.each(["swoosh", "boxed", "vertical", "arrow", "banner", "vintage"] as const)(
      "%s: every tube carries the .tube class the reduced-motion rules silence",
      (shape) => {
        const { container } = render(<NeonSign state="open" aria-label="x" shape={shape} />);
        expect(container.firstElementChild?.className).toMatch(/reduced/);
        for (const t of container.querySelectorAll("[data-tube]")) {
          expect(t.getAttribute("class")).toMatch(/tube/);
        }
      }
    );
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
