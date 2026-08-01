import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ChangeEvent, ReactNode } from "react";
import {
  CheckoutExamplePage,
  ORDER_LINE_ITEMS,
  DECLINE_CARD_NUMBER,
  formatMoney,
  lineItemTotalCents,
  subtotalCents,
  taxCents,
  totalCents,
  validatePayment,
} from "./CheckoutExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. Stubs preserve the semantics the assertions rely
// on: Input round-trips value/onChange keyed by label and renders its hint as a
// queryable note (error or not), Card renders its title as a real heading so
// section names are queryable by role, Button forwards clicks/type/isLoading so
// the submit flow and pending state are exercised for real, DataList renders
// queryable dt/dd pairs, and Alert exposes the WAI-ARIA alert region.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: string; children?: ReactNode }) => {
    const Tag = (as ?? "p") as "p";
    return <Tag>{children}</Tag>;
  };
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Card = ({ title, children }: { title?: string; children?: ReactNode }) => (
    <section>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
  const Badge = ({ children, variant = "neutral" }: { children?: ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  );
  const Alert = ({
    variant = "info",
    title,
    children,
  }: {
    variant?: string;
    title?: string;
    children?: ReactNode;
  }) => (
    <div role={variant === "error" ? "alert" : "status"} data-variant={variant}>
      {title && <p>{title}</p>}
      {children}
    </div>
  );
  const Button = ({
    children,
    variant = "secondary",
    onClick,
    disabled,
    type = "button",
    isLoading,
    loadingText,
  }: {
    children?: ReactNode;
    variant?: string;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
    isLoading?: boolean;
    loadingText?: string;
  }) => (
    <button
      type={type}
      data-variant={variant}
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading && loadingText ? loadingText : children}
    </button>
  );
  const Input = ({
    label,
    value,
    onChange,
    error,
    hint,
    placeholder,
  }: {
    label?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    error?: boolean;
    hint?: string;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        aria-invalid={error}
      />
      {hint ? <span role="note">{hint}</span> : null}
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
  return { Text, Stack, Divider, Card, Badge, Alert, Button, Input, DataList };
});

/* ── Helpers ─────────────────────────────────── */

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValidPayment(cardNumber = "4242 4242 4242 4242") {
  setField("Name on card", "Ada Lovelace");
  setField("Card number", cardNumber);
  setField("Expiry (MM/YY)", "08/28");
  setField("Security code", "123");
}

function submit() {
  const button = screen.getByRole("button", { name: /^pay /i });
  fireEvent.click(button);
  return button;
}

/* ── Pure helpers ────────────────────────────── */

describe("CheckoutExamplePage — money + validation helpers", () => {
  it("computes each line item total from integer cents with no floating-point arithmetic", () => {
    for (const item of ORDER_LINE_ITEMS) {
      expect(lineItemTotalCents(item)).toBe(item.quantity * item.unitPriceCents);
      expect(Number.isInteger(lineItemTotalCents(item))).toBe(true);
    }
  });

  it("subtotal is the sum of every line item total", () => {
    const expected = ORDER_LINE_ITEMS.reduce((sum, item) => sum + lineItemTotalCents(item), 0);
    expect(subtotalCents(ORDER_LINE_ITEMS)).toBe(expected);
  });

  it("total is subtotal plus tax, all in integer cents", () => {
    const subtotal = subtotalCents(ORDER_LINE_ITEMS);
    const tax = taxCents(ORDER_LINE_ITEMS);
    expect(Number.isInteger(tax)).toBe(true);
    expect(totalCents(ORDER_LINE_ITEMS)).toBe(subtotal + tax);
  });

  it("formatMoney renders integer cents as a localized USD string", () => {
    expect(formatMoney(174000)).toBe("$1,740.00");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("validatePayment flags every empty field", () => {
    const errors = validatePayment({ cardName: "", cardNumber: "", expiry: "", cvc: "" });
    expect(errors.cardName).toBeTruthy();
    expect(errors.cardNumber).toBeTruthy();
    expect(errors.expiry).toBeTruthy();
    expect(errors.cvc).toBeTruthy();
  });

  it("validatePayment passes a fully valid demo card", () => {
    const errors = validatePayment({
      cardName: "Ada Lovelace",
      cardNumber: "4242 4242 4242 4242",
      expiry: "08/28",
      cvc: "123",
    });
    expect(errors).toEqual({});
  });
});

/* ── Rendering ───────────────────────────────── */

describe("CheckoutExamplePage — rendering", () => {
  it("renders the showcase header with page name and description", () => {
    render(<CheckoutExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Checkout" })).toBeInTheDocument();
  });

  it("renders the order summary with every line item, subtotal, tax, and total", () => {
    render(<CheckoutExamplePage />);
    for (const item of ORDER_LINE_ITEMS) {
      expect(screen.getByText(new RegExp(item.label))).toBeInTheDocument();
    }
    expect(screen.getByText(formatMoney(subtotalCents(ORDER_LINE_ITEMS)))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(taxCents(ORDER_LINE_ITEMS)))).toBeInTheDocument();
    expect(screen.getAllByText(formatMoney(totalCents(ORDER_LINE_ITEMS))).length).toBeGreaterThan(
      0
    );
  });

  it("renders labelled card number, expiry, CVC, and name fields", () => {
    render(<CheckoutExamplePage />);
    expect(screen.getByLabelText("Name on card")).toBeInTheDocument();
    expect(screen.getByLabelText("Card number")).toBeInTheDocument();
    expect(screen.getByLabelText("Expiry (MM/YY)")).toBeInTheDocument();
    expect(screen.getByLabelText("Security code")).toBeInTheDocument();
  });
});

/* ── Validation ──────────────────────────────── */

describe("CheckoutExamplePage — validation", () => {
  it("blocks an empty submit and surfaces field-associated error messages", () => {
    render(<CheckoutExamplePage />);
    submit();

    const cardNumberInput = screen.getByLabelText("Card number");
    expect(cardNumberInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/name on card is required/i)).toBeInTheDocument();
    expect(screen.getByText(/16-digit card number/i)).toBeInTheDocument();
    expect(screen.getByText(/expiry as mm\/yy/i)).toBeInTheDocument();
    expect(screen.getByText(/3 or 4-digit security code/i)).toBeInTheDocument();
    // Never reaches a pending/success state on invalid input.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

/* ── Submit flow ─────────────────────────────── */

describe("CheckoutExamplePage — submit flow", () => {
  it("transitions through pending to the success state on a valid submit", async () => {
    render(<CheckoutExamplePage />);
    fillValidPayment();
    const button = submit();

    expect(button).toHaveAttribute("aria-busy", "true");

    expect(await screen.findByText(/you.re all set/i)).toBeInTheDocument();
  });

  it("reaches the error state when the demo decline card is used", async () => {
    render(<CheckoutExamplePage />);
    fillValidPayment(DECLINE_CARD_NUMBER);
    submit();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/payment declined/i)).toBeInTheDocument();
  });
});
