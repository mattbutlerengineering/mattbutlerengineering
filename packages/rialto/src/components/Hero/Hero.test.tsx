import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Hero } from "./Hero";

describe("Hero", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      render(<Hero title="Welcome" />);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    });

    it("renders title text", () => {
      render(<Hero title="Precision meets warmth" />);
      expect(screen.getByText("Precision meets warmth")).toBeInTheDocument();
    });

    it("renders eyebrow when provided", () => {
      render(<Hero title="Title" eyebrow="Design System" />);
      expect(screen.getByText("Design System")).toBeInTheDocument();
    });

    it("does not render eyebrow when not provided", () => {
      render(<Hero title="Title" />);
      expect(screen.queryByText("Design System")).not.toBeInTheDocument();
    });

    it("renders subtitle when provided", () => {
      render(
        <Hero
          title="Title"
          subtitle="A premium component library."
        />
      );
      expect(screen.getByText("A premium component library.")).toBeInTheDocument();
    });

    it("renders actions when provided", () => {
      render(
        <Hero title="Title" actions={<button>Get Started</button>} />
      );
      expect(screen.getByRole("button", { name: "Get Started" })).toBeInTheDocument();
    });

    it("renders as a section element", () => {
      const { container } = render(<Hero title="Title" />);
      expect(container.querySelector("section")).toBeInTheDocument();
    });

    it("renders divider by default", () => {
      const { container } = render(<Hero title="Title" />);
      expect(container.querySelector("hr")).toBeInTheDocument();
    });

    it("hides divider when showDivider=false", () => {
      const { container } = render(<Hero title="Title" showDivider={false} />);
      expect(container.querySelector("hr")).not.toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(<Hero title="Title" className="custom-hero" />);
      expect(container.querySelector(".custom-hero")).toBeInTheDocument();
    });

    it("renders ReactNode title (with accent span)", () => {
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

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <Hero
          eyebrow="Design System"
          title="Precision meets warmth"
          subtitle="A component library."
          actions={<button>Get started</button>}
        />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });

    it("forwards aria-label to section", () => {
      render(<Hero title="Title" aria-label="Hero section" />);
      expect(
        screen.getByRole("region", { name: "Hero section" })
      ).toBeInTheDocument();
    });
  });
});
