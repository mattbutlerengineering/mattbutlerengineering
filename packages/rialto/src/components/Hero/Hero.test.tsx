import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Hero } from "./Hero";

describe("Hero", () => {
  describe("rendering", () => {
    it("renders the title", () => {
      render(<Hero title="Welcome to Rialto" />);
      expect(screen.getByRole("heading", { name: /welcome to rialto/i })).toBeInTheDocument();
    });

    it("renders eyebrow text when provided", () => {
      render(<Hero title="Hello" eyebrow="Design System" />);
      expect(screen.getByText("Design System")).toBeInTheDocument();
    });

    it("does not render eyebrow when not provided", () => {
      const { container } = render(<Hero title="Hello" />);
      expect(container.querySelector("p")).not.toBeInTheDocument();
    });

    it("renders subtitle when provided", () => {
      render(<Hero title="Hello" subtitle="A premium design library." />);
      expect(screen.getByText("A premium design library.")).toBeInTheDocument();
    });

    it("renders actions slot when provided", () => {
      render(<Hero title="Hello" actions={<button type="button">Get started</button>} />);
      expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    });

    it("renders divider by default", () => {
      const { container } = render(<Hero title="Hello" />);
      expect(container.querySelector("hr")).toBeInTheDocument();
    });

    it("hides divider when showDivider=false", () => {
      const { container } = render(<Hero title="Hello" showDivider={false} />);
      expect(container.querySelector("hr")).not.toBeInTheDocument();
    });

    it("renders title as ReactNode with accent span", () => {
      render(
        <Hero
          title={
            <>
              Precision meets <span className="accent">warmth</span>
            </>
          }
        />
      );
      expect(screen.getByText("warmth")).toBeInTheDocument();
    });
  });

  describe("LCP entrance (#4847)", () => {
    // The title is Hero's largest-contentful-paint candidate on marketing
    // pages. Fading it in from opacity:0 means it doesn't paint until the
    // entrance animation settles, which directly delays LCP. The title must
    // be visible at first paint; only its position (transform) may animate.
    it("renders the title at full opacity on mount, not faded from 0", () => {
      const { container } = render(<Hero title="Ships itself" />);
      const heading = container.querySelector("h1") as HTMLElement;
      expect(heading).not.toHaveStyle({ opacity: "0" });
    });

    it("still animates the title's entrance via transform", () => {
      const { container } = render(<Hero title="Ships itself" />);
      const heading = container.querySelector("h1") as HTMLElement;
      expect(heading.style.transform).toContain("translateY");
    });

    it("keeps the fade-up entrance on non-LCP siblings (eyebrow)", () => {
      const { container } = render(<Hero title="Ships itself" eyebrow="Design System" />);
      const eyebrow = container.querySelector("p") as HTMLElement;
      expect(eyebrow).toHaveStyle({ opacity: "0" });
    });
  });

  describe("layout and props", () => {
    it("renders as a section element", () => {
      const { container } = render(<Hero title="Hello" />);
      expect(container.querySelector("section")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(<Hero title="Hello" className="custom-hero" />);
      expect(container.firstChild).toHaveClass("custom-hero");
    });

    it("applies aria-label when provided", () => {
      const { container } = render(<Hero title="Hello" aria-label="Page hero section" />);
      const section = container.querySelector("section");
      expect(section).toHaveAttribute("aria-label", "Page hero section");
    });

    it("applies custom minHeight style", () => {
      const { container } = render(<Hero title="Hello" minHeight="50vh" />);
      const section = container.firstChild as HTMLElement;
      expect(section.style.minHeight).toBe("50vh");
    });

    it("forwards ref to section element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<Hero ref={ref} title="Hello" />);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations", async () => {
      const { container } = render(
        <Hero
          title="Welcome"
          eyebrow="Design System"
          subtitle="A library for premium products."
          actions={<button type="button">Get started</button>}
        />
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});
