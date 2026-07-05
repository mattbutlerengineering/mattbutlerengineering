import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatRow } from "./StatRow.js";
import type { DashboardStats } from "../../hooks/useDashboardStatsQuery.js";

/* Lightweight stand-ins that mirror the accessible contract of the real
   instruments: Odometer exposes its value as text; RadialGauge is a `meter`
   with value/min/max and a visible readout + label. The instruments' own
   reduced-motion + live-region behaviour is covered by their rialto tests. */

interface OdometerMockProps {
  readonly value: number;
  readonly "aria-label"?: string;
}

interface RadialGaugeMockProps {
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  readonly label?: string;
}

vi.mock("@mattbutlerengineering/rialto", () => ({
  Odometer: ({ value, "aria-label": ariaLabel }: OdometerMockProps) => (
    <div data-testid="odometer" aria-label={ariaLabel}>
      {value}
    </div>
  ),
  RadialGauge: ({ value, min, max, unit, label }: RadialGaugeMockProps) => (
    <div
      data-testid="radial-gauge"
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
    >
      <span>{`${Math.round(value)}${unit ?? ""}`}</span>
      {label ? <span>{label}</span> : null}
    </div>
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

  it("renders the bounded cancellation rate via a RadialGauge with 0-100 bounds", () => {
    render(<StatRow stats={STATS} />);

    const gauge = screen.getByTestId("radial-gauge");
    expect(gauge.getAttribute("role")).toBe("meter");
    expect(gauge.getAttribute("aria-valuenow")).toBe("10");
    expect(gauge.getAttribute("aria-valuemin")).toBe("0");
    expect(gauge.getAttribute("aria-valuemax")).toBe("100");

    // Bounded value exposed as accessible text.
    expect(screen.getByText("10%")).toBeDefined();
  });

  it("uses exactly one gauge for the bounded metric and odometers for counts", () => {
    render(<StatRow stats={STATS} />);

    expect(screen.getAllByTestId("radial-gauge").length).toBe(1);
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
