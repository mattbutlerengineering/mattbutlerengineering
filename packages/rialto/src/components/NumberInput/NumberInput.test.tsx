/**
 * Unit tests for NumberInput — focused on accessibility attributes for
 * readOnly / disabled / error states.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

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
