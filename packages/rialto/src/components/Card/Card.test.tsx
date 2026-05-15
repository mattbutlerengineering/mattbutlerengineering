import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText("Card content")).toBeInTheDocument();
    });

    it("renders title when provided", () => {
      render(<Card title="Session Data" />);
      expect(screen.getByText("Session Data")).toBeInTheDocument();
    });

    it("renders subtitle when provided", () => {
      render(<Card title="Title" subtitle="Subtitle text" />);
      expect(screen.getByText("Subtitle text")).toBeInTheDocument();
    });

    it("renders both title and subtitle together", () => {
      render(<Card title="T" subtitle="S" />);
      expect(screen.getByText("T")).toBeInTheDocument();
      expect(screen.getByText("S")).toBeInTheDocument();
    });

    it("does not render header when no title or subtitle", () => {
      const { container } = render(<Card>Body</Card>);
      expect(container.querySelector('[class*="header"]')).not.toBeInTheDocument();
    });
  });

  describe("variants", () => {
    it("defaults to elevated variant", () => {
      const { container } = render(<Card>Elevated</Card>);
      const el = container.firstElementChild;
      expect(el?.className).toMatch(/card/);
    });

    it("applies glass variant class", () => {
      const { container } = render(<Card variant="glass">Glass</Card>);
      expect(container.firstElementChild?.className).toMatch(/glass/);
    });

    it("applies flat variant class", () => {
      const { container } = render(<Card variant="flat">Flat</Card>);
      expect(container.firstElementChild?.className).toMatch(/flat/);
    });
  });

  describe("tilt prop", () => {
    it("does not set data-tilt when tilt is false (default)", () => {
      const { container } = render(<Card>No tilt</Card>);
      expect(container.firstElementChild).not.toHaveAttribute("data-tilt");
    });

    it("sets data-tilt when tilt is true and variant is elevated", () => {
      const { container } = render(<Card tilt>Tilt</Card>);
      expect(container.firstElementChild).toHaveAttribute("data-tilt");
    });

    it("does not set data-tilt for glass variant even with tilt=true", () => {
      const { container } = render(
        <Card tilt variant="glass">
          No tilt glass
        </Card>
      );
      expect(container.firstElementChild).not.toHaveAttribute("data-tilt");
    });
  });

  describe("className and ref", () => {
    it("forwards additional className", () => {
      const { container } = render(<Card className="custom-card">Card</Card>);
      expect(container.firstElementChild?.className).toMatch(/custom-card/);
    });

    it("forwards ref to the div element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Card ref={ref}>Ref</Card>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("slots", () => {
    it("renders multiple children correctly", () => {
      render(
        <Card>
          <p>First</p>
          <p>Second</p>
        </Card>
      );
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
    });
  });

  describe("tilt with flat variant", () => {
    it("sets data-tilt when tilt is true and variant is flat", () => {
      const { container } = render(
        <Card tilt variant="flat">
          Tilt flat
        </Card>
      );
      expect(container.firstElementChild).toHaveAttribute("data-tilt");
    });
  });

  describe("title only (no subtitle)", () => {
    it("renders header with only a title and no subtitle element", () => {
      const { container } = render(<Card title="Only title" />);
      expect(container.querySelector('[class*="title"]')).toBeInTheDocument();
      expect(container.querySelector('[class*="subtitle"]')).not.toBeInTheDocument();
    });
  });

  describe("subtitle only (no title)", () => {
    it("renders header when only subtitle is provided", () => {
      const { container } = render(<Card subtitle="Only subtitle" />);
      expect(container.querySelector('[class*="header"]')).toBeInTheDocument();
      expect(container.querySelector('[class*="subtitle"]')).toBeInTheDocument();
    });
  });
});
