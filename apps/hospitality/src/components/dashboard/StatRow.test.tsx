import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatRow } from "./StatRow.js";
import type { DashboardStats } from "../../hooks/useDashboardStatsQuery.js";
import type { ReactNode } from "react";

/* Lightweight stand-ins that mirror the accessible contract of the real
   instruments: Odometer exposes its value as text; Meter is a `meter`
   with value/min/max and a visible readout + label. The instruments' own
   reduced-motion + live-region behaviour is covered by their rialto tests. */

interface OdometerMockProps {
  readonly value: number;
  readonly "aria-label"?: string;
}

interface MeterMockProps {
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly label?: string;
  readonly showValue?: boolean;
}

interface TextMockProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

vi.mock("@mattbutlerengineering/rialto", () => ({
  Odometer: ({ value, "aria-label": ariaLabel }: OdometerMockProps) => (
    <div data-testid="odometer" aria-label={ariaLabel}>
      {value}
    </div>
  ),
  Meter: ({ value, min, max, label, showValue }: MeterMockProps) => {
    const lo = min ?? 0;
    const hi = max ?? 100;
    const range = hi - lo;
    const percent = range > 0 ? Math.round(((value - lo) / range) * 100) : 0;
    return (
      <div
        data-testid="meter"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={lo}
        aria-valuemax={hi}
      >
        {showValue ? <span>{`${percent}%`}</span> : null}
        {label ? <span>{label}</span> : null}
      </div>
    );
  },
  Text: ({ children, className }: TextMockProps) => (
    <span className={className}>{children}</span>
  ),
}));

const STATS: DashboardStats = {
  totalReservations: 5,
  expectedCovers: 20,
  upcomingCount: 3,
  cancellationRate: 10,
  cancellationTrend: "neutral",
};

describe("StatRow", () => {
  it("renders each count metric via an Odometer instrument", () => {
    render(<StatRow stats={STATS} />);

    const odometers = screen.getAllByTestId("odometer");
    expect(odometers.length).toBe(3);

    // Counts are exposed as accessible text.
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("20")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("renders the bounded cancellation rate via a Meter with 0-100 bounds", () => {
    render(<StatRow stats={STATS} />);

    const meter = screen.getByTestId("meter");
    expect(meter.getAttribute("role")).toBe("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("10");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");

    // Bounded value exposed as accessible text.
    expect(screen.getByText("10%")).toBeDefined();
  });

  it("uses exactly one meter for the bounded metric and odometers for counts", () => {
    render(<StatRow stats={STATS} />);

    expect(screen.getAllByTestId("meter").length).toBe(1);
    expect(screen.getAllByTestId("odometer").length).toBe(3);
  });

  it("labels every metric with accessible text", () => {
    render(<StatRow stats={STATS} />);

    expect(screen.getByText("Today's Reservations")).toBeDefined();
    expect(screen.getByText("Expected Covers")).toBeDefined();
    expect(screen.getByText("Upcoming (2 hrs)")).toBeDefined();
    expect(screen.getByText("Cancellation Rate")).toBeDefined();

    // Each count Odometer carries an accessible name matching its label.
    const covers = screen.getByLabelText("Expected Covers");
    expect(covers.getAttribute("data-testid")).toBe("odometer");
  });
});
