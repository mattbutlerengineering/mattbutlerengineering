import { render, screen } from "@testing-library/react";
import { Divider } from "./Divider";

describe("Divider", () => {
  describe("rendering", () => {
    it("renders with role=separator", () => {
      render(<Divider />);
      expect(screen.getByRole("separator")).toBeInTheDocument();
    });

    it("has aria-orientation=horizontal by default", () => {
      render(<Divider />);
      expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
    });

    it("has aria-orientation=vertical when orientation=vertical", () => {
      render(<Divider orientation="vertical" />);
      expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
    });

    it("applies horizontal class by default", () => {
      const { container } = render(<Divider />);
      expect(container.firstElementChild?.className).toMatch(/horizontal/);
    });

    it("applies vertical class when orientation=vertical", () => {
      const { container } = render(<Divider orientation="vertical" />);
      expect(container.firstElementChild?.className).toMatch(/vertical/);
    });
  });

  describe("label", () => {
    it("renders label text when provided", () => {
      render(<Divider label="Or" />);
      expect(screen.getByText("Or")).toBeInTheDocument();
    });

    it("does not render label span when label is absent", () => {
      const { container } = render(<Divider />);
      expect(container.querySelector("span")).not.toBeInTheDocument();
    });
  });

  describe("accent", () => {
    it("applies accent class when accent=true", () => {
      const { container } = render(<Divider accent />);
      expect(container.firstElementChild?.className).toMatch(/accent/);
    });

    it("does not apply accent class by default", () => {
      const { container } = render(<Divider />);
      expect(container.firstElementChild?.className).not.toMatch(/accent/);
    });
  });

  describe("spacing", () => {
    it("applies compact class when spacing=compact", () => {
      const { container } = render(<Divider spacing="compact" />);
      expect(container.firstElementChild?.className).toMatch(/compact/);
    });

    it("applies spacious class when spacing=spacious", () => {
      const { container } = render(<Divider spacing="spacious" />);
      expect(container.firstElementChild?.className).toMatch(/spacious/);
    });

    it("does not apply extra spacing class for default spacing", () => {
      const { container } = render(<Divider spacing="default" />);
      expect(container.firstElementChild?.className).not.toMatch(/compact/);
      expect(container.firstElementChild?.className).not.toMatch(/spacious/);
    });
  });

  describe("className and ref", () => {
    it("forwards custom className", () => {
      const { container } = render(<Divider className="my-divider" />);
      expect(container.firstElementChild?.className).toMatch(/my-divider/);
    });

    it("forwards ref to the div element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Divider ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
