import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TapeChart } from "./TapeChart";
import { useTapeChartLayout, applyReservationEvent } from "./useTapeChartLayout";
import { mergeStrings } from "./defaultStrings";
import { daysBetween, addDays } from "./dateMath";
import type { TapeChartReservation, TapeChartRoom } from "./types";

const ROOMS: TapeChartRoom[] = [
  { id: "r1", name: "101" },
  { id: "r2", name: "102" },
];

function buildReservation(partial: Partial<TapeChartReservation>): TapeChartReservation {
  return {
    id: partial.id ?? "res-1",
    roomId: partial.roomId ?? "r1",
    start: partial.start ?? "2026-04-20",
    end: partial.end ?? "2026-04-23",
    status: partial.status ?? "confirmed",
    guestName: partial.guestName ?? "Jane Doe",
    ratePerNight: partial.ratePerNight,
    currency: partial.currency,
    ...partial,
  };
}

describe("dateMath", () => {
  it("computes whole days between ISO dates", () => {
    expect(daysBetween("2026-04-20", "2026-04-23")).toBe(3);
    expect(daysBetween("2026-04-23", "2026-04-20")).toBe(-3);
  });

  it("adds days correctly across month boundaries", () => {
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("useTapeChartLayout", () => {
  it("positions a simple reservation at the right offset and span", () => {
    const reservations = [buildReservation({ start: "2026-04-22", end: "2026-04-25" })];
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27")
    );
    const bars = result.current.barsByRoom.get("r1")!;
    expect(bars).toHaveLength(1);
    expect(bars[0]!.startOffset).toBe(2);
    expect(bars[0]!.span).toBe(3); // end-exclusive: Apr 22–25 = 3 nights
    expect(bars[0]!.clippedStart).toBe(false);
    expect(bars[0]!.clippedEnd).toBe(false);
  });

  it("clips reservations that extend before startDate", () => {
    const reservations = [buildReservation({ start: "2026-04-18", end: "2026-04-23" })];
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27")
    );
    const bars = result.current.barsByRoom.get("r1")!;
    expect(bars[0]!.startOffset).toBe(0);
    expect(bars[0]!.span).toBe(3);
    expect(bars[0]!.clippedStart).toBe(true);
  });

  it("clips reservations that extend past endDate", () => {
    const reservations = [buildReservation({ start: "2026-04-25", end: "2026-04-30" })];
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27")
    );
    const bars = result.current.barsByRoom.get("r1")!;
    expect(bars[0]!.startOffset).toBe(5);
    expect(bars[0]!.span).toBe(2);
    expect(bars[0]!.clippedEnd).toBe(true);
  });

  it("excludes cancelled and no-show reservations from positioning", () => {
    const reservations = [
      buildReservation({ id: "a", status: "cancelled" }),
      buildReservation({ id: "b", status: "noShow" }),
      buildReservation({ id: "c", status: "confirmed" }),
    ];
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27")
    );
    expect(result.current.barsByRoom.get("r1")).toHaveLength(1);
    expect(result.current.barsByRoom.get("r1")![0]!.reservation.id).toBe("c");
  });

  it("assigns overlapping reservations to separate lanes", () => {
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-20", end: "2026-04-24" }),
      buildReservation({ id: "b", start: "2026-04-22", end: "2026-04-26" }),
    ];
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27")
    );
    const bars = result.current.barsByRoom.get("r1")!;
    const lanes = bars.map((b) => b.lane).sort();
    expect(lanes).toEqual([0, 1]);
    expect(result.current.maxLanes).toBeGreaterThanOrEqual(2);
  });

  it("computes daily counts for arrivals, departures, and in-house", () => {
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-20", end: "2026-04-23" }),
      buildReservation({ id: "b", roomId: "r2", start: "2026-04-21", end: "2026-04-24" }),
    ];
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-25")
    );
    const day0 = result.current.dailyCounts[0]!; // Apr 20
    expect(day0.arrivals).toBe(1);
    expect(day0.inHouse).toBe(1);
    const day2 = result.current.dailyCounts[2]!; // Apr 22
    expect(day2.departures).toBe(1); // res 'a' ends exclusively on Apr 23 so Apr 22 is last night
    expect(day2.inHouse).toBe(2);
  });
});

describe("applyReservationEvent", () => {
  it("adds a newly-created reservation", () => {
    const prev: TapeChartReservation[] = [];
    const next = applyReservationEvent(prev, {
      type: "created",
      reservation: buildReservation({ id: "new" }),
    });
    expect(next).toHaveLength(1);
    expect(next[0]!.id).toBe("new");
  });

  it("replaces a reservation on update", () => {
    const initial = buildReservation({ id: "x", guestName: "Old" });
    const updated = buildReservation({ id: "x", guestName: "New" });
    const next = applyReservationEvent([initial], { type: "updated", reservation: updated });
    expect(next).toHaveLength(1);
    expect(next[0]!.guestName).toBe("New");
  });

  it("removes a reservation on cancel", () => {
    const prev = [buildReservation({ id: "x" }), buildReservation({ id: "y" })];
    const next = applyReservationEvent(prev, { type: "cancelled", id: "x" });
    expect(next).toHaveLength(1);
    expect(next[0]!.id).toBe("y");
  });
});

describe("mergeStrings", () => {
  it("returns defaults when no overrides given", () => {
    const s = mergeStrings();
    expect(s.regionLabel).toBe("Reservations tape chart");
    expect(s.statusLabels.confirmed).toBe("Confirmed");
  });

  it("merges partial string overrides while keeping defaults for untouched keys", () => {
    const s = mergeStrings({ regionLabel: "Custom region" });
    expect(s.regionLabel).toBe("Custom region");
    expect(s.arrivalsLabel).toBe("Arrivals");
  });

  it("deep-merges statusLabels while retaining other defaults", () => {
    const s = mergeStrings({ statusLabels: { confirmed: "OK" } });
    expect(s.statusLabels.confirmed).toBe("OK");
    expect(s.statusLabels.cancelled).toBe("Cancelled");
  });

  it("uses custom nightsLabel when provided", () => {
    const s = mergeStrings({ nightsLabel: (n) => `${n}泊` });
    expect(s.nightsLabel(2)).toBe("2泊");
  });
});

describe("<TapeChart /> rendering", () => {
  const BASE = {
    reservations: [buildReservation({ start: "2026-04-22", end: "2026-04-25" })],
    rooms: ROOMS,
    startDate: "2026-04-20",
    endDate: "2026-04-27",
  };

  it("renders the region label as the landmark", () => {
    render(<TapeChart {...BASE} />);
    expect(screen.getByRole("region", { name: /reservations tape chart/i })).toBeInTheDocument();
  });

  it("renders an empty state when no rooms are provided", () => {
    render(<TapeChart {...BASE} rooms={[]} />);
    expect(screen.getByText(/no rooms configured/i)).toBeInTheDocument();
  });

  it("renders an error banner when error prop is set", () => {
    render(<TapeChart {...BASE} error={new Error("boom")} />);
    expect(screen.getByText(/couldn't load reservations/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it("calls onReservationClick when a bar is activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TapeChart {...BASE} onReservationClick={onClick} />);
    const bar = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-label")?.includes("Jane Doe"));
    expect(bar).toBeDefined();
    await user.click(bar!);
    expect(onClick).toHaveBeenCalled();
    expect(onClick.mock.calls[0]![0]!.guestName).toBe("Jane Doe");
  });

  it("respects custom strings for locale overrides", () => {
    render(
      <TapeChart
        {...BASE}
        strings={{
          regionLabel: "予約テープチャート",
          roomsColumnLabel: "部屋",
        }}
      />
    );
    expect(screen.getByRole("region", { name: /予約テープチャート/i })).toBeInTheDocument();
  });
});
