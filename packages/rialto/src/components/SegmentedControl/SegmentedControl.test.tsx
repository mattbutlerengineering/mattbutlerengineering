import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { SegmentedControl, type Segment } from "./SegmentedControl";

const segments: Segment[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const withDisabled: Segment[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta", disabled: true },
  { id: "c", label: "Gamma" },
];

describe("SegmentedControl", () => {
  describe("rendering", () => {
    it("renders a radiogroup", () => {
      render(<SegmentedControl segments={segments} value="day" onChange={vi.fn()} />);
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    });

    it("renders all segments as radio buttons", () => {
      render(<SegmentedControl segments={segments} value="day" onChange={vi.fn()} />);
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(3);
    });

    it("marks the active segment as checked", () => {
      render(<SegmentedControl segments={segments} value="week" onChange={vi.fn()} />);
      expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute("aria-checked", "true");
    });

    it("marks inactive segments as not checked", () => {
      render(<SegmentedControl segments={segments} value="week" onChange={vi.fn()} />);
      expect(screen.getByRole("radio", { name: "Day" })).toHaveAttribute("aria-checked", "false");
      expect(screen.getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "false");
    });

    it("marks disabled segment with aria-disabled", () => {
      render(<SegmentedControl segments={withDisabled} value="a" onChange={vi.fn()} />);
      expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("controlled selection", () => {
    it("calls onChange with segment id on click", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SegmentedControl segments={segments} value="day" onChange={onChange} />);
      await user.click(screen.getByRole("radio", { name: "Week" }));
      expect(onChange).toHaveBeenCalledWith("week");
    });

    it("does not call onChange on disabled segment click", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SegmentedControl segments={withDisabled} value="a" onChange={onChange} />);
      await user.click(screen.getByRole("radio", { name: "Beta" }));
      expect(onChange).not.toHaveBeenCalledWith("b");
    });
  });

  describe("keyboard navigation", () => {
    it("moves selection right on ArrowRight", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SegmentedControl segments={segments} value="day" onChange={onChange} />);
      screen.getByRole("radio", { name: "Day" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith("week");
    });

    it("moves selection left on ArrowLeft", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SegmentedControl segments={segments} value="week" onChange={onChange} />);
      screen.getByRole("radiogroup").focus();
      await user.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith("day");
    });

    it("wraps from last to first on ArrowRight", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SegmentedControl segments={segments} value="month" onChange={onChange} />);
      screen.getByRole("radiogroup").focus();
      await user.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith("day");
    });

    it("jumps to first on Home", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SegmentedControl segments={segments} value="month" onChange={onChange} />);
      screen.getByRole("radiogroup").focus();
      await user.keyboard("{Home}");
      expect(onChange).toHaveBeenCalledWith("day");
    });

    it("jumps to last on End", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SegmentedControl segments={segments} value="day" onChange={onChange} />);
      screen.getByRole("radiogroup").focus();
      await user.keyboard("{End}");
      expect(onChange).toHaveBeenCalledWith("month");
    });
  });

  describe("sizes", () => {
    it("renders md size by default", () => {
      const { container } = render(
        <SegmentedControl segments={segments} value="day" onChange={vi.fn()} />
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders sm size when specified", () => {
      const { container } = render(
        <SegmentedControl segments={segments} value="day" onChange={vi.fn()} size="sm" />
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<SegmentedControl ref={ref} segments={segments} value="day" onChange={vi.fn()} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations", async () => {
      const { container } = render(
        <SegmentedControl segments={segments} value="day" onChange={() => {}} />
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });

  describe("accessible name (#4331)", () => {
    it("routes a caller's aria-label to the radiogroup, not the wrapper", () => {
      render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={vi.fn()}
          aria-label="View mode"
        />
      );
      expect(screen.getByRole("radiogroup", { name: "View mode" })).toBeInTheDocument();
    });

    it("routes a caller's aria-labelledby to the radiogroup", () => {
      render(
        <>
          <span id="sc-label">Calendar range</span>
          <SegmentedControl
            segments={segments}
            value="day"
            onChange={vi.fn()}
            aria-labelledby="sc-label"
          />
        </>
      );
      expect(screen.getByRole("radiogroup", { name: "Calendar range" })).toBeInTheDocument();
    });

    it("leaves the wrapper unlabelled so the name is not announced twice", () => {
      const { container } = render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={vi.fn()}
          aria-label="View mode"
        />
      );
      expect(container.firstElementChild).not.toHaveAttribute("aria-label");
    });

    it("still lands non-label props on the wrapper", () => {
      const { container } = render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={vi.fn()}
          id="range-picker"
          data-testid="range"
          aria-label="View mode"
        />
      );
      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveAttribute("id", "range-picker");
      expect(wrapper).toHaveAttribute("data-testid", "range");
    });

    it("adds no aria-label attributes when the caller passes none", () => {
      render(<SegmentedControl segments={segments} value="day" onChange={vi.fn()} />);
      const group = screen.getByRole("radiogroup");
      expect(group).not.toHaveAttribute("aria-label");
      expect(group).not.toHaveAttribute("aria-labelledby");
    });
  });

  it("does not emit 'undefined' in container className", () => {
    const { container } = render(
      <SegmentedControl segments={segments} value="day" onChange={() => {}} />
    );
    expect(container.firstElementChild?.className).not.toMatch(/undefined/);
  });
});
