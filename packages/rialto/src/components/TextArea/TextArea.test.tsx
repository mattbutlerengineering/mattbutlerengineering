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

describe("TextArea — accessible name", () => {
  it("supports an accessible name via aria-label without a visible label", () => {
    render(<TextArea aria-label="Bio" />);
    expect(screen.getByRole("textbox", { name: "Bio" })).toBeInTheDocument();
  });
});

describe("TextArea — required marker + aria-live announcements", () => {
  it("renders the required marker when required", () => {
    render(<TextArea label="Bio" required />);
    expect(screen.getByText("*", { exact: false })).toBeInTheDocument();
  });

  it("announces the character count via a polite status region", () => {
    render(<TextArea label="Bio" maxLength={200} value="hello" onChange={() => {}} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("5 of 200 characters");
  });

  // role="alert" on a freshly-mounted node is spec-reliable for insertion-
  // with-content, unlike the old always-mounted echo region. See #4833.
  it("announces the error hint via an alert region", () => {
    render(<TextArea label="Bio" error hint="Too long" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Too long");
  });

  it("does not duplicate the error message into a separate hidden echo node", () => {
    render(<TextArea label="Bio" error hint="Too long" />);
    expect(screen.getAllByText("Too long")).toHaveLength(1);
  });
});
