import type { ReactNode } from "react";
import { Badge, Card, DataList, DataTable, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./InvoiceExamplePage.module.css";

/* ── Domain ──────────────────────────────────── */

export type PaymentStatus = "paid" | "due" | "overdue";

export interface InvoiceParty {
  name: string;
  address: string;
  email: string;
}

export interface InvoiceLineItem extends Record<string, unknown> {
  id: string;
  description: string;
  quantity: number;
  /** Per-unit price in integer cents — every amount stays in minor units until formatting. */
  unitPriceCents: number;
}

export interface InvoiceRecord {
  number: string;
  /** ISO date — lexicographic order is chronological order. */
  issueDate: string;
  dueDate: string;
  status: PaymentStatus;
  issuer: InvoiceParty;
  recipient: InvoiceParty;
  /** Whole-percent tax rate applied to the subtotal. */
  taxRatePercent: number;
  lineItems: InvoiceLineItem[];
}

/* ── Fixture data (no service calls) ─────────── */

export const INVOICE: InvoiceRecord = {
  number: "INV-20268",
  issueDate: "2026-07-14",
  dueDate: "2026-07-28",
  status: "due",
  issuer: {
    name: "Aurora Hospitality Group",
    address: "88 Harborview Terrace, Portland, ME 04101",
    email: "billing@aurorahospitality.example",
  },
  recipient: {
    name: "Rowan & Co. Events",
    address: "412 Cedar Grove Lane, Burlington, VT 05401",
    email: "accounts@rowanandco.example",
  },
  taxRatePercent: 8,
  lineItems: [
    { id: "LI-1", description: "Harbor Suite — 3 nights", quantity: 3, unitPriceCents: 42000 },
    {
      id: "LI-2",
      description: "Private event space — half day",
      quantity: 1,
      unitPriceCents: 65000,
    },
    { id: "LI-3", description: "Airport transfer", quantity: 2, unitPriceCents: 9000 },
    { id: "LI-4", description: "In-room dining service", quantity: 4, unitPriceCents: 5500 },
  ],
};

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; variant: "success" | "warning" | "error" }
> = {
  paid: { label: "Paid", variant: "success" },
  due: { label: "Due", variant: "warning" },
  overdue: { label: "Overdue", variant: "error" },
};

/* ── Pure helpers (exported for direct testing) ─────────── */

/** Line total in integer cents — quantity is always a whole number, so this stays exact. */
export function lineItemAmountCents(item: InvoiceLineItem): number {
  return item.quantity * item.unitPriceCents;
}

/** Sum of every line item's amount, in integer cents. */
export function subtotalCents(items: InvoiceLineItem[]): number {
  return items.reduce((sum, item) => sum + lineItemAmountCents(item), 0);
}

/** Tax owed on the subtotal, in integer cents, rounded to the nearest cent. */
export function taxCents(subtotal: number, taxRatePercent: number): number {
  return Math.round((subtotal * taxRatePercent) / 100);
}

/** Subtotal plus tax, in integer cents. */
export function totalCents(subtotal: number, tax: number): number {
  return subtotal + tax;
}

/** Whole-cent USD amount formatted as currency, e.g. `formatMoney(231000)` → `"$2,310.00"`. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/* ── Display formatting ──────────────────────── */

// UTC keeps fixture dates stable regardless of the viewer's timezone.
const INVOICE_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatInvoiceDate(dateStr: string): string {
  return INVOICE_DATE.format(new Date(dateStr));
}

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `<Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>

<DataTable<InvoiceLineItem>
  columns={[
    { key: "description", header: "Description", rowHeader: true },
    { key: "quantity", header: "Qty", align: "right" },
    { key: "unitPriceCents", header: "Unit price", align: "right", render: (row) => formatMoney(row.unitPriceCents) },
    { key: "amount", header: "Amount", align: "right", render: (row) => formatMoney(lineItemAmountCents(row)) },
  ]}
  data={invoice.lineItems}
  rowKey={(row) => row.id}
  label="Line items"
/>

// Every total is derived from the line items — never hardcoded.
const subtotal = subtotalCents(invoice.lineItems);
const tax = taxCents(subtotal, invoice.taxRatePercent);
const total = totalCents(subtotal, tax);`;

const COMPOSITION_NOTES: ReactNode = (
  <Stack gap="sm">
    <CompositionNote>
      Every money value stays an integer number of cents until the final render — line amounts,
      subtotal, tax, and total are all derived from <code>lineItems</code> by pure functions, so the
      printed total can never drift from the line items above it, and no floating-point arithmetic
      ever touches a currency amount.
    </CompositionNote>
    <CompositionNote>
      The payment status is a <code>Badge</code> whose label text (&ldquo;Paid&rdquo;,
      &ldquo;Due&rdquo;, &ldquo;Overdue&rdquo;) always differs by status, so the state reads
      correctly in greyscale or for screen reader users — never signalled by colour alone.
    </CompositionNote>
    <CompositionNote>
      A <code>@media print</code> rule isolates this document from the surrounding showcase chrome
      (global nav, sidebar, page header, footer) so printing the page produces a clean invoice, not
      a screenshot of the showcase shell.
    </CompositionNote>
  </Stack>
);

/* ── Page component ──────────────────────────── */

export function InvoiceExamplePage() {
  const subtotal = subtotalCents(INVOICE.lineItems);
  const tax = taxCents(subtotal, INVOICE.taxRatePercent);
  const total = totalCents(subtotal, tax);
  const statusMeta = PAYMENT_STATUS_META[INVOICE.status];

  return (
    <ExamplePageLayout
      name="Invoice"
      description="Document-layout pattern: issuer/recipient header, a derived line-item table, totals, a payment-status indicator, and a print stylesheet"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <div className={styles.printable}>
        <Stack gap="lg">
          <Card className={styles.headerCard}>
            <div className={styles.headerRow}>
              <div>
                <Text variant="display" as="h2">
                  {INVOICE.number}
                </Text>
                <Text variant="caption" color="secondary">
                  Issued {formatInvoiceDate(INVOICE.issueDate)} · Due{" "}
                  {formatInvoiceDate(INVOICE.dueDate)}
                </Text>
              </div>
              <Badge variant={statusMeta.variant} size="md">
                {statusMeta.label}
              </Badge>
            </div>
          </Card>

          <div className={styles.parties}>
            <Card variant="flat" title="Billed from">
              <DataList
                orientation="horizontal"
                items={[
                  { label: "Name", value: INVOICE.issuer.name },
                  { label: "Address", value: INVOICE.issuer.address },
                  { label: "Email", value: INVOICE.issuer.email },
                ]}
              />
            </Card>
            <Card variant="flat" title="Billed to">
              <DataList
                orientation="horizontal"
                items={[
                  { label: "Name", value: INVOICE.recipient.name },
                  { label: "Address", value: INVOICE.recipient.address },
                  { label: "Email", value: INVOICE.recipient.email },
                ]}
              />
            </Card>
          </div>

          <Card variant="flat">
            <DataTable<InvoiceLineItem>
              columns={[
                { key: "description", header: "Description", rowHeader: true },
                { key: "quantity", header: "Qty", align: "right" as const },
                {
                  key: "unitPrice",
                  header: "Unit price",
                  align: "right" as const,
                  render: (row: InvoiceLineItem) => formatMoney(row.unitPriceCents),
                },
                {
                  key: "amount",
                  header: "Amount",
                  align: "right" as const,
                  render: (row: InvoiceLineItem) => formatMoney(lineItemAmountCents(row)),
                },
              ]}
              data={INVOICE.lineItems}
              rowKey={(row) => row.id}
              label="Line items"
              striped
            />
          </Card>

          <div className={styles.totals}>
            <div className={styles.totalsRow}>
              <Text variant="body" color="secondary">
                Subtotal
              </Text>
              <Text variant="body">{formatMoney(subtotal)}</Text>
            </div>
            <div className={styles.totalsRow}>
              <Text variant="body" color="secondary">
                {`Tax (${INVOICE.taxRatePercent}%)`}
              </Text>
              <Text variant="body">{formatMoney(tax)}</Text>
            </div>
            <div className={styles.totalsRowFinal}>
              <Text variant="label" as="span">
                Total due
              </Text>
              <Text variant="display" as="span">
                {formatMoney(total)}
              </Text>
            </div>
          </div>
        </Stack>
      </div>
    </ExamplePageLayout>
  );
}

InvoiceExamplePage.displayName = "InvoiceExamplePage";
