import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Slider } from "./Slider";

describe("Slider", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<Slider />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders as a range input for accessibility", () => {
      render(<Slider aria-label="Volume" />);
      expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
    });

    it("renders label when provided", () => {
      render(<Slider label="Volume" />);
      expect(screen.getByText("Volume")).toBeInTheDocument();
    });

    it("renders current value when showValue=true", () => {
      render(<Slider label="Volume" value={50} onChange={() => {}} showValue />);
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("renders formatted value", () => {
      render(
        <Slider
          label="Opacity"
          value={75}
          onChange={() => {}}
          showValue
          formatValue={(v) => `${v}%`}
        />
      );
      expect(screen.getByText("75%")).toBeInTheDocument();
    });

    it("sets min/max/step on input", () => {
      render(
        <Slider
          label="Volume"
          min={0}
          max={200}
          step={10}
          value={100}
          onChange={() => {}}
        />
      );
      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("min", "0");
      expect(slider).toHaveAttribute("max", "200");
      expect(slider).toHaveAttribute("step", "10");
    });

    it("is disabled when disabled=true", () => {
      render(<Slider label="Volume" disabled />);
      expect(screen.getByRole("slider")).toBeDisabled();
    });
  });

  describe("controlled mode", () => {
    it("reflects controlled value", () => {
      render(<Slider label="Volume" value={60} onChange={() => {}} />);
      expect(screen.getByRole("slider")).toHaveValue("60");
    });

    it("calls onChange when value changes", () => {
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "75" } });
      expect(onChange).toHaveBeenCalledWith(75);
    });
  });

  describe("keyboard interactions", () => {
    it("ArrowRight increases value by step", () => {
      const onChange = vi.fn();
      render(
        <Slider label="Volume" value={50} onChange={onChange} step={5} />
      );
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(onChange).toHaveBeenCalledWith(55);
    });

    it("ArrowLeft decreases value by step", () => {
      const onChange = vi.fn();
      render(
        <Slider label="Volume" value={50} onChange={onChange} step={5} />
      );
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      expect(onChange).toHaveBeenCalledWith(45);
    });

    it("ArrowUp increases value by step", () => {
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} onChange={onChange} step={1} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowUp" });
      expect(onChange).toHaveBeenCalledWith(51);
    });

    it("ArrowDown decreases value by step", () => {
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} onChange={onChange} step={1} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowDown" });
      expect(onChange).toHaveBeenCalledWith(49);
    });

    it("Home sets value to min", () => {
      const onChange = vi.fn();
      render(
        <Slider label="Volume" value={50} onChange={onChange} min={0} max={100} />
      );
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "Home" });
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it("End sets value to max", () => {
      const onChange = vi.fn();
      render(
        <Slider label="Volume" value={50} onChange={onChange} min={0} max={100} />
      );
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "End" });
      expect(onChange).toHaveBeenCalledWith(100);
    });
  });

  describe("uncontrolled mode", () => {
    it("works with defaultValue", () => {
      render(<Slider label="Volume" defaultValue={42} />);
      expect(screen.getByRole("slider")).toHaveValue("42");
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <Slider label="Volume" value={50} onChange={() => {}} showValue />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
