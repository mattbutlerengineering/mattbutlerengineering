import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import { BookingConfirmedExamplePage, BOOKING_SUMMARY } from "./BookingConfirmedExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs preserve the semantics the assertions
// depend on: Text honors the `as` element (headings stay headings), Button
// exposes its variant for CTA checks, Badge renders its variant + label, and
// DataList renders queryable dt/dd pairs for the summary block.
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
  }: {
    children?: ReactNode;
    variant?: string;
    onClick?: () => void;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  );
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Badge = ({ children, variant = "neutral" }: { children?: ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  );
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
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
  return { Text, Button, Stack, Divider, Badge, Card, DataList };
});

describe("BookingConfirmedExamplePage", () => {
  it("renders the showcase header with page name and description", () => {
    render(<BookingConfirmedExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Booking Confirmed" })).toBeInTheDocument();
    expect(
      screen.getByText("Success result page with a reservation summary and next-step CTAs")
    ).toBeInTheDocument();
  });

  it("announces a success status region containing a confirmed badge", () => {
    render(<BookingConfirmedExamplePage />);
    const status = screen.getByRole("status");
    const badge = within(status).getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "success");
    expect(badge).toHaveTextContent("Confirmed");
  });

  it("renders the confirmation headline", () => {
    render(<BookingConfirmedExamplePage />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Your reservation is confirmed" })
    ).toBeInTheDocument();
  });

  it("renders a summary block of what was created (dates, party, venue)", () => {
    render(<BookingConfirmedExamplePage />);
    expect(
      screen.getByRole("heading", { level: 3, name: "Reservation summary" })
    ).toBeInTheDocument();
    // Every summary item's label and value is present in the DataList
    for (const { label, value } of BOOKING_SUMMARY) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("summary includes venue, dates, and party details", () => {
    render(<BookingConfirmedExamplePage />);
    const labels = BOOKING_SUMMARY.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["Property", "Dates", "Party"]));
  });

  it("offers at least two next-step CTAs including a primary action", () => {
    render(<BookingConfirmedExamplePage />);
    const view = screen.getByRole("button", { name: "View reservation" });
    expect(view).toHaveAttribute("data-variant", "primary");
    expect(screen.getByRole("button", { name: "Add to calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to dashboard" })).toBeInTheDocument();
  });
});
