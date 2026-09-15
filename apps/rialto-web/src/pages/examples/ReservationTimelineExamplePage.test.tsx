import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import {
  ReservationTimelineExamplePage,
  ROOM_COUNT,
  RESERVATION_DENSITY,
} from "./ReservationTimelineExamplePage.js";
import { defaultDateRange, makeReservations, makeRooms } from "../../data/tapechart-fixtures.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in worktrees, so — like every
// other app page test — we stub it. Card/Button/Text/Divider are the pieces
// ExamplePageLayout renders through; the TapeChart stub reports what this
// page handed it (room/reservation counts, current selection) and renders
// one button per reservation so selection can be driven the way a user
// drives it. Rendering itself is proved by Playwright.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "p";
    return <Tag>{children}</Tag>;
  };
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Card = ({
    children,
    variant,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & { variant?: string }) => (
    <div data-variant={variant} {...rest}>
      {children}
    </div>
  );
  const Button = ({ children, ...rest }: HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...rest}>
      {children}
    </button>
  );
  const TapeChart = ({
    rooms,
    reservations,
    onReservationClick,
    selectedReservationId,
  }: {
    rooms: { id: string }[];
    reservations: { id: string; guestName?: string }[];
    onReservationClick?: (r: { id: string; guestName?: string }) => void;
    selectedReservationId?: string | null;
  }) => (
    <div
      data-testid="tapechart-stub"
      data-rooms={rooms.length}
      data-reservations={reservations.length}
      data-selected={selectedReservationId ?? ""}
    >
      {reservations.map((r) => (
        <button key={r.id} type="button" onClick={() => onReservationClick?.(r)}>
          {r.guestName ?? r.id}
        </button>
      ))}
    </div>
  );
  return { Text, Stack, Divider, Card, Button, TapeChart };
});

describe("ReservationTimelineExamplePage", () => {
  it("renders inside ExamplePageLayout with the Reservation Timeline heading", () => {
    render(<ReservationTimelineExamplePage />);
    expect(screen.getByRole("heading", { name: "Reservation Timeline" })).toBeInTheDocument();
  });

  it("hands TapeChart the fixture rooms and reservations for the current date range", () => {
    render(<ReservationTimelineExamplePage />);
    const rooms = makeRooms(ROOM_COUNT);
    const { startDate, endDate } = defaultDateRange();
    const reservations = makeReservations(rooms, startDate, endDate, RESERVATION_DENSITY);

    const chart = screen.getByTestId("tapechart-stub");
    expect(chart).toHaveAttribute("data-rooms", String(ROOM_COUNT));
    expect(chart).toHaveAttribute("data-reservations", String(reservations.length));
    expect(reservations.length).toBeGreaterThan(0);
  });

  it("shows no selection details until a reservation bar is clicked", () => {
    render(<ReservationTimelineExamplePage />);
    expect(screen.queryByTestId("reservation-timeline-selection")).not.toBeInTheDocument();
  });

  it("clicking a reservation bar reveals its details and marks it selected", async () => {
    const user = userEvent.setup();
    render(<ReservationTimelineExamplePage />);

    const chart = screen.getByTestId("tapechart-stub");
    const firstBar = within(chart).getAllByRole("button")[0]!;
    const guestName = firstBar.textContent ?? "";
    await user.click(firstBar);

    const card = screen.getByTestId("reservation-timeline-selection");
    expect(card).toHaveTextContent(guestName);
    expect(chart).not.toHaveAttribute("data-selected", "");
  });
});
