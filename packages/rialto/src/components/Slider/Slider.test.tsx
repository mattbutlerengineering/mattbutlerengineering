import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Slider } from "./Slider";

describe("Slider", () => {
  describe("rendering", () => {
    it("renders a range input", () => {
      render(<Slider aria-label="Volume" />);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("renders label text when label prop provided", () => {
      render(<Slider label="Volume" />);
      expect(screen.getByText("Volume")).toBeInTheDocument();
    });

    it("shows current value when showValue is true", () => {
      render(<Slider label="Volume" value={42} onChange={vi.fn()} showValue />);
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("uses formatValue for displayed value", () => {
      render(
        <Slider
          label="Opacity"
          value={75}
          onChange={vi.fn()}
          showValue
          formatValue={(v) => `${v}%`}
        />
      );
      expect(screen.getByText("75%")).toBeInTheDocument();
    });

    it("renders disabled range input when disabled", () => {
      render(<Slider label="Brightness" disabled />);
      expect(screen.getByRole("slider")).toBeDisabled();
    });
  });

  describe("aria attributes", () => {
    it("sets aria-valuemin, aria-valuemax, aria-valuenow", () => {
      render(<Slider label="Volume" min={0} max={100} value={50} onChange={vi.fn()} />);
      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("aria-valuemin", "0");
      expect(slider).toHaveAttribute("aria-valuemax", "100");
      expect(slider).toHaveAttribute("aria-valuenow", "50");
    });

    it("uses aria-label prop for accessible label", () => {
      render(<Slider aria-label="Custom label" />);
      expect(screen.getByRole("slider")).toHaveAttribute("aria-label", "Custom label");
    });

    it("sets min/max/step on input", () => {
      render(<Slider label="Volume" min={0} max={200} step={10} value={100} onChange={() => {}} />);
      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("min", "0");
      expect(slider).toHaveAttribute("max", "200");
      expect(slider).toHaveAttribute("step", "10");
    });
  });

  describe("controlled value", () => {
    it("reflects controlled value in range input", () => {
      render(<Slider value={30} min={0} max={100} onChange={vi.fn()} aria-label="Slider" />);
      expect(screen.getByRole("slider")).toHaveValue("30");
    });

    it("calls onChange when value changes via keyboard", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} min={0} max={100} step={1} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      slider.focus();
      await user.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith(51);
    });

    it("calls onChange with decremented value on ArrowLeft", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} min={0} max={100} step={1} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      slider.focus();
      await user.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith(49);
    });

    it("jumps to min on Home key", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} min={0} max={100} onChange={onChange} />);
      screen.getByRole("slider").focus();
      await user.keyboard("{Home}");
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it("jumps to max on End key", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} min={0} max={100} onChange={onChange} />);
      screen.getByRole("slider").focus();
      await user.keyboard("{End}");
      expect(onChange).toHaveBeenCalledWith(100);
    });
  });

  describe("uncontrolled mode", () => {
    it("uses defaultValue as initial value", () => {
      render(<Slider defaultValue={25} min={0} max={100} aria-label="Slider" />);
      expect(screen.getByRole("slider")).toHaveValue("25");
    });

    it("falls back to min when no defaultValue provided", () => {
      render(<Slider min={10} max={100} aria-label="Slider" />);
      expect(screen.getByRole("slider")).toHaveValue("10");
    });
  });

  describe("step", () => {
    it("increments by step on ArrowRight", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Slider label="Opacity" value={0} min={0} max={100} step={10} onChange={onChange} />);
      screen.getByRole("slider").focus();
      await user.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith(10);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Slider ref={ref} aria-label="Slider" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations", async () => {
      const { container } = render(
        <Slider label="Volume" value={50} onChange={() => {}} showValue />
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});
