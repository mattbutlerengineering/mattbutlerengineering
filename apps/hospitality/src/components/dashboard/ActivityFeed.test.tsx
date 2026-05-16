/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeed } from "./ActivityFeed.js";
import type { ReservationEvent } from "../../hooks/useReservationEvents";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="card">
      {title && <Heading>{title}</Heading>}
      {children}
    </div>
  ),
  Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
}));

function makeEvent(overrides: Partial<ReservationEvent> = {}): ReservationEvent {
  return {
    type: "reservation:created",
    venueId: "v1",
    timestamp: new Date().toISOString(),
    data: { id: "res-1" },
    ...overrides,
  };
}

describe("ActivityFeed", () => {
  it("shows connecting message when not connected and no events", () => {
    render(<ActivityFeed events={[]} isConnected={false} />);
    expect(screen.getByText("Connecting to live updates...")).toBeDefined();
  });

  it("shows 'No recent activity' when connected but no events", () => {
    render(<ActivityFeed events={[]} isConnected={true} />);
    expect(screen.getByText("No recent activity")).toBeDefined();
  });

  it("renders event descriptions for known event types", () => {
    const events: ReservationEvent[] = [
      makeEvent({ type: "reservation:created", timestamp: new Date().toISOString() }),
      makeEvent({ type: "reservation:cancelled", timestamp: new Date().toISOString() }),
    ];

    render(<ActivityFeed events={events} isConnected={true} />);
    expect(screen.getByText("New reservation created")).toBeDefined();
    expect(screen.getByText("Reservation cancelled")).toBeDefined();
  });

  it("renders raw type for unknown event types", () => {
    const events: ReservationEvent[] = [
      makeEvent({ type: "unknown:event" as any, timestamp: new Date().toISOString() }),
    ];

    render(<ActivityFeed events={events} isConnected={true} />);
    expect(screen.getByText("unknown:event")).toBeDefined();
  });

  it("renders the Live Activity card title", () => {
    render(<ActivityFeed events={[]} isConnected={true} />);
    expect(screen.getByText("Live Activity")).toBeDefined();
  });

  it("formats timestamps as 'just now' for recent events", () => {
    const events: ReservationEvent[] = [makeEvent({ timestamp: new Date().toISOString() })];

    render(<ActivityFeed events={events} isConnected={true} />);
    expect(screen.getByText("just now")).toBeDefined();
  });

  it("formats timestamps as minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const events: ReservationEvent[] = [makeEvent({ timestamp: fiveMinAgo })];

    render(<ActivityFeed events={events} isConnected={true} />);
    expect(screen.getByText("5m ago")).toBeDefined();
  });

  it("formats timestamps as hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const events: ReservationEvent[] = [makeEvent({ timestamp: twoHoursAgo })];

    render(<ActivityFeed events={events} isConnected={true} />);
    expect(screen.getByText("2h ago")).toBeDefined();
  });

  it("formats timestamps as date for old events", () => {
    const oldDate = new Date("2025-01-15T12:00:00Z").toISOString();
    const events: ReservationEvent[] = [makeEvent({ timestamp: oldDate })];

    render(<ActivityFeed events={events} isConnected={true} />);
    // The date string will be locale-dependent, just verify it rendered something
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(1);
  });

  it("renders all known event type labels correctly", () => {
    const eventTypes = [
      "reservation:created",
      "reservation:updated",
      "reservation:cancelled",
      "hold:created",
      "hold:released",
      "hold:confirmed",
      "table:updated",
    ] as const;

    const expectedLabels = [
      "New reservation created",
      "Reservation updated",
      "Reservation cancelled",
      "Table hold placed",
      "Table hold released",
      "Hold confirmed as reservation",
      "Table status changed",
    ];

    const events = eventTypes.map((type, i) =>
      makeEvent({ type, timestamp: new Date(Date.now() - i * 60000).toISOString() })
    );

    render(<ActivityFeed events={events} isConnected={true} />);
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });
});
