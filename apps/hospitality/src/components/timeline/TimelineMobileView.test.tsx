import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TimelineMobileView, type TimelineMobileViewProps } from "./TimelineMobileView.js";
import type { Reservation, Table } from "@mbe/types";

/* ── Fixtures ───────────────────────────────────────── */

const START = new Date(2026, 8, 9, 18, 0).toISOString();
const END = new Date(2026, 8, 9, 20, 0).toISOString();

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    date: "2026-09-09",
    startTime: START,
    endTime: END,
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
    venueId: "venue-1",
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "t1",
    name: "Table 1",
    tableNumber: null,
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

const alice = makeReservation({ id: "r1", guestName: "Alice", status: "CONFIRMED" });
const bob = makeReservation({ id: "r2", guestName: "Bob", status: "COMPLETED" });
const cara = makeReservation({ id: "r3", guestName: "Cara", status: "PENDING" });
const dan = makeReservation({ id: "r4", guestName: "Dan", status: "CANCELLED" });

function renderView(overrides: Partial<TimelineMobileViewProps> = {}) {
  return render(
    <TimelineMobileView
      reservations={[alice, bob, cara, dan]}
      tables={[makeTable()]}
      onReservationClick={vi.fn()}
      {...overrides}
    />
  );
}

/** A reservation card is a button whose name starts with the guest's name. */
const card = (guestName: string) =>
  screen.queryByRole("button", { name: new RegExp(`^${guestName}, `) });

/* ── Tests ──────────────────────────────────────────── */

describe("TimelineMobileView", () => {
  describe("status chips (A4.2 phone half, P12)", () => {
    it("labels the CONFIRMED chip 'Confirmed' — never 'Seated', which is a fact about the floor", () => {
      renderView();
      expect(screen.getByRole("button", { name: "Confirmed" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Seated" })).toBeNull();
    });

    it("still filters CONFIRMED ∪ COMPLETED under the Confirmed chip", () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
      expect(card("Alice")).toBeInTheDocument();
      expect(card("Bob")).toBeInTheDocument();
      expect(card("Cara")).toBeNull();
      expect(card("Dan")).toBeNull();
    });
  });

  describe("the Seated mark (ux Decision a)", () => {
    it("marks only the cards whose id is in seatedIds, and says so in the card's name", () => {
      renderView({ seatedIds: new Set(["r1"]) });
      const aliceCard = card("Alice")!;
      expect(within(aliceCard).getByRole("img", { name: "Seated" })).toBeInTheDocument();
      expect(aliceCard).toHaveAccessibleName(/, seated$/);
      for (const name of ["Bob", "Cara", "Dan"]) {
        const other = card(name)!;
        expect(within(other).queryByRole("img", { name: "Seated" })).toBeNull();
        expect(other).not.toHaveAccessibleName(/seated/);
      }
    });

    it("shows no mark when seatedIds is absent", () => {
      renderView();
      expect(screen.queryByRole("img", { name: "Seated" })).toBeNull();
    });
  });
});
