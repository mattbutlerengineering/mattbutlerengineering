import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { DepositExposureWidget } from "./DepositExposureWidget.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="card">
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
  Text: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    color?: string;
    variant?: string;
  }) => <span {...props}>{children}</span>,
}));

describe("DepositExposureWidget", () => {
  it("renders the deposit-at-risk count", () => {
    render(<DepositExposureWidget depositAtRiskCount={3} noShowExposureCents={0} currency="usd" />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders the no-show exposure as formatted currency", () => {
    render(
      <DepositExposureWidget depositAtRiskCount={0} noShowExposureCents={12345} currency="usd" />
    );
    expect(screen.getByText("$123.45")).toBeInTheDocument();
  });

  it("renders the zero-state without error", () => {
    render(<DepositExposureWidget depositAtRiskCount={0} noShowExposureCents={0} currency="usd" />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });
});
