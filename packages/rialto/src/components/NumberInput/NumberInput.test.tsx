/**
 * Unit tests for NumberInput — focused on accessibility attributes for
 * readOnly / disabled / error states.
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { NumberInput } from "./NumberInput";

const noop = () => {};

describe("NumberInput — readOnly + aria-disabled anti-pattern", () => {
  it("does not set aria-disabled when readOnly is true and disabled is false", () => {
    render(<NumberInput label="Quantity" value={1} onChange={noop} readOnly />);
    const input = screen.getByLabelText("Quantity");
    expect(input).not.toHaveAttribute("aria-disabled");
    expect(input).toHaveAttribute("readonly");
    expect(input).not.toBeDisabled();
  });

  it("uses native disabled (not aria-disabled) when disabled is true", () => {
    render(<NumberInput label="Quantity" value={1} onChange={noop} disabled />);
    const input = screen.getByLabelText("Quantity");
    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute("aria-disabled");
  });

  it("does not force readOnly when only disabled is true", () => {
    render(<NumberInput label="Quantity" value={1} onChange={noop} disabled />);
    const input = screen.getByLabelText("Quantity");
    expect(input).not.toHaveAttribute("readonly");
  });
});

describe("NumberInput — custom id forwarding", () => {
  it("uses the provided id on the input and associates the label to it", () => {
    render(<NumberInput label="Quantity" value={1} onChange={noop} id="qty-field" />);
    const input = screen.getByLabelText("Quantity");
    expect(input).toHaveAttribute("id", "qty-field");
  });
});

describe("NumberInput — aria-invalid for error state", () => {
  it("sets aria-invalid=true when error is true", () => {
    render(<NumberInput label="Quantity" value={1} onChange={noop} error />);
    const input = screen.getByLabelText("Quantity");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("does not set aria-invalid when error is false", () => {
    render(<NumberInput label="Quantity" value={1} onChange={noop} />);
    const input = screen.getByLabelText("Quantity");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("NumberInput — stepper and keyboard", () => {
  it("increments on Increase button click", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("Increase"));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("decrements on Decrease button click", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("Decrease"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("respects step value", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} step={0.5} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("Increase"));
    expect(onChange).toHaveBeenCalledWith(5.5);
  });

  it("clamps to min on decrement", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={0} min={0} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("Decrease"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("clamps to max on increment", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={10} max={10} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("Increase"));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("disables decrease at min", () => {
    render(<NumberInput label="Qty" value={0} min={0} onChange={noop} />);
    expect(screen.getByLabelText("Decrease")).toBeDisabled();
  });

  it("disables increase at max", () => {
    render(<NumberInput label="Qty" value={10} max={10} onChange={noop} />);
    expect(screen.getByLabelText("Increase")).toBeDisabled();
  });

  it("ArrowUp key increments", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText("Qty"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("ArrowDown key decrements", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText("Qty"), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("handles direct input change on blur", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    const input = screen.getByLabelText("Qty");
    fireEvent.change(input, { target: { value: "7" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("ignores empty or dash input", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "-" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores NaN input", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "abc" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops repeat on pointer up", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    const btn = screen.getByLabelText("Increase");
    fireEvent.pointerDown(btn);
    fireEvent.pointerUp(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stops repeat on pointer leave", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    const btn = screen.getByLabelText("Increase");
    fireEvent.pointerDown(btn);
    fireEvent.pointerLeave(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("NumberInput — rendering extras", () => {
  it("renders hint text with aria-describedby", () => {
    render(<NumberInput label="Qty" value={5} onChange={noop} hint="Max 10" />);
    expect(screen.getByText("Max 10")).toBeInTheDocument();
    const input = screen.getByLabelText("Qty");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("renders required indicator", () => {
    render(<NumberInput label="Qty" value={5} onChange={noop} required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders optional indicator when showOptional and not required", () => {
    render(<NumberInput label="Qty" value={5} onChange={noop} showOptional />);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("shows lock icon when disabled with reason", () => {
    const { container } = render(
      <NumberInput label="Qty" value={5} disabled disabledReason="Locked" onChange={noop} />
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies error class", () => {
    const { container } = render(<NumberInput label="Qty" value={5} error onChange={noop} />);
    expect(container.querySelector("[class*='error']")).toBeTruthy();
  });

  it("applies small size class", () => {
    const { container } = render(
      <NumberInput label="Qty" value={5} size="small" onChange={noop} />
    );
    expect(container.querySelector("[class*='small']")).toBeTruthy();
  });

  it("forwards ref", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<NumberInput ref={ref} label="Qty" value={5} onChange={noop} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("does not emit 'undefined' in wrapper className", () => {
    const { container } = render(<NumberInput value={5} onChange={noop} />);
    expect(container.firstElementChild?.className).not.toMatch(/undefined/);
  });
});

describe("NumberInput — aria-live announcements", () => {
  // role="alert" on a freshly-mounted node is spec-reliable for insertion-
  // with-content, unlike the old always-mounted echo region. See #4833.
  it("announces the error hint via an alert region", () => {
    render(<NumberInput label="Qty" value={5} onChange={noop} error hint="Too high" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Too high");
  });

  it("does not duplicate the error message into a separate hidden echo node", () => {
    render(<NumberInput label="Qty" value={5} onChange={noop} error hint="Too high" />);
    expect(screen.getAllByText("Too high")).toHaveLength(1);
  });
});

describe("NumberInput — readOnly keyboard and stepper semantics", () => {
  it("does not change the value on ArrowUp/ArrowDown when readOnly", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Quantity" value={5} onChange={onChange} readOnly />);
    const input = screen.getByLabelText("Quantity");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables the stepper buttons when readOnly", () => {
    render(<NumberInput label="Quantity" value={5} onChange={noop} readOnly />);
    expect(screen.getByLabelText("Decrease")).toBeDisabled();
    expect(screen.getByLabelText("Increase")).toBeDisabled();
  });
});

/**
 * Keystrokes must not clamp until the field commits. A controlled input that
 * writes the clamped number back on every change turns "07" into 17 (the
 * leading 0 snaps to min, then 7 is appended) and "-5" into the max.
 */
describe("NumberInput — clamp on commit, not on each keystroke", () => {
  function LapCount({
    initial = 17,
    onChange,
  }: {
    initial?: number;
    onChange?: (value: number) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <NumberInput
        label="Lap Count"
        value={value}
        min={1}
        max={99}
        onChange={(next) => {
          onChange?.(next);
          setValue(next);
        }}
      />
    );
  }

  /** First character replaces the field; each later one appends to what is shown. */
  function typeChars(input: HTMLInputElement, text: string) {
    const first = text[0] ?? "";
    fireEvent.change(input, { target: { value: first } });
    for (const char of text.slice(1)) {
      fireEvent.change(input, { target: { value: `${input.value}${char}` } });
    }
  }

  it("keeps a leading zero while typing and commits 7 for 07", () => {
    const onChange = vi.fn();
    render(<LapCount onChange={onChange} />);
    const input = screen.getByLabelText("Lap Count") as HTMLInputElement;

    typeChars(input, "07");

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("07");
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(7);
    expect(input.value).toBe("7");
  });

  it("keeps a leading minus while typing and clamps -5 to min on blur", () => {
    const onChange = vi.fn();
    render(<LapCount onChange={onChange} />);
    const input = screen.getByLabelText("Lap Count") as HTMLInputElement;

    typeChars(input, "-5");

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("-5");
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(1);
    expect(input.value).toBe("1");
  });

  it("shows 100 while typing and clamps to max on blur", () => {
    const onChange = vi.fn();
    render(<LapCount onChange={onChange} />);
    const input = screen.getByLabelText("Lap Count") as HTMLInputElement;

    typeChars(input, "100");

    expect(input.value).toBe("100");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(99);
    expect(input.value).toBe("99");
  });

  it("clamps a value set in one go on blur", () => {
    const onChange = vi.fn();
    render(<LapCount initial={5} onChange={onChange} />);
    const input = screen.getByLabelText("Lap Count");
    fireEvent.change(input, { target: { value: "100" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(99);
  });

  it("leaves the committed value when the field is cleared and blurred", () => {
    const onChange = vi.fn();
    render(<LapCount initial={17} onChange={onChange} />);
    const input = screen.getByLabelText("Lap Count") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("17");
  });

  it("steps from the typed number when a stepper is used before blur", () => {
    const onChange = vi.fn();
    render(<LapCount initial={17} onChange={onChange} />);
    const input = screen.getByLabelText("Lap Count") as HTMLInputElement;
    typeChars(input, "40");
    fireEvent.pointerDown(screen.getByLabelText("Increase"));
    expect(onChange).toHaveBeenCalledWith(41);
    expect(input.value).toBe("41");
  });
});
