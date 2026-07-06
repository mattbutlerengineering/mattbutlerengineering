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

describe("TextArea — required marker + aria-live announcements", () => {
  const noop = () => {};

  it("renders a polite status live region for async announcements", () => {
    const { container } = render(<TextArea label="Bio" />);
    expect(container.querySelector('[role="status"][aria-live="polite"]')).toBeInTheDocument();
  });

  it("renders the shared aria-hidden required marker when required", () => {
    render(<TextArea label="Bio" required />);
    const marker = screen.getByText("*", { exact: false });
    expect(marker).toHaveAttribute("aria-hidden", "true");
  });

  it("announces the over-limit counter state through the live region", () => {
    const { container } = render(
      <TextArea label="Bio" value="abcdef" maxLength={3} onChange={noop} />
    );
    const live = container.querySelector('[role="status"]');
    expect(live).toHaveTextContent("6 of 3");
  });

  it("does not announce the counter while under the limit", () => {
    const { container } = render(
      <TextArea label="Bio" value="ab" maxLength={10} onChange={noop} />
    );
    const live = container.querySelector('[role="status"]');
    expect(live).toHaveTextContent("");
  });

  it("announces the error text through the live region, prioritised over the counter", () => {
    const { container } = render(
      <TextArea label="Bio" error hint="Too long" value="abcdef" maxLength={3} onChange={noop} />
    );
    const live = container.querySelector('[role="status"]');
    expect(live).toHaveTextContent("Too long");
  });

  it("does not mark the hint as an alert", () => {
    render(<TextArea label="Bio" error hint="Too long" />);
    const textarea = screen.getByLabelText("Bio");
    const hintEl = document.getElementById(textarea.getAttribute("aria-describedby")!);
    expect(hintEl).not.toHaveAttribute("role", "alert");
  });
});
