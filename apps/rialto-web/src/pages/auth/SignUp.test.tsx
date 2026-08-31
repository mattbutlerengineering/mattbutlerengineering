import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ChangeEvent, FocusEvent, ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { SignUp, SIGN_UP_PHASES } from "./SignUp";

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
    disabled,
  }: {
    label?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
    error?: boolean;
    hint?: string;
    type?: string;
    endIcon?: ReactNode;
    disabled?: boolean;
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
        disabled={disabled}
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
  const Checkbox = ({
    label,
    checked,
    onCheckedChange,
    required,
  }: {
    label?: ReactNode;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    required?: boolean;
  }) => (
    <label>
      {label}
      <input
        type="checkbox"
        checked={checked ?? false}
        required={required}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
    </label>
  );
  const Divider = () => <hr />;
  const Text = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  );
  const Handshake = ({
    "aria-label": ariaLabel,
    state,
  }: {
    "aria-label": string;
    state?: string;
  }) => <div role="img" aria-label={ariaLabel} data-state={state} />;
  const useToast = () => ({ toast: toastSpy });
  return { Input, Meter, Button, Checkbox, Divider, Text, Handshake, useToast };
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

function agreeToTerms() {
  fireEvent.click(screen.getByRole("checkbox"));
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
    agreeToTerms();

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("blocks submission when the terms checkbox is not agreed to", async () => {
    renderSignUp();
    setField("Full name", "Ada Lovelace");
    setField("Email address", "ada@example.com");
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "Abcdefghijk1");

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(toastSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/agree first/i)).toBeInTheDocument();
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

describe("SignUp — Handshake phase", () => {
  it("rests idle with an empty status line on load", () => {
    renderSignUp();

    const handshake = screen.getByRole("img", { name: "Sign-up exchange at rest" });
    expect(handshake).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("negotiates with disabled inputs while the account is being created", async () => {
    renderSignUp();
    setField("Full name", "Ada Lovelace");
    setField("Email address", "ada@example.com");
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "Abcdefghijk1");
    agreeToTerms();

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      screen.getByRole("img", { name: "Creating your account with Identity" })
    ).toHaveAttribute("data-state", "negotiating");
    expect(screen.getByRole("status")).toHaveTextContent("Creating your account");
    expect(screen.getByLabelText("Email address")).toBeDisabled();
  });

  it("settles with 'Account created' once the exchange completes", async () => {
    renderSignUp();
    setField("Full name", "Ada Lovelace");
    setField("Email address", "ada@example.com");
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "Abcdefghijk1");
    agreeToTerms();

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(
      screen.getByRole("img", { name: "Account created — your browser and Identity agree" })
    ).toHaveAttribute("data-state", "settled");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Account created");
    expect(status.textContent).not.toBe("Account created — your browser and Identity agree");
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Account created successfully", variant: "success" })
    );
  });

  it("leaves the Handshake idle when a mismatched confirmation blocks submission", async () => {
    renderSignUp();
    setField("Full name", "Ada Lovelace");
    setField("Email address", "ada@example.com");
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "different");

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByRole("img", { name: "Sign-up exchange at rest" })).toHaveAttribute(
      "data-state",
      "idle"
    );
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("leaves the Handshake idle when a malformed email blocks submission", async () => {
    renderSignUp();
    setField("Full name", "Ada Lovelace");
    setField("Email address", "nope");
    setField("Password", "Abcdefghijk1"); // gitleaks:allow — synthetic demo password fixture
    setField("Confirm password", "Abcdefghijk1");

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByRole("img", { name: "Sign-up exchange at rest" })).toHaveAttribute(
      "data-state",
      "idle"
    );
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe.each(Object.entries(SIGN_UP_PHASES).filter(([, phase]) => phase.status !== ""))(
  "SIGN_UP_PHASES.%s",
  (_phaseName, phase) => {
    it("gives the image label a distinct sentence from the status line", () => {
      expect(phase.ariaLabel).not.toBe(phase.status);
    });
  }
);
