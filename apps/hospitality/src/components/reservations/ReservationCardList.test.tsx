import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { Reservation } from "@mbe/types";
import { ReservationCardList } from "./ReservationCardList.js";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    date: "2026-01-15",
    startTime: "2026-01-15T18:00:00Z",
    endTime: "2026-01-15T20:00:00Z",
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Alice",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "t1",
    venueId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const RESERVATIONS: Reservation[] = [
  makeReservation(),
  makeReservation({ id: "r2", guestName: "Bob", partySize: 1, status: "PENDING", tableId: "t2" }),
  makeReservation({ id: "r3", guestName: null, partySize: 6, status: "CANCELLED", tableId: "t3" }),
];

const TABLE_NAMES: Record<string, string> = { t1: "Table 1", t2: "Patio 2", t3: "Bar 3" };

function renderList(overrides: Partial<Parameters<typeof ReservationCardList>[0]> = {}) {
  const onView = vi.fn();
  render(
    <ReservationCardList
      reservations={RESERVATIONS}
      tableNameFor={(r) => TABLE_NAMES[r.tableId] ?? "Table unavailable"}
      onView={onView}
      {...overrides}
    />
  );
  return { onView };
}

describe("ReservationCardList", () => {
  it("renders one list item per reservation, in the order given", () => {
    renderList();

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Alice");
    expect(items[1]).toHaveTextContent("Bob");
  });

  it("titles each card with a heading carrying the time and guest name", () => {
    renderList();

    const items = screen.getAllByRole("listitem");
    const heading = within(items[0]!).getByRole("heading");
    expect(heading).toHaveTextContent("Alice");
    expect(heading.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("keeps the heading to phrasing content: no paragraph inside the h2", () => {
    renderList();

    const heading = within(screen.getAllByRole("listitem")[0]!).getByRole("heading", { level: 2 });
    expect(heading.querySelector("p")).toBeNull();
  });

  it("falls back to the guest word when the reservation has no name", () => {
    renderList();

    const third = screen.getAllByRole("listitem")[2]!;
    expect(within(third).getByRole("heading")).toHaveTextContent("Guest");
  });

  it("shows party size in words, the table name and the status word on each card", () => {
    renderList();

    const [first, second, third] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Party of 2");
    expect(first).toHaveTextContent("Table 1");
    expect(first).toHaveTextContent("Confirmed");
    expect(second).toHaveTextContent("Party of 1");
    expect(second).toHaveTextContent("Patio 2");
    expect(second).toHaveTextContent("Pending");
    expect(third).toHaveTextContent("Party of 6");
    expect(third).toHaveTextContent("Bar 3");
    expect(third).toHaveTextContent("Cancelled");
  });

  it("shows notes only when the reservation has them", () => {
    renderList({
      reservations: [
        makeReservation({ notes: "Window seat" }),
        makeReservation({ id: "r2", guestName: "Bob" }),
      ],
    });

    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Window seat");
    expect(second).not.toHaveTextContent("Window seat");
  });

  it("gives each View action a visible 'View' label and an accessible name with the guest", () => {
    renderList();

    const view = screen.getByRole("button", { name: "View Alice reservation on timeline" });
    expect(view).toHaveTextContent("View");
    expect(
      screen.getByRole("button", { name: "View Guest reservation on timeline" })
    ).toBeInTheDocument();
  });

  it("hands the tapped reservation to onView", () => {
    const { onView } = renderList();

    fireEvent.click(screen.getByRole("button", { name: "View Bob reservation on timeline" }));

    expect(onView).toHaveBeenCalledWith(RESERVATIONS[1]);
  });

  it("shows the returning-guest badge only past the first visit", () => {
    renderList({
      reservations: [
        makeReservation({ guest: { visitCount: 3, communicationPreference: null } }),
        makeReservation({
          id: "r2",
          guestName: "Bob",
          guest: { visitCount: 1, communicationPreference: null },
        }),
      ],
    });

    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("3rd visit");
    expect(second).not.toHaveTextContent("visit");
  });
});
