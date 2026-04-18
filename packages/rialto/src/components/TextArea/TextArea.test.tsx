/**
 * Unit tests for TextArea — focused on accessibility attributes for
 * readOnly / disabled / error states.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { TextArea } from "./TextArea";

describe("TextArea — readOnly + aria-disabled anti-pattern", () => {
  it("does not set aria-disabled when readOnly is true and disabled is false", () => {
    render(<TextArea label="Notes" readOnly />);
    const textarea = screen.getByLabelText("Notes");
    expect(textarea).not.toHaveAttribute("aria-disabled");
    expect(textarea).toHaveAttribute("readonly");
    expect(textarea).not.toBeDisabled();
  });

  it("uses native disabled (not aria-disabled) when disabled is true", () => {
    render(<TextArea label="Notes" disabled />);
    const textarea = screen.getByLabelText("Notes");
    expect(textarea).toBeDisabled();
    expect(textarea).not.toHaveAttribute("aria-disabled");
  });

  it("does not force readOnly when only disabled is true", () => {
    render(<TextArea label="Notes" disabled />);
    const textarea = screen.getByLabelText("Notes");
    expect(textarea).not.toHaveAttribute("readonly");
  });
});
