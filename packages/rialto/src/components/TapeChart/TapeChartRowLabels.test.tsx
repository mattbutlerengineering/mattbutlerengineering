import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TapeChartListView } from "./TapeChartListView";
import { TapeChartMobileStack } from "./TapeChartMobileStack";
import { DEFAULT_STRINGS } from "./defaultStrings";
import { useTapeChartI18n } from "./useTapeChartI18n";
import type { TapeChartReservation, TapeChartRoom } from "./types";

// WCAG 2.5.3 (Label in Name). axe's label-content-name-mismatch cannot fail in
// rialto's jsdom (null canvas context, see #9302), so these assertions are
// strict: the accessible name must START with the visible run, in order, and
// the visible text must have spaces between its parts.

const rooms: TapeChartRoom[] = [{ id: "r1", name: "Room 101" }];
const base: TapeChartReservation = {
  id: "a",
  roomId: "r1",
  start: "2026-03-10",
  end: "2026-03-13",
  status: "confirmed",
  guestName: "Jane Doe",
  ratePerNight: 15000,
  currency: "USD",
};

const cases: Array<{ name: string; r: TapeChartReservation; visible: string; stack: string }> = [
  {
    name: "reservation with price",
    r: base,
    visible: "Jane Doe Room 101 · 3 nights Confirmed · $450.00",
    stack: "Jane Doe Room 101 · 3 nights Confirmed",
  },
  {
    name: "reservation with source",
    r: { ...base, source: "Booking.com" },
    visible: "Jane Doe Room 101 · 3 nights · Booking.com Confirmed · $450.00",
    // The mobile stack never renders `source`, so its name must not claim it.
    stack: "Jane Doe Room 101 · 3 nights Confirmed",
  },
  {
    name: "blocked row",
    r: { ...base, guestName: undefined, ratePerNight: undefined, blockedReason: "Maintenance" },
    visible: "Maintenance Room 101 · 3 nights Confirmed",
    stack: "Maintenance Room 101 · 3 nights Confirmed",
  },
];

function Harness({ view, r }: { view: "list" | "stack"; r: TapeChartReservation }) {
  const formatters = useTapeChartI18n("en-US");
  const props = {
    reservations: [r],
    rooms,
    startDate: "2026-03-10",
    endDate: "2026-03-14",
    todayISO: "2026-03-10",
    formatters,
    strings: DEFAULT_STRINGS,
    selectedReservationId: null,
    onReservationSelect: () => {},
  };
  return view === "list" ? <TapeChartListView {...props} /> : <TapeChartMobileStack {...props} />;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Visible words in order, separators (·) collapse to a comma/space in the name.
const nameStart = (visible: string) =>
  new RegExp(`^${visible.split(/ · | /).map(escape).join("[ ,]+")}`);

describe.each([
  ["TapeChartListView", "list"],
  ["TapeChartMobileStack", "stack"],
] as const)("%s row label", (_n, view) => {
  it.each(cases)("$name: spaced text, name leads with visible run", ({ r, visible, stack }) => {
    render(<Harness view={view} r={r} />);
    const rows = screen.getAllByRole("button");
    expect(rows.length).toBeGreaterThan(0);
    const expected = view === "list" ? visible : stack;
    const words = expected.replace(/ · /g, " ");
    for (const row of rows) {
      expect(row.textContent).toBe(expected);
      expect(row).toHaveAccessibleName(nameStart(words));
      expect(row).toHaveAccessibleName(/March 10, 2026.*March 13, 2026/);
    }
  });
});
