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
    expect(result.current.laneCountByRoom.get("r1")).toBe(2);
    expect(result.current.laneCountByRoom.get("r2")).toBe(1);
  });

  it("does not mutate its inputs and returns fresh bar objects", () => {
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-20", end: "2026-04-24" }),
      buildReservation({ id: "b", start: "2026-04-22", end: "2026-04-26" }),
    ];
    const snapshot = structuredClone(reservations);
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27")
    );
    expect(reservations).toEqual(snapshot);
    const bars = result.current.barsByRoom.get("r1")!;
    expect(bars).toHaveLength(2);
    // The consumer's reservation object is referenced by identity, never copied…
    expect(bars[0]!.reservation).toBe(reservations[0]);
    // …but the bar itself is a fresh object, not any input.
    for (const bar of bars) {
      expect(reservations).not.toContain(bar);
    }
  });

  it("marks every overlapping bar as a conflict by default", () => {
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-20", end: "2026-04-24" }),
      buildReservation({ id: "b", start: "2026-04-22", end: "2026-04-26" }),
      buildReservation({ id: "c", start: "2026-04-26", end: "2026-04-27" }),
    ];
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27")
    );
    const byId = new Map(result.current.barsByRoom.get("r1")!.map((b) => [b.reservation.id, b]));
    expect(byId.get("a")!.overlap).toBe("conflict");
    expect(byId.get("b")!.overlap).toBe("conflict");
    expect(byId.get("c")!.overlap).toBeUndefined();
  });

  it("invokes classifyOverlap once per overlapping pair, earlier start first", () => {
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-20", end: "2026-04-24" }),
      buildReservation({ id: "b", start: "2026-04-22", end: "2026-04-26" }),
      buildReservation({ id: "c", start: "2026-04-26", end: "2026-04-27" }),
    ];
    const classify = vi.fn(() => "shared" as const);
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27", classify)
    );
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledWith(reservations[0], reservations[1]);
    const byId = new Map(result.current.barsByRoom.get("r1")!.map((b) => [b.reservation.id, b]));
    expect(byId.get("a")!.overlap).toBe("shared");
    expect(byId.get("b")!.overlap).toBe("shared");
    expect(byId.get("c")!.overlap).toBeUndefined();
  });

  it("orders classify() args by real start when both reservations clip to the window edge", () => {
    // Both reservations clip to startOffset 0 at "2026-04-20", so the comparator's
    // secondary sort (span) would otherwise put the shorter-spanning "b" (real start
    // 2026-04-15) ahead of "a" (real start 2026-04-10) in the sorted-array order.
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-10", end: "2026-04-25" }),
      buildReservation({ id: "b", start: "2026-04-15", end: "2026-04-22" }),
    ];
    const classify = vi.fn(() => "shared" as const);
    renderHook(() => useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27", classify));
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledWith(reservations[0], reservations[1]);
  });

  it("folds a mixed 3-deep stack worst-wins per bar", () => {
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-20", end: "2026-04-25" }),
      buildReservation({ id: "b", start: "2026-04-21", end: "2026-04-24" }),
      buildReservation({ id: "c", start: "2026-04-22", end: "2026-04-26" }),
    ];
    const classify = vi.fn((x: TapeChartReservation, y: TapeChartReservation) =>
      x.id === "a" && y.id === "b" ? ("conflict" as const) : ("shared" as const)
    );
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27", classify)
    );
    const byId = new Map(result.current.barsByRoom.get("r1")!.map((b) => [b.reservation.id, b]));
    expect(byId.get("a")!.overlap).toBe("conflict");
    expect(byId.get("b")!.overlap).toBe("conflict");
    expect(byId.get("c")!.overlap).toBe("shared");
    expect(result.current.laneCountByRoom.get("r1")).toBe(3);
    expect(classify).toHaveBeenCalledTimes(3);
  });

  it("never passes cancelled or no-show reservations to classifyOverlap", () => {
    const reservations = [
      buildReservation({ id: "a", start: "2026-04-20", end: "2026-04-24" }),
      buildReservation({ id: "x", start: "2026-04-20", end: "2026-04-24", status: "cancelled" }),
      buildReservation({ id: "y", start: "2026-04-20", end: "2026-04-24", status: "noShow" }),
    ];
    const classify = vi.fn(() => "conflict" as const);
    const { result } = renderHook(() =>
      useTapeChartLayout(reservations, ROOMS, "2026-04-20", "2026-04-27", classify)
    );
    expect(classify).not.toHaveBeenCalled();
    const bars = result.current.barsByRoom.get("r1")!;
    expect(bars).toHaveLength(1);
    expect(bars[0]!.overlap).toBeUndefined();
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

  const OVERLAPPING = {
    rooms: ROOMS,
    startDate: "2026-04-20",
    endDate: "2026-04-27",
    reservations: [
      buildReservation({
        id: "a",
        start: "2026-04-20",
        end: "2026-04-24",
        guestName: "Ines Duarte",
      }),
      buildReservation({
        id: "b",
        start: "2026-04-22",
        end: "2026-04-26",
        guestName: "Kofi Mensah",
      }),
      buildReservation({
        id: "c",
        roomId: "r2",
        start: "2026-04-21",
        end: "2026-04-23",
        guestName: "Leila Haddad",
      }),
    ],
  };

  it("renders overlapping bars in distinct lanes with a conflict marker by default", () => {
    render(<TapeChart {...OVERLAPPING} />);
    const a = screen.getByRole("button", { name: /Ines Duarte/ });
    const b = screen.getByRole("button", { name: /Kofi Mensah/ });
    const c = screen.getByRole("button", { name: /Leila Haddad/ });

    expect(a).toHaveAttribute("data-lane", "0");
    expect(b).toHaveAttribute("data-lane", "1");
    expect(b.getAttribute("style")).toMatch(/--tapechart-bar-lane:\s*1\b/);
    expect(a).toHaveAttribute("data-overlap", "conflict");
    expect(b).toHaveAttribute("data-overlap", "conflict");
    expect(c).not.toHaveAttribute("data-overlap");
    expect(c).toHaveAttribute("data-lane", "0");

    const row101 = screen.getByRole("row", { name: "101" });
    expect(row101).toHaveAttribute("data-lane-count", "2");
    expect(row101.getAttribute("style")).toMatch(/--tapechart-lane-count:\s*2\b/);
    expect(screen.getByRole("row", { name: "102" })).toHaveAttribute("data-lane-count", "1");

    expect(a.getAttribute("aria-label")).toContain("Double-booked");
    expect(a.querySelector(".overlapGlyph")).not.toBeNull();
    expect(c.querySelector(".overlapGlyph")).toBeNull();
  });

  it("stacks shared overlaps without the conflict marker", () => {
    render(<TapeChart {...OVERLAPPING} classifyOverlap={() => "shared"} />);
    const a = screen.getByRole("button", { name: /Ines Duarte/ });
    const b = screen.getByRole("button", { name: /Kofi Mensah/ });
    expect(a).toHaveAttribute("data-overlap", "shared");
    expect(b).toHaveAttribute("data-overlap", "shared");
    expect(a.getAttribute("aria-label")).toContain("Shared occupancy");
    expect(a).toHaveAttribute("data-lane", "0");
    expect(b).toHaveAttribute("data-lane", "1");
    const region = screen.getByRole("region", { name: /reservations tape chart/i });
    expect(region.querySelector(".overlapGlyph")).toBeNull();
  });

  it("calls onReservationClick with each overlapping bar's own reservation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TapeChart {...OVERLAPPING} onReservationClick={onClick} />);
    await user.click(screen.getByRole("button", { name: /Ines Duarte/ }));
    expect(onClick.mock.lastCall![0]!.id).toBe("a");
    await user.click(screen.getByRole("button", { name: /Kofi Mensah/ }));
    expect(onClick.mock.lastCall![0]!.id).toBe("b");
  });

  it("renders a non-overlapping room at one lane with no overlap attribute", () => {
    render(<TapeChart {...BASE} />);
    const bar = screen.getByRole("button", { name: /Jane Doe/ });
    expect(bar).toHaveAttribute("data-lane", "0");
    expect(bar).not.toHaveAttribute("data-overlap");
    expect(screen.getByRole("row", { name: "101" })).toHaveAttribute("data-lane-count", "1");
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
