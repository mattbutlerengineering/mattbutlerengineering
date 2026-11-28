import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatRow } from "./StatRow.js";
import type { DashboardStats } from "../../hooks/useDashboardStatsQuery.js";
import type { ReactNode } from "react";

/* Lightweight stand-ins that mirror the accessible contract of the real
   instruments: counts are plain text; Meter is a `meter`
   with value/min/max and a visible readout + label. The instruments' own
   reduced-motion + live-region behaviour is covered by their rialto tests. */

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
  Text: ({ children, className }: TextMockProps) => <span className={className}>{children}</span>,
}));

const STATS: DashboardStats = {
  totalReservations: 5,
  expectedCovers: 20,
  upcomingCount: 3,
  cancellationRate: 10,
  cancellationTrend: "neutral",
  waitlistCount: 4,
  longestWaitMinutes: 25,
  depositAtRiskCount: 0,
  noShowExposureCents: 0,
};

describe("StatRow", () => {
  it("renders each count metric as plain text", () => {
    render(<StatRow stats={STATS} />);

    // Counts are exposed as accessible text.
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("20")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("25")).toBeDefined();
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

  it("stretches the meter tile so the label and value keep their own space", () => {
    render(<StatRow stats={STATS} />);

    const tile = screen.getByTestId("meter").parentElement;
    expect(tile?.className).toContain("meterTile");
  });

  it("uses exactly one meter for the bounded metric", () => {
    render(<StatRow stats={STATS} />);

    expect(screen.getAllByTestId("meter").length).toBe(1);
  });

  it("labels every metric with accessible text", () => {
    render(<StatRow stats={STATS} />);

    expect(screen.getByText("Today's Reservations")).toBeDefined();
    expect(screen.getByText("Expected Covers")).toBeDefined();
    expect(screen.getByText("Upcoming (2 hrs)")).toBeDefined();
    expect(screen.getByText("Cancellation Rate")).toBeDefined();
    expect(screen.getByText("Waitlist")).toBeDefined();
    expect(screen.getByText("Longest Wait (min)")).toBeDefined();

    // Each count tile is a named group holding its figure and label.
    const covers = screen.getByRole("group", { name: "Expected Covers" });
    expect(covers.textContent).toContain("20");
  });

  it("renders waitlist tiles as 0 when nobody is waiting", () => {
    render(<StatRow stats={{ ...STATS, waitlistCount: 0, longestWaitMinutes: 0 }} />);

    const waitlist = screen.getByRole("group", { name: "Waitlist" });
    expect(waitlist.textContent).toContain("0");
    const longestWait = screen.getByRole("group", { name: "Longest Wait (min)" });
    expect(longestWait.textContent).toContain("0");
  });
});
