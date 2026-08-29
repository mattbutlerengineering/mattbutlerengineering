import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ChangeEvent, FocusEvent, ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { SignUp } from "./SignUp";

const toastSpy = vi.hoisted(() => vi.fn());

// Behavioral mock of @mattbutlerengineering/rialto (house pattern) — Input
// round-trips value/onChange/onBlur keyed by label, Meter exposes its value,
// max, and fill variant through ARIA + data attributes.
vi.mock("@mattbutlerengineering/rialto", () => {
  const Input = ({
    label,
    value,
    onChange,
    onBlur,
    error,
    hint,
    type,
    endIcon,
  }: {
    label?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
    error?: boolean;
    hint?: string;
    type?: string;
    endIcon?: ReactNode;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={error || undefined}
      />
      {hint ? <span role="note">{hint}</span> : null}
      {endIcon}
    </label>
  );
  const Meter = ({
    value,
    max,
    variant,
    label,
  }: {
    value: number | null;
    max?: number;
    variant?: string;
    label?: string;
  }) => (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value ?? undefined}
      aria-valuemax={max}
      data-variant={variant}
    />
  );
  const Button = ({
    children,
    onClick,
    disabled,
    type = "button",
    isLoading,
    loadingText,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
    isLoading?: boolean;
    loadingText?: string;
  }) => (
    <button type={type} onClick={onClick} disabled={disabled || isLoading}>
      {isLoading && loadingText ? loadingText : children}
    </button>
  );
  const Checkbox = ({ label }: { label?: ReactNode }) => (
    <label>
      {label}
      <input type="checkbox" />
    </label>
  );
  const Divider = () => <hr />;
  const Text = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  );
  const useToast = () => ({ toast: toastSpy });
  return { Input, Meter, Button, Checkbox, Divider, Text, useToast };
});

function renderSignUp() {
  return render(
    <MemoryRouter>
      <SignUp />
    </MemoryRouter>
  );
}

function setField(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function requirementRow(text: RegExp) {
  const row = screen.getByText(text).closest("li");
  expect(row, `expected a checklist row matching ${text}`).toBeTruthy();
  return row!;
}

beforeEach(() => {
  vi.useFakeTimers();
  toastSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SignUp — password strength", () => {
  it("shows no strength meter until the user starts typing a password", () => {
    renderSignUp();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("reflects a weak password as an error-variant meter", () => {
    renderSignUp();
    setField("Password", "abc1"); // gitleaks:allow — synthetic demo password fixture

    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "1");
    expect(meter).toHaveAttribute("aria-valuemax", "4");
    expect(meter).toHaveAttribute("data-variant", "error");
    expect(screen.getByText("Weak")).toBeInTheDocument();
  });

  it("reflects a fully satisfying long password as a success-variant meter", () => {
    renderSignUp();
    setField("Password", "Abcdefghijklmno1"); // gitleaks:allow — synthetic demo password fixture

    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "4");
    expect(meter).toHaveAttribute("data-variant", "success");
    expect(screen.getByText("Very strong")).toBeInTheDocument();
  });

  it("ticks each requirement line as it becomes satisfied", () => {
    renderSignUp();
    setField("Password", "Abcdef1"); // gitleaks:allow — synthetic demo password fixture

    expect(requirementRow(/at least 12 characters/i)).toHaveAttribute("data-satisfied", "false");
    expect(requirementRow(/upper and lower case/i)).toHaveAttribute("data-satisfied", "true");
    expect(requirementRow(/number or symbol/i)).toHaveAttribute("data-satisfied", "true");

    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    expect(requirementRow(/at least 12 characters/i)).toHaveAttribute("data-satisfied", "true");
  });
});

describe("SignUp — confirm password", () => {
  it("surfaces a mismatch on blur, not on every keystroke", () => {
    renderSignUp();
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "Abc");

    expect(screen.queryByText(/match/i)).not.toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("Confirm password"));
    expect(screen.getByText(/match/i)).toBeInTheDocument();
  });

  it("clears the mismatch once the confirmation matches", () => {
    renderSignUp();
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "Abc");
    fireEvent.blur(screen.getByLabelText("Confirm password"));

    setField("Confirm password", "Abcdefghijk1");
    expect(screen.queryByText(/match/i)).not.toBeInTheDocument();
  });
});

describe("SignUp — email validation", () => {
  it("flags a malformed email on blur", () => {
    renderSignUp();
    const email = screen.getByLabelText("Email address");
    fireEvent.change(email, { target: { value: "nope" } });
    fireEvent.blur(email);
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });
});

describe("SignUp — submit", () => {
  it("creates the account and fires the success toast with valid inputs", async () => {
    renderSignUp();
    setField("Full name", "Ada Lovelace");
    setField("Email address", "ada@example.com");
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "Abcdefghijk1");

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("blocks submission while the confirmation does not match", async () => {
    renderSignUp();
    setField("Full name", "Ada Lovelace");
    setField("Email address", "ada@example.com");
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "different");

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(toastSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/match/i)).toBeInTheDocument();
  });
});
