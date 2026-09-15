import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ChangeEvent, ElementType, ReactNode } from "react";
import { GuestCheckinExamplePage } from "./GuestCheckinExamplePage.js";
import { AVAILABLE_ROOMS, RESERVATION } from "./GuestCheckinExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. Stubs preserve the semantics the assertions rely
// on: Steps exposes the current step + labels, Select/Input/Toggle round-trip
// their value through onChange keyed by label, Button forwards clicks, and
// DataList renders queryable dt/dd pairs for the key-handoff summary.
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
  const Select = ({
    label,
    options,
    value,
    onChange,
    error,
    hint,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string | null;
    onChange?: (value: string) => void;
    error?: boolean;
    hint?: string;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        aria-invalid={error}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="" disabled></option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span role="note">{hint}</span> : null}
    </label>
  );
  const Toggle = ({
    label,
    checked,
    onCheckedChange,
  }: {
    label?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      {label}
      <input
        type="checkbox"
        aria-label={label}
        checked={checked ?? false}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
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
  return { Text, Stack, Divider, Card, Badge, Button, Steps, Input, Select, Toggle, DataList };
});

/* ── Helpers ─────────────────────────────────── */

function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

function confirmArrival() {
  fireEvent.click(screen.getByLabelText(/confirm the guest has arrived/i));
  clickContinue();
}

function completeIdentity() {
  fireEvent.change(screen.getByLabelText("ID type"), { target: { value: "passport" } });
  fireEvent.change(screen.getByLabelText("ID number"), { target: { value: "X1234567" } });
  fireEvent.click(screen.getByLabelText(/photo matches the guest/i));
  clickContinue();
}

function assignRoom() {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(AVAILABLE_ROOMS[0]!.roomNumber) }));
  clickContinue();
}

/** Drive the flow through arrival → identity → room → key handoff. */
function completeToKeyHandoff() {
  confirmArrival();
  completeIdentity();
  assignRoom();
}

/* ── Tests ───────────────────────────────────── */

describe("GuestCheckinExamplePage", () => {
  it("renders the showcase header with page name and description", () => {
    render(<GuestCheckinExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Guest Checkin" })).toBeInTheDocument();
  });

  it("shows a four-step progress indicator with the arrival step current", () => {
    render(<GuestCheckinExamplePage />);
    const steps = screen.getByTestId("steps");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    expect(steps).toHaveAttribute("data-current", "0");
  });

  it("shows the reservation on file at arrival", () => {
    render(<GuestCheckinExamplePage />);
    expect(screen.getByText(RESERVATION.guestName)).toBeInTheDocument();
    expect(screen.getByText(RESERVATION.confirmationCode)).toBeInTheDocument();
  });

  it("blocks advancing from arrival until the guest is confirmed present", () => {
    render(<GuestCheckinExamplePage />);
    clickContinue();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "0");
    expect(screen.getByText(/confirm the guest has arrived to continue/i)).toBeInTheDocument();
  });

  it("advances to identity verification once arrival is confirmed", () => {
    render(<GuestCheckinExamplePage />);
    confirmArrival();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "1");
  });

  it("blocks advancing from identity until ID type, number, and photo match are all provided", () => {
    render(<GuestCheckinExamplePage />);
    confirmArrival();
    clickContinue();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "1");
    expect(screen.getByText(/select the type of id/i)).toBeInTheDocument();
    expect(screen.getByText(/enter the id number/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm the photo matches/i)).toBeInTheDocument();
  });

  it("advances to room assignment once identity is verified", () => {
    render(<GuestCheckinExamplePage />);
    confirmArrival();
    completeIdentity();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "2");
    expect(
      screen.getByRole("button", { name: new RegExp(AVAILABLE_ROOMS[0]!.roomNumber) })
    ).toBeInTheDocument();
  });

  it("blocks advancing from room assignment until a room is selected", () => {
    render(<GuestCheckinExamplePage />);
    confirmArrival();
    completeIdentity();
    clickContinue();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "2");
    expect(screen.getByText(/assign a room to continue/i)).toBeInTheDocument();
  });

  it("preserves entered state across back-navigation", () => {
    render(<GuestCheckinExamplePage />);
    confirmArrival();
    completeIdentity();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "1");
    expect(screen.getByLabelText("ID type")).toHaveValue("passport");
    expect(screen.getByLabelText("ID number")).toHaveValue("X1234567");
  });

  it("reaches key handoff and summarises the guest, ID, and assigned room", () => {
    render(<GuestCheckinExamplePage />);
    completeToKeyHandoff();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "3");
    expect(screen.getByTestId("badge")).toHaveAttribute("data-variant", "success");
    expect(screen.getByText(RESERVATION.guestName)).toBeInTheDocument();
    expect(screen.getByText(AVAILABLE_ROOMS[0]!.roomNumber)).toBeInTheDocument();
  });
});
