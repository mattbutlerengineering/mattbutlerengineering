import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import { FormStatesExamplePage } from "./FormStatesExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. Select and Spinner render placeholder and label
// as text, matching the real components, so an ellipsis written as a JSX
// attribute string is asserted on the rendered page.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "p";
    return <Tag>{children}</Tag>;
  };
  const Button = ({
    children,
    variant = "secondary",
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    variant?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Input = ({ label, placeholder }: { label?: string; placeholder?: string }) => (
    <label>
      {label}
      <input placeholder={placeholder} />
    </label>
  );
  const Select = ({ label, placeholder }: { label?: string; placeholder?: string }) => (
    <label>
      {label}
      <span>{placeholder}</span>
    </label>
  );
  const Spinner = ({ label }: { label?: string }) => <span>{label}</span>;
  return { Text, Button, Stack, Divider, Card, Input, Select, Spinner };
});

const UNICODE_ESCAPE = /\\u[0-9a-fA-F]{4}/;

describe("FormStatesExamplePage", () => {
  it("renders ellipses instead of literal unicode-escape sequences", () => {
    render(<FormStatesExamplePage />);

    expect(screen.getAllByText("Select room type…")).toHaveLength(2);
    expect(screen.getAllByText("Submitting…")).toHaveLength(2);
    expect(document.body.textContent ?? "").not.toMatch(UNICODE_ESCAPE);
  });

  it("copies JSX that uses a real ellipsis and no unicode-escape sequences", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<FormStatesExamplePage />);

    fireEvent.click(screen.getByRole("button", { name: "Copy JSX" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0]?.[0]);
    expect(copied).toContain('placeholder="Select room type…"');
    expect(copied).toContain(">Submitting…<");
    expect(copied).not.toMatch(UNICODE_ESCAPE);
  });
});
