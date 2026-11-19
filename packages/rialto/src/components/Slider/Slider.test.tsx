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

    it("moves PageUp and PageDown by the same multiple of step", async () => {
      const user = userEvent.setup();
      render(
        <Slider
          aria-label="Ride height (mm)"
          min={30}
          max={80}
          step={2}
          defaultValue={50}
          showValue
          formatValue={(v) => `${v}mm`}
        />
      );
      const slider = screen.getByRole("slider");
      slider.focus();

      await user.keyboard("{PageUp}");
      expect(slider).toHaveValue("56");
      expect(screen.getByText("56mm")).toBeInTheDocument();

      await user.keyboard("{PageDown}");
      expect(slider).toHaveValue("50");
      expect(screen.getByText("50mm")).toBeInTheDocument();
    });

    it("returns to the minimum when PageDown undoes PageUp from Home", async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Ride height (mm)" min={30} max={80} step={2} defaultValue={50} />);
      const slider = screen.getByRole("slider");
      slider.focus();

      await user.keyboard("{Home}");
      expect(slider).toHaveValue("30");
      await user.keyboard("{PageUp}");
      expect(slider).toHaveValue("36");
      await user.keyboard("{PageDown}");
      expect(slider).toHaveValue("30");
    });

    it("keeps PageUp and PageDown symmetric when 10% of the range is a half step", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Slider aria-label="Offset" min={1} max={51} step={2} value={25} onChange={onChange} />
      );
      const slider = screen.getByRole("slider");
      slider.focus();

      await user.keyboard("{PageUp}");
      expect(onChange).toHaveBeenCalledWith(31);

      onChange.mockClear();
      slider.focus();
      await user.keyboard("{PageDown}");
      // Controlled value is still 25, so PageDown is the mirror of PageUp.
      expect(onChange).toHaveBeenCalledWith(19);
    });

    it("still moves one step on the arrow keys when a page step is larger", async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Ride height (mm)" min={30} max={80} step={2} defaultValue={50} />);
      const slider = screen.getByRole("slider");
      slider.focus();
      await user.keyboard("{ArrowRight}");
      expect(slider).toHaveValue("52");
      await user.keyboard("{ArrowLeft}");
      expect(slider).toHaveValue("50");
    });

    it("clamps a page step that would leave the range", async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Ride height (mm)" min={30} max={80} step={2} defaultValue={76} />);
      const slider = screen.getByRole("slider");
      slider.focus();
      await user.keyboard("{PageUp}");
      expect(slider).toHaveValue("80");
      await user.keyboard("{Home}{PageDown}");
      expect(slider).toHaveValue("30");
    });

    it("uses 10% of the range when that distance is already a multiple of step", async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Volume" min={0} max={100} step={5} defaultValue={50} />);
      const slider = screen.getByRole("slider");
      slider.focus();
      await user.keyboard("{PageUp}");
      expect(slider).toHaveValue("60");
      await user.keyboard("{PageDown}");
      expect(slider).toHaveValue("50");
    });

    it("moves at least one step when step is larger than 10% of the range", async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Coarse" min={0} max={100} step={40} defaultValue={40} />);
      const slider = screen.getByRole("slider");
      slider.focus();
      await user.keyboard("{PageUp}");
      expect(slider).toHaveValue("80");
      await user.keyboard("{PageDown}");
      expect(slider).toHaveValue("40");
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

  it("does not emit 'undefined' in wrapper className", () => {
    const { container } = render(<Slider label="Volume" />);
    expect(container.firstElementChild?.className).not.toMatch(/undefined/);
  });
});
