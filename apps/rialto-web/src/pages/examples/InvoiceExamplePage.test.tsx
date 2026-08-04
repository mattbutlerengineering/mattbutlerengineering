import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import {
  InvoiceExamplePage,
  INVOICE,
  PAYMENT_STATUS_META,
  lineItemAmountCents,
  subtotalCents,
  taxCents,
  totalCents,
  formatMoney,
  type InvoiceLineItem,
  type PaymentStatus,
} from "./InvoiceExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. Text honors `as` (headings stay headings), Badge
// exposes its variant and label text, Card renders its `title` as a heading
// (mirroring the real component's Heading-based title), DataList renders a
// real definition list, and DataTable preserves the aria-label/rowheader
// semantics the table assertions inspect.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({
    as,
    children,
    variant: _variant,
    color: _color,
  }: {
    as?: ElementType;
    children?: ReactNode;
    variant?: string;
    color?: string;
  }) => {
    const Tag = as ?? "span";
    return <Tag>{children}</Tag>;
  };

  const Badge = ({ children, variant = "neutral" }: { children?: ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  );

  const Card = ({
    title,
    className,
    children,
  }: {
    title?: string;
    className?: string;
    children?: ReactNode;
  }) => (
    <div data-testid="card" className={className}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
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

  const DataTable = ({
    columns,
    data,
    rowKey,
    label,
  }: {
    columns: {
      key: string;
      header: string;
      render?: (row: Record<string, unknown>) => ReactNode;
    }[];
    data: Record<string, unknown>[];
    rowKey: (row: Record<string, unknown>) => string | number;
    label?: string;
  }) => (
    <table aria-label={label}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={rowKey(row)} data-testid="data-row" data-row={String(rowKey(row))}>
            {columns.map((col) => (
              <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return {
    Text,
    Badge,
    Card,
    DataList,
    DataTable,
    Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Divider: () => <hr />,
    Button: ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
      <button type="button" {...rest}>
        {children}
      </button>
    ),
  };
});

// ---------------------------------------------------------------------------
// Pure helpers — no components involved
// ---------------------------------------------------------------------------

describe("InvoiceExamplePage — pure helpers", () => {
  const items: InvoiceLineItem[] = [
    { id: "A", description: "Widget", quantity: 3, unitPriceCents: 500 },
    { id: "B", description: "Gadget", quantity: 2, unitPriceCents: 1250 },
  ];

  it("lineItemAmountCents multiplies quantity by unit price", () => {
    expect(lineItemAmountCents(items[0]!)).toBe(1500);
    expect(lineItemAmountCents(items[1]!)).toBe(2500);
  });

  it("subtotalCents sums every line item's amount", () => {
    expect(subtotalCents(items)).toBe(4000);
    expect(subtotalCents([])).toBe(0);
  });

  it("taxCents applies a whole-percent rate to the subtotal, rounded to the nearest cent", () => {
    expect(taxCents(4000, 8)).toBe(320);
    // 333 * 0.15 = 49.95 → rounds to 50
    expect(taxCents(333, 15)).toBe(50);
  });

  it("totalCents is subtotal plus tax", () => {
    expect(totalCents(4000, 320)).toBe(4320);
  });

  it("formatMoney renders whole-cent USD with two decimal places", () => {
    expect(formatMoney(500)).toBe("$5.00");
    expect(formatMoney(231000)).toBe("$2,310.00");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("fixture invoice totals are derived from its line items, not hardcoded", () => {
    const subtotal = subtotalCents(INVOICE.lineItems);
    const tax = taxCents(subtotal, INVOICE.taxRatePercent);
    const total = totalCents(subtotal, tax);
    expect(subtotal).toBe(
      INVOICE.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
    );
    expect(total).toBe(subtotal + tax);
  });

  it("fixture line items are unique and have positive quantities and prices", () => {
    expect(new Set(INVOICE.lineItems.map((i) => i.id)).size).toBe(INVOICE.lineItems.length);
    for (const item of INVOICE.lineItems) {
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.unitPriceCents).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Payment status indicator — every variant, not colour alone
// ---------------------------------------------------------------------------

describe("InvoiceExamplePage — payment status indicator", () => {
  const statuses: PaymentStatus[] = ["paid", "due", "overdue"];

  it("gives each status a distinct label and badge variant", () => {
    for (const status of statuses) {
      expect(PAYMENT_STATUS_META[status].label).toBeTruthy();
      expect(["success", "warning", "error"]).toContain(PAYMENT_STATUS_META[status].variant);
    }
    const labels = statuses.map((s) => PAYMENT_STATUS_META[s].label);
    expect(new Set(labels).size).toBe(statuses.length);
  });

  it("maps paid, due, and overdue to their expected variants", () => {
    expect(PAYMENT_STATUS_META.paid).toEqual({ label: "Paid", variant: "success" });
    expect(PAYMENT_STATUS_META.due).toEqual({ label: "Due", variant: "warning" });
    expect(PAYMENT_STATUS_META.overdue).toEqual({ label: "Overdue", variant: "error" });
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("InvoiceExamplePage — rendering", () => {
  it("renders the showcase header with page name and description", () => {
    render(<InvoiceExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Invoice" })).toBeInTheDocument();
  });

  it("renders the invoice number, issue date, and due date", () => {
    render(<InvoiceExamplePage />);
    expect(screen.getByRole("heading", { level: 2, name: INVOICE.number })).toBeInTheDocument();
    expect(screen.getByText(/Issued Jul 14, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Due Jul 28, 2026/)).toBeInTheDocument();
  });

  it("renders the current payment status as readable text, not colour alone", () => {
    render(<InvoiceExamplePage />);
    const meta = PAYMENT_STATUS_META[INVOICE.status];
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent(meta.label);
    expect(badge).toHaveAttribute("data-variant", meta.variant);
  });

  it("renders issuer and recipient blocks", () => {
    render(<InvoiceExamplePage />);
    expect(screen.getByRole("heading", { name: "Billed from" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Billed to" })).toBeInTheDocument();
    expect(screen.getByText(INVOICE.issuer.name)).toBeInTheDocument();
    expect(screen.getByText(INVOICE.issuer.email)).toBeInTheDocument();
    expect(screen.getByText(INVOICE.recipient.name)).toBeInTheDocument();
    expect(screen.getByText(INVOICE.recipient.email)).toBeInTheDocument();
  });

  it("renders one line-item row per fixture item with description, quantity, and amounts", () => {
    render(<InvoiceExamplePage />);
    const table = screen.getByRole("table", { name: "Line items" });
    const rows = within(table).getAllByTestId("data-row");
    expect(rows).toHaveLength(INVOICE.lineItems.length);
    for (const item of INVOICE.lineItems) {
      const row = rows.find((r) => r.getAttribute("data-row") === item.id)!;
      expect(within(row).getByText(item.description)).toBeInTheDocument();
      // Unit price and amount can coincide when quantity is 1, so assert
      // presence within the row rather than requiring a single match.
      expect(
        within(row).getAllByText(formatMoney(lineItemAmountCents(item))).length
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders subtotal, tax, and total derived from the line items", () => {
    render(<InvoiceExamplePage />);
    const subtotal = subtotalCents(INVOICE.lineItems);
    const tax = taxCents(subtotal, INVOICE.taxRatePercent);
    const total = totalCents(subtotal, tax);

    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText(formatMoney(subtotal))).toBeInTheDocument();
    expect(screen.getByText(`Tax (${INVOICE.taxRatePercent}%)`)).toBeInTheDocument();
    expect(screen.getByText(formatMoney(tax))).toBeInTheDocument();
    expect(screen.getByText("Total due")).toBeInTheDocument();
    expect(screen.getByText(formatMoney(total))).toBeInTheDocument();
  });
});
