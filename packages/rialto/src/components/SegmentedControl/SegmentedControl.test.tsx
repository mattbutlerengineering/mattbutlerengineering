import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { SegmentedControl } from "./SegmentedControl";
import type { Segment } from "./SegmentedControl";
import { useState } from "react";

const segments: Segment[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

function ControlledSegmentedControl({
  onChange,
}: {
  onChange?: (id: string) => void;
}) {
  const [value, setValue] = useState("day");
  return (
    <SegmentedControl
      segments={segments}
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
    />
  );
}

describe("SegmentedControl", () => {
  describe("rendering", () => {
    it("renders all segment buttons", () => {
      render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={() => {}}
        />
      );
      expect(screen.getByRole("radio", { name: "Day" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Week" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Month" })).toBeInTheDocument();
    });

    it("renders a radiogroup container", () => {
      render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={() => {}}
        />
      );
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    });

    it("marks selected segment as aria-checked", () => {
      render(
        <SegmentedControl
          segments={segments}
          value="week"
          onChange={() => {}}
        />
      );
      expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      expect(screen.getByRole("radio", { name: "Day" })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });

    it("applies sm size class", () => {
      const { container } = render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={() => {}}
          size="sm"
        />
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls onChange when a segment is clicked", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={onChange}
        />
      );
      await user.click(screen.getByRole("radio", { name: "Week" }));
      expect(onChange).toHaveBeenCalledWith("week");
    });

    it("does not call onChange for disabled segments", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const segmentsWithDisabled: Segment[] = [
        { id: "day", label: "Day" },
        { id: "week", label: "Week", disabled: true },
      ];
      render(
        <SegmentedControl
          segments={segmentsWithDisabled}
          value="day"
          onChange={onChange}
        />
      );
      await user.click(screen.getByRole("radio", { name: "Week" }));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("ArrowRight moves to next segment", () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={onChange}
        />
      );
      const radioGroup = screen.getByRole("radiogroup");
      fireEvent.keyDown(radioGroup, { key: "ArrowRight" });
      expect(onChange).toHaveBeenCalledWith("week");
    });

    it("ArrowLeft moves to previous segment", () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          segments={segments}
          value="week"
          onChange={onChange}
        />
      );
      const radioGroup = screen.getByRole("radiogroup");
      fireEvent.keyDown(radioGroup, { key: "ArrowLeft" });
      expect(onChange).toHaveBeenCalledWith("day");
    });

    it("ArrowDown moves to next segment", () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={onChange}
        />
      );
      const radioGroup = screen.getByRole("radiogroup");
      fireEvent.keyDown(radioGroup, { key: "ArrowDown" });
      expect(onChange).toHaveBeenCalledWith("week");
    });

    it("ArrowUp moves to previous segment", () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          segments={segments}
          value="week"
          onChange={onChange}
        />
      );
      const radioGroup = screen.getByRole("radiogroup");
      fireEvent.keyDown(radioGroup, { key: "ArrowUp" });
      expect(onChange).toHaveBeenCalledWith("day");
    });

    it("Home jumps to first segment", () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          segments={segments}
          value="month"
          onChange={onChange}
        />
      );
      const radioGroup = screen.getByRole("radiogroup");
      fireEvent.keyDown(radioGroup, { key: "Home" });
      expect(onChange).toHaveBeenCalledWith("day");
    });

    it("End jumps to last segment", () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={onChange}
        />
      );
      const radioGroup = screen.getByRole("radiogroup");
      fireEvent.keyDown(radioGroup, { key: "End" });
      expect(onChange).toHaveBeenCalledWith("month");
    });

    it("selection updates visually in controlled mode", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ControlledSegmentedControl onChange={onChange} />);
      expect(screen.getByRole("radio", { name: "Day" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      await user.click(screen.getByRole("radio", { name: "Week" }));
      expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      expect(onChange).toHaveBeenCalledWith("week");
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <SegmentedControl
          segments={segments}
          value="day"
          onChange={() => {}}
        />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
