import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TapeChartGrid, type TapeChartGridProps } from "./TapeChartGrid";
import { DEFAULT_STRINGS } from "./defaultStrings";
import type { TapeChartLayout } from "./types";

const LAYOUT: TapeChartLayout = {
  barsByRoom: new Map(),
  dayCount: 3,
  laneCountByRoom: new Map(),
  maxLanes: 1,
  dailyCounts: [],
};

describe("TapeChartGrid", () => {
  it("does not re-render TapeChartDayHeader when only focus/selection changes", () => {
    const dayLong = vi.fn((iso: string) => iso);
    const props: TapeChartGridProps = {
      rooms: [{ id: "r1", name: "101" }],
      layout: LAYOUT,
      startDate: "2026-04-20",
      dayWidth: 80,
      todayISO: "2026-04-21",
      formatters: {
        dayWeekdayShort: (iso) => iso,
        dayNumeric: (iso) => iso,
        dayLong,
        monthYearLong: (iso) => iso,
        currency: (n) => String(n),
        number: (n) => String(n),
        pluralCategory: () => "other",
        compare: (a, b) => a.localeCompare(b),
        todayISO: () => "2026-04-21",
        locale: "en-US",
      },
      strings: DEFAULT_STRINGS,
      focusedReservationId: null,
      selectedReservationId: null,
      onReservationSelect: vi.fn(),
    };
    const { rerender } = render(<TapeChartGrid {...props} />);
    const callsAfterMount = dayLong.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    rerender(<TapeChartGrid {...props} focusedReservationId="a" selectedReservationId="b" />);

    expect(dayLong.mock.calls.length).toBe(callsAfterMount);
  });
});
