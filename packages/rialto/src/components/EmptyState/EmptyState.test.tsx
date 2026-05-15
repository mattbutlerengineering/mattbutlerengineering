import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  describe("rendering", () => {
    it("renders heading when provided", () => {
      render(<EmptyState heading="No results" />);
      expect(screen.getByText("No results")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      render(<EmptyState description="Try adjusting your filters." />);
      expect(screen.getByText("Try adjusting your filters.")).toBeInTheDocument();
    });

    it("renders action slot when provided", () => {
      render(<EmptyState action={<button type="button">Clear filters</button>} />);
      expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    });

    it("renders the default icon when no icon prop is provided", () => {
      const { container } = render(<EmptyState heading="Empty" />);
      // Default icon is an svg
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("renders custom icon when provided", () => {
      render(<EmptyState icon={<span data-testid="custom-icon" />} />);
      expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    });

    it("suppresses icon when icon=null", () => {
      const { container } = render(<EmptyState icon={null} heading="No icon" />);
      expect(container.querySelector("svg")).not.toBeInTheDocument();
    });

    it("renders nothing for absent heading and description", () => {
      render(<EmptyState />);
      // Should not throw; default icon still renders
      const { container } = render(<EmptyState />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
  });

  describe("variant", () => {
    it("does not apply elevated class by default (flat variant)", () => {
      const { container } = render(<EmptyState heading="Empty" />);
      expect(container.firstElementChild?.className).not.toMatch(/elevated/);
    });

    it("applies elevated class when variant=elevated", () => {
      const { container } = render(<EmptyState variant="elevated" heading="Empty" />);
      expect(container.firstElementChild?.className).toMatch(/elevated/);
    });
  });

  describe("size", () => {
    it("does not apply sm class by default", () => {
      const { container } = render(<EmptyState heading="Empty" />);
      expect(container.firstElementChild?.className).not.toMatch(/\bsm\b/);
    });

    it("applies sm class when size=sm", () => {
      const { container } = render(<EmptyState size="sm" heading="Empty" />);
      expect(container.firstElementChild?.className).toMatch(/sm/);
    });
  });

  describe("className and ref", () => {
    it("forwards custom className", () => {
      const { container } = render(<EmptyState className="my-empty" />);
      expect(container.firstElementChild?.className).toMatch(/my-empty/);
    });

    it("forwards ref to the div element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<EmptyState ref={ref} heading="Empty" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("additional coverage", () => {
    it("forwards HTML attributes like data-testid", () => {
      render(<EmptyState data-testid="empty-state" heading="Test" />);
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    it("renders all slots together", () => {
      render(
        <EmptyState
          heading="No results"
          description="Try adjusting your filters."
          action={<button type="button">Reset</button>}
          icon={<span data-testid="icon" />}
        />
      );
      expect(screen.getByText("No results")).toBeInTheDocument();
      expect(screen.getByText("Try adjusting your filters.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
      expect(screen.getByTestId("icon")).toBeInTheDocument();
    });

    it("applies emptyState base CSS class", () => {
      const { container } = render(<EmptyState />);
      expect(container.firstElementChild?.className).toMatch(/emptyState/);
    });

    it("does not render heading paragraph when heading is absent", () => {
      const { container } = render(<EmptyState description="desc" />);
      // Only one p element — the description
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });

    it("does not render description paragraph when description is absent", () => {
      const { container } = render(<EmptyState heading="Title" />);
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });

    it("does not render action wrapper when action is absent", () => {
      const { container } = render(<EmptyState heading="Empty" />);
      expect(container.querySelector("[class*='action']")).not.toBeInTheDocument();
    });

    it("does not render icon wrapper when icon=null", () => {
      const { container } = render(<EmptyState icon={null} />);
      expect(container.querySelector("[class*='icon']")).not.toBeInTheDocument();
    });
  });
});
