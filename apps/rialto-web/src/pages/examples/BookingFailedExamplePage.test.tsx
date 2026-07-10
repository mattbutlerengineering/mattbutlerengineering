import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import { BookingFailedExamplePage, FAILURE_DETAILS } from "./BookingFailedExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs preserve the semantics the assertions
// depend on: Text honors the `as` element (headings stay headings), Button
// exposes its variant for CTA checks, Badge renders its variant + label, and
// DataList renders queryable dt/dd pairs for the failure detail block.
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

describe("BookingFailedExamplePage", () => {
  it("renders the showcase header with page name and description", () => {
    render(<BookingFailedExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Booking Failed" })).toBeInTheDocument();
    expect(
      screen.getByText("Failure result page with a retry CTA and a support escape hatch")
    ).toBeInTheDocument();
  });

  it("announces an error status region containing a declined badge", () => {
    render(<BookingFailedExamplePage />);
    const alert = screen.getByRole("alert");
    const badge = within(alert).getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "error");
    expect(badge).toHaveTextContent("Payment declined");
  });

  it("renders the failure headline", () => {
    render(<BookingFailedExamplePage />);
    expect(
      screen.getByRole("heading", { level: 2, name: "We couldn’t confirm your booking" })
    ).toBeInTheDocument();
  });

  it("explains what went wrong in plain language without blaming the user", () => {
    render(<BookingFailedExamplePage />);
    const copy = screen.getByText(/your card was declined/i);
    expect(copy).toBeInTheDocument();
    // Reassures that no charge was made
    expect(copy).toHaveTextContent(/haven’t charged you/i);
  });

  it("renders a detail block describing the failed attempt", () => {
    render(<BookingFailedExamplePage />);
    expect(screen.getByRole("heading", { level: 3, name: "What happened" })).toBeInTheDocument();
    for (const { label, value } of FAILURE_DETAILS) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("offers a primary retry CTA and a secondary support escape path", () => {
    render(<BookingFailedExamplePage />);
    const retry = screen.getByRole("button", { name: "Try payment again" });
    expect(retry).toHaveAttribute("data-variant", "primary");
    const support = screen.getByRole("button", { name: "Contact support" });
    expect(support).toHaveAttribute("data-variant", "secondary");
    expect(screen.getByRole("button", { name: "Back to dashboard" })).toBeInTheDocument();
  });
});
