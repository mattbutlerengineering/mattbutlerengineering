import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { LapsingGuestsWidget } from "./LapsingGuestsWidget.js";
import type { LapsingGuest } from "@mbe/types";

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
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

const mockGuest: LapsingGuest = {
  guestId: "g-1",
  name: "Jane Doe",
  email: "jane@example.com",
  phone: null,
  communicationPreference: "both",
  avgFrequencyDays: 7,
  daysSinceLastVisit: 21,
  daysOverdue: 7,
};

describe("LapsingGuestsWidget", () => {
  const onSendWinBack = vi.fn();

  beforeEach(() => {
    onSendWinBack.mockClear();
  });

  it("renders empty state when no lapsing guests", () => {
    render(<LapsingGuestsWidget guests={[]} onSendWinBack={onSendWinBack} />);
    expect(screen.getByText(/no lapsing guests/i)).toBeInTheDocument();
  });

  it("renders lapsing guest name", () => {
    render(<LapsingGuestsWidget guests={[mockGuest]} onSendWinBack={onSendWinBack} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders usual frequency", () => {
    render(<LapsingGuestsWidget guests={[mockGuest]} onSendWinBack={onSendWinBack} />);
    expect(screen.getByText(/every 7 day/i)).toBeInTheDocument();
  });

  it("renders days overdue", () => {
    render(<LapsingGuestsWidget guests={[mockGuest]} onSendWinBack={onSendWinBack} />);
    expect(screen.getByText(/7 day/i)).toBeInTheDocument();
  });

  it("calls onSendWinBack when button clicked", () => {
    render(<LapsingGuestsWidget guests={[mockGuest]} onSendWinBack={onSendWinBack} />);
    const btn = screen.getByRole("button", { name: /send win-back/i });
    fireEvent.click(btn);
    expect(onSendWinBack).toHaveBeenCalledWith("g-1");
  });

  it("hides win-back button for transactional_only guests", () => {
    const guest: LapsingGuest = { ...mockGuest, communicationPreference: "transactional_only" };
    render(<LapsingGuestsWidget guests={[guest]} onSendWinBack={onSendWinBack} />);
    expect(screen.queryByRole("button", { name: /send win-back/i })).not.toBeInTheDocument();
  });
});
