import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataList,
  Divider,
  Input,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./CheckoutExamplePage.module.css";

/* ── Domain ──────────────────────────────────── */

export interface OrderLineItem extends Record<string, unknown> {
  id: string;
  label: string;
  quantity: number;
  /** Unit price in integer minor units (cents) — never a float dollar amount. */
  unitPriceCents: number;
}

export interface PaymentDetails {
  cardName: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
}

export type PaymentFieldErrors = Partial<Record<keyof PaymentDetails, string>>;

export type CheckoutStatus = "idle" | "pending" | "success" | "error";

/* ── Fixture data (no service calls) ─────────── */

export const ORDER_LINE_ITEMS: OrderLineItem[] = [
  { id: "room", label: "Suite 402 · 3 nights", quantity: 1, unitPriceCents: 174000 },
  { id: "resort-fee", label: "Resort fee", quantity: 3, unitPriceCents: 3500 },
  { id: "transfer", label: "Airport transfer", quantity: 2, unitPriceCents: 4500 },
];

/** Flat demo rate — not tied to any real jurisdiction. */
const TAX_RATE = 0.0875;

export const EMPTY_PAYMENT: PaymentDetails = { cardName: "", cardNumber: "", expiry: "", cvc: "" };

/**
 * Publicly-documented card-network test number that always declines. It only
 * flips this local demo's status to "error" — this page has no network calls
 * and never sends card details anywhere.
 */
export const DECLINE_CARD_NUMBER = "4000 0000 0000 0002";

/* ── Pure money + validation helpers (exported for direct testing) ─── */

export function lineItemTotalCents(item: OrderLineItem): number {
  return item.quantity * item.unitPriceCents;
}

export function subtotalCents(items: OrderLineItem[]): number {
  return items.reduce((sum, item) => sum + lineItemTotalCents(item), 0);
}

export function taxCents(items: OrderLineItem[]): number {
  return Math.round(subtotalCents(items) * TAX_RATE);
}

export function totalCents(items: OrderLineItem[]): number {
  return subtotalCents(items) + taxCents(items);
}

/** Integer minor units (cents) → localized USD string, e.g. `formatMoney(174000)` → `"$1,740.00"`. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/\d{2}$/;

/** Validates the payment form; returns one message per invalid field. */
export function validatePayment(payment: PaymentDetails): PaymentFieldErrors {
  const errors: PaymentFieldErrors = {};
  if (!payment.cardName.trim()) errors.cardName = "Name on card is required";
  if (!/^\d{16}$/.test(payment.cardNumber.replace(/\s+/g, ""))) {
    errors.cardNumber = "Enter a 16-digit card number";
  }
  if (!EXPIRY_PATTERN.test(payment.expiry)) errors.expiry = "Enter expiry as MM/YY";
  if (!/^\d{3,4}$/.test(payment.cvc)) errors.cvc = "Enter a 3 or 4-digit security code";
  return errors;
}

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `const [payment, setPayment] = useState(EMPTY_PAYMENT);
const [errors, setErrors] = useState({});
const [status, setStatus] = useState("idle");

function handleSubmit(event) {
  event.preventDefault();
  const fieldErrors = validatePayment(payment);
  setErrors(fieldErrors);
  if (Object.keys(fieldErrors).length > 0) return;

  setStatus("pending");
  window.setTimeout(() => {
    setStatus(payment.cardNumber.trim() === DECLINE_CARD_NUMBER ? "error" : "success");
  }, 600);
}

<DataList items={lineItems} /> {/* subtotal, tax, total — all in integer cents */}
<Input label="Card number" error={!!errors.cardNumber} hint={errors.cardNumber ?? demoHint} />
<Button type="submit" isLoading={status === "pending"} loadingText="Processing…">
  Pay {formatMoney(total)}
</Button>`;

const COMPOSITION_NOTES: ReactNode = (
  <Stack gap="sm">
    <CompositionNote>
      Every price on the page — line items, subtotal, tax, total, and the submit button&apos;s own
      label — is derived from a single fixture of integer-cent amounts by pure, directly-tested
      functions, so no two numbers on the page can silently drift apart.
    </CompositionNote>
    <CompositionNote>
      Validation runs on submit, not on every keystroke, and reuses the same <code>Input</code>{" "}
      <code>error</code>/<code>hint</code> pair every other form example uses — each message is
      wired to its field via <code>aria-describedby</code> for free.
    </CompositionNote>
    <CompositionNote>
      Submitting flips through pending (via <code>Button</code>&apos;s own <code>isLoading</code>),
      then success or error. Entering the well-known test-network decline number swaps the outcome
      to error so both terminal states are reachable without leaving the page — no Stripe, no
      network call, no dependency added.
    </CompositionNote>
  </Stack>
);

/* ── Order summary ───────────────────────────── */

function OrderSummary() {
  const subtotal = subtotalCents(ORDER_LINE_ITEMS);
  const tax = taxCents(ORDER_LINE_ITEMS);
  const total = totalCents(ORDER_LINE_ITEMS);

  return (
    <Card title="Order summary">
      <Stack gap="md">
        <DataList
          orientation="horizontal"
          items={ORDER_LINE_ITEMS.map((item) => ({
            label: item.quantity > 1 ? `${item.label} × ${item.quantity}` : item.label,
            value: formatMoney(lineItemTotalCents(item)),
          }))}
        />
        <Divider />
        <DataList
          orientation="horizontal"
          striped
          items={[
            { label: "Subtotal", value: formatMoney(subtotal) },
            { label: "Tax", value: formatMoney(tax) },
            { label: "Total", value: formatMoney(total) },
          ]}
        />
      </Stack>
    </Card>
  );
}

/* ── Success / payment form ──────────────────── */

interface SuccessPanelProps {
  amount: string;
  onReset: () => void;
}

function SuccessPanel({ amount, onReset }: SuccessPanelProps) {
  return (
    <Stack gap="md">
      <div className={styles.statusRegion} role="status">
        <Badge variant="success" dot>
          Payment received
        </Badge>
      </div>
      <Text variant="display" as="h2">
        You&apos;re all set
      </Text>
      <Text variant="body" color="secondary">
        {amount} was charged to your card. This is a demo — no real payment was processed.
      </Text>
      <Stack direction="row" justify="end">
        <Button variant="secondary" onClick={onReset}>
          Start a new order
        </Button>
      </Stack>
    </Stack>
  );
}

interface PaymentFormProps {
  payment: PaymentDetails;
  errors: PaymentFieldErrors;
  status: CheckoutStatus;
  total: string;
  onChange: (patch: Partial<PaymentDetails>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function PaymentForm({ payment, errors, status, total, onChange, onSubmit }: PaymentFormProps) {
  const field = (key: keyof PaymentDetails) => (event: ChangeEvent<HTMLInputElement>) =>
    onChange({ [key]: event.target.value });

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="md">
        {status === "error" && (
          <Alert variant="error" title="Payment declined">
            Your card was declined. Check the details and try again — nothing was charged.
          </Alert>
        )}
        <Input
          label="Name on card"
          value={payment.cardName}
          onChange={field("cardName")}
          error={Boolean(errors.cardName)}
          hint={errors.cardName}
        />
        <Input
          label="Card number"
          inputMode="numeric"
          placeholder="4242 4242 4242 4242"
          value={payment.cardNumber}
          onChange={field("cardNumber")}
          error={Boolean(errors.cardNumber)}
          hint={errors.cardNumber ?? `Try ${DECLINE_CARD_NUMBER} to preview a declined payment`}
        />
        <div className={styles.fieldGrid}>
          <Input
            label="Expiry (MM/YY)"
            placeholder="08/28"
            value={payment.expiry}
            onChange={field("expiry")}
            error={Boolean(errors.expiry)}
            hint={errors.expiry}
          />
          <Input
            label="Security code"
            inputMode="numeric"
            placeholder="123"
            value={payment.cvc}
            onChange={field("cvc")}
            error={Boolean(errors.cvc)}
            hint={errors.cvc}
          />
        </div>
        <Text variant="caption" color="tertiary">
          This is a mock form — no card details are sent anywhere.
        </Text>
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            isLoading={status === "pending"}
            loadingText="Processing…"
          >
            Pay {total}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

/* ── Page ────────────────────────────────────── */

export function CheckoutExamplePage() {
  const [payment, setPayment] = useState<PaymentDetails>(EMPTY_PAYMENT);
  const [errors, setErrors] = useState<PaymentFieldErrors>({});
  const [status, setStatus] = useState<CheckoutStatus>("idle");

  const total = totalCents(ORDER_LINE_ITEMS);

  const patchPayment = (patch: Partial<PaymentDetails>) => {
    setPayment((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fieldErrors = validatePayment(payment);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setStatus("pending");
    const declined = payment.cardNumber.trim() === DECLINE_CARD_NUMBER;
    window.setTimeout(() => {
      setStatus(declined ? "error" : "success");
    }, 600);
  };

  const handleReset = () => {
    setPayment(EMPTY_PAYMENT);
    setErrors({});
    setStatus("idle");
  };

  return (
    <ExamplePageLayout
      name="Checkout"
      description="Payment form with an order summary, inline validation, and simulated submitting/success/error states"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <div className={styles.layout}>
        <OrderSummary />
        <Card title="Payment details">
          {status === "success" ? (
            <SuccessPanel amount={formatMoney(total)} onReset={handleReset} />
          ) : (
            <PaymentForm
              payment={payment}
              errors={errors}
              status={status}
              total={formatMoney(total)}
              onChange={patchPayment}
              onSubmit={handleSubmit}
            />
          )}
        </Card>
      </div>
    </ExamplePageLayout>
  );
}

CheckoutExamplePage.displayName = "CheckoutExamplePage";
