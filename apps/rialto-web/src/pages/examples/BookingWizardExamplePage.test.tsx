import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ChangeEvent, ElementType, ReactNode } from "react";
import { BookingWizardExamplePage } from "./BookingWizardExamplePage.js";
import { ROOMS } from "./booking-wizard.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. Stubs preserve the semantics the assertions rely
// on: Steps exposes the current step + labels, DatePicker/Input round-trip their
// value through onChange keyed by label, Button forwards clicks + variant, and
// DataList renders queryable dt/dd pairs for the confirmation summary.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "p";
    return <Tag>{children}</Tag>;
  };
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Badge = ({ children, variant = "neutral" }: { children?: ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  );
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
  const Steps = ({ steps, currentStep }: { steps: { label: string }[]; currentStep: number }) => (
    <ol data-testid="steps" data-current={currentStep} aria-label="Progress steps">
      {steps.map((step, i) => (
        <li key={step.label} aria-current={i === currentStep ? "step" : undefined}>
          {step.label}
        </li>
      ))}
    </ol>
  );
  const Input = ({
    label,
    value,
    onChange,
    error,
    hint,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
    error?: boolean;
    hint?: string;
  }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={onChange} aria-invalid={error} />
      {hint ? <span role="note">{hint}</span> : null}
    </label>
  );
  const DatePicker = ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value?: string | null;
    onChange?: (value: string | null) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value || null)}
      />
    </label>
  );
  const DataList = ({ items }: { items: { label: string; value: ReactNode }[] }) => (
    <dl>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
  return { Text, Stack, Divider, Card, Badge, Button, Steps, Input, DatePicker, DataList };
});

/* ── Helpers ─────────────────────────────────── */

function setInput(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

/** Drive the wizard through dates → room → guest → payment → confirmation. */
function completeToConfirmation() {
  setInput("Check-in", "2026-08-01");
  setInput("Check-out", "2026-08-04");
  clickContinue();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(ROOMS[0]!.name, "i") }));
  clickContinue();
  setInput("First name", "Ada");
  setInput("Last name", "Lovelace");
  setInput("Email", "ada@example.com");
  clickContinue();
  setInput("Name on card", "Ada Lovelace");
  setInput("Card number", "4242 4242 4242 4242");
  setInput("Expiry (MM/YY)", "08/28");
  setInput("Security code", "123");
  clickContinue();
}

/* ── Tests ───────────────────────────────────── */

describe("BookingWizardExamplePage", () => {
  it("renders the showcase header with page name and description", () => {
    render(<BookingWizardExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Booking Wizard" })).toBeInTheDocument();
  });

  it("shows a five-step progress indicator with the dates step current", () => {
    render(<BookingWizardExamplePage />);
    const steps = screen.getByTestId("steps");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(5);
    expect(steps).toHaveAttribute("data-current", "0");
  });

  it("blocks advancing from the dates step until both dates are valid", () => {
    render(<BookingWizardExamplePage />);
    clickContinue();
    // Still on the dates step and a validation message is shown.
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "0");
    expect(screen.getByText(/choose a check-in date/i)).toBeInTheDocument();
  });

  it("advances to room selection once dates are provided", () => {
    render(<BookingWizardExamplePage />);
    setInput("Check-in", "2026-08-01");
    setInput("Check-out", "2026-08-04");
    clickContinue();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "1");
    expect(
      screen.getByRole("button", { name: new RegExp(ROOMS[0]!.name, "i") })
    ).toBeInTheDocument();
  });

  it("preserves entered state across back-navigation", () => {
    render(<BookingWizardExamplePage />);
    setInput("Check-in", "2026-08-01");
    setInput("Check-out", "2026-08-04");
    clickContinue();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "0");
    expect(screen.getByLabelText("Check-in")).toHaveValue("2026-08-01");
    expect(screen.getByLabelText("Check-out")).toHaveValue("2026-08-04");
  });

  it("reaches the confirmation step and summarises every input", () => {
    render(<BookingWizardExamplePage />);
    completeToConfirmation();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "4");
    // Confirmation summary carries dates, room, guest, and masked payment.
    expect(screen.getByText("2026-08-01")).toBeInTheDocument();
    expect(screen.getByText(ROOMS[0]!.name)).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText(/4242$/)).toBeInTheDocument();
  });
});
