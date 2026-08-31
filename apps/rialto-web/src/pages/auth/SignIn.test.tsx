import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ChangeEvent, FocusEvent, ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { SignIn } from "./SignIn";
import { MFA_REJECT_CODE } from "./auth-validation";

const toastSpy = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto (house pattern — the real
// package resolves to an unbuilt dist in worktrees). Stubs preserve the
// semantics the assertions rely on: Input round-trips value/onChange/onBlur
// keyed by label and renders hint as a queryable note; PinInput exposes a
// single labelled input that fires onComplete when full; Steps marks the
// current step with aria-current.
// ---------------------------------------------------------------------------
vi.mock("@mattbutlerengineering/rialto", () => {
  const Input = ({
    label,
    value,
    onChange,
    onBlur,
    error,
    hint,
    type,
    disabled,
    endIcon,
  }: {
    label?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
    error?: boolean;
    hint?: string;
    type?: string;
    disabled?: boolean;
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
        disabled={disabled}
        aria-invalid={error || undefined}
      />
      {hint ? <span role="note">{hint}</span> : null}
      {endIcon}
    </label>
  );
  const PinInput = ({
    label,
    value,
    onChange,
    onComplete,
    error,
    hint,
    length = 4,
  }: {
    label?: string;
    value?: string;
    onChange?: (value: string) => void;
    onComplete?: (value: string) => void;
    error?: boolean;
    hint?: string;
    length?: number;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        aria-invalid={error || undefined}
        onChange={(event) => {
          const next = event.target.value;
          onChange?.(next);
          if (next.length === length) onComplete?.(next);
        }}
      />
      {hint ? <span role="note">{hint}</span> : null}
    </label>
  );
  const Steps = ({ steps, currentStep }: { steps: { label: string }[]; currentStep: number }) => (
    <ol data-testid="steps">
      {steps.map((step, index) => (
        <li key={step.label} aria-current={index === currentStep ? "step" : undefined}>
          {step.label}
        </li>
      ))}
    </ol>
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
  const Text = ({ children }: { children?: ReactNode }) => <p>{children}</p>;
  const Handshake = ({
    "aria-label": ariaLabel,
    state,
  }: {
    "aria-label"?: string;
    state?: string;
  }) => <div role="img" aria-label={ariaLabel} data-state={state} />;
  const useToast = () => ({ toast: toastSpy });
  const useMotionPreset = () => ({
    precision: { duration: 0 },
    spring: { duration: 0 },
    springGentle: { duration: 0 },
    tilt: { stiffness: 500, damping: 22, mass: 0.35 },
  });
  return {
    Input,
    PinInput,
    Steps,
    Button,
    Checkbox,
    Divider,
    Text,
    Handshake,
    useToast,
    useMotionPreset,
  };
});

function renderSignIn() {
  return render(
    <MemoryRouter>
      <SignIn />
    </MemoryRouter>
  );
}

function fillCredentials(email = "ada@example.com", password = "correct horse battery") {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

async function submitCredentials() {
  fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
}

function codeInput() {
  return screen.getByLabelText(/authenticator/i);
}

beforeEach(() => {
  vi.useFakeTimers();
  toastSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SignIn — credentials step", () => {
  it("renders the credentials step with the step indicator on step one", () => {
    renderSignIn();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    const current = screen.getByTestId("steps").querySelector("[aria-current='step']");
    expect(current).toHaveTextContent("Credentials");
  });

  it("shows the sign-in exchange at rest on load, with an empty status line", () => {
    renderSignIn();
    const handshake = screen.getByRole("img", { name: "Sign-in exchange at rest" });
    expect(handshake).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("flags a malformed email on blur and clears the flag once corrected", () => {
    renderSignIn();
    const email = screen.getByLabelText("Email address");

    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.blur(email);
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();

    fireEvent.change(email, { target: { value: "ada@example.com" } });
    fireEvent.blur(email);
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
  });

  it("submitting an invalid email shows the error state instead of advancing", async () => {
    renderSignIn();
    fillCredentials("not-an-email");
    await submitCredentials();

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/authenticator/i)).not.toBeInTheDocument();
  });

  it("offers a passkey affordance above the social sign-in row", () => {
    renderSignIn();
    const passkey = screen.getByRole("button", { name: /use a passkey instead/i });
    const google = screen.getByRole("button", { name: "Google" });

    expect(passkey.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("signing in with a passkey succeeds instantly", () => {
    renderSignIn();
    fireEvent.click(screen.getByRole("button", { name: /use a passkey instead/i }));
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("cross-links the session-expired demo from the footer", () => {
    renderSignIn();
    const link = screen.getByRole("link", { name: /session expired/i });
    expect(link).toHaveAttribute("href", "/demos/session-expired");
  });
});

describe("SignIn — verification step", () => {
  it("advances to the authenticator step after valid credentials submit", async () => {
    renderSignIn();
    fillCredentials();
    await submitCredentials();

    expect(codeInput()).toBeInTheDocument();
    const current = screen.getByTestId("steps").querySelector("[aria-current='step']");
    expect(current).toHaveTextContent("Verification");
    expect(screen.getByRole("img")).toHaveAttribute("data-state", "idle");
  });

  it("negotiates while credentials are submitting, before the network delay elapses", async () => {
    renderSignIn();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole("img")).toHaveAttribute("data-state", "negotiating");
    expect(screen.getByRole("status")).toHaveTextContent("Sending your credentials");
    expect(screen.getByLabelText("Email address")).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
  });

  it("negotiates while a code is verifying, before the network delay elapses", async () => {
    renderSignIn();
    fillCredentials();
    await submitCredentials();

    fireEvent.change(codeInput(), { target: { value: "123456" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole("img")).toHaveAttribute("data-state", "negotiating");
    expect(screen.getByRole("status")).toHaveTextContent("Checking your code");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  });

  it("rejects the demo reject code with a mismatch message and no toast", async () => {
    renderSignIn();
    fillCredentials();
    await submitCredentials();

    fireEvent.change(codeInput(), { target: { value: MFA_REJECT_CODE } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole("img")).toHaveAttribute("data-state", "failed");
    expect(screen.getByRole("status")).toHaveTextContent("The exchange didn't go through");
    expect(screen.getByText(/didn.t match/i)).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalled();

    fireEvent.change(codeInput(), { target: { value: "1" } });
    expect(screen.getByRole("img")).toHaveAttribute("data-state", "idle");
  });

  it("accepts any other complete code and fires the success toast after settling", async () => {
    renderSignIn();
    fillCredentials();
    await submitCredentials();

    fireEvent.change(codeInput(), { target: { value: "123456" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(screen.getByRole("img")).toHaveAttribute("data-state", "settled");
    expect(screen.getByRole("status")).toHaveTextContent("Verified");
    expect(toastSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("lets the user step back to credentials", async () => {
    renderSignIn();
    fillCredentials();
    await submitCredentials();

    fireEvent.click(screen.getByRole("button", { name: /different account/i }));
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });
});
