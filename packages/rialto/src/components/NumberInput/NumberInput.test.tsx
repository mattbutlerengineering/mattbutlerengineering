/**
 * Unit tests for NumberInput — focused on accessibility attributes for
 * readOnly / disabled / error states.
 */
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

  it("handles direct input change", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={5} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "7" } });
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
