import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrendChart } from "./TrendChart.js";
import { normalizeHealthTrends, type TrendSeries } from "../data/ai-health-trends.js";

const format = (value: number) => value.toFixed(2);

function seriesFrom(points: ReadonlyArray<Record<string, unknown>>): TrendSeries {
  return normalizeHealthTrends({
    queueEfficiency: { label: "Queue efficiency composite", points },
  }).queueEfficiency;
}

function renderChart(points: ReadonlyArray<Record<string, unknown>>) {
  return render(
    <TrendChart
      series={seriesFrom(points)}
      min={0}
      max={1}
      formatValue={format}
      valueHeader="Composite"
      testId="qe-trend"
    />
  );
}

const CONSECUTIVE = [
  { date: "2026-09-16", value: 0.911, note: null },
  { date: "2026-09-17", value: 0.927, note: null },
  { date: "2026-09-18", value: 0.961, note: null },
];

describe("TrendChart", () => {
  it("states the series summary in visible text, not only in the drawing", () => {
    renderChart(CONSECUTIVE);

    expect(
      screen.getByText(
        "Queue efficiency composite over 3 days: 0.91 on 2026-09-16 to 0.96 on 2026-09-18. " +
          "3 days measured, 0 days with no measurement."
      )
    ).toBeInTheDocument();
  });

  it("hides the drawing from assistive tech and carries the data in a table instead", () => {
    const { container } = renderChart(CONSECUTIVE);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const table = screen.getByRole("table", { name: /Queue efficiency composite by day/ });
    // One header row + one row per published day.
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("cell", { name: "2026-09-17" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "0.93" })).toBeInTheDocument();
  });

  it("renders an unmeasured day as a marked gap, never as an interpolated value", () => {
    const { container } = renderChart([
      { date: "2026-09-13", value: 0.923, note: null },
      { date: "2026-09-14", value: null, note: "query_error" },
      { date: "2026-09-15", value: 0.911, note: null },
    ]);

    // The gap is drawn as its own mark, and the line does not cross it.
    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="trend-dot"]')).toHaveLength(2);

    // And it is named, with its recorded reason, in the accessible table.
    const table = screen.getByRole("table", { name: /by day/ });
    expect(within(table).getByRole("cell", { name: "No data (query_error)" })).toBeInTheDocument();
    expect(screen.getByText(/1 day with no measurement/)).toBeInTheDocument();
  });

  it("does not bridge a stretch of days the collector never recorded at all", () => {
    // 2026-08-16 -> 2026-08-26 is a real ten-day hole in process-metrics.jsonl:
    // those days have no row, so joining them would draw a line through
    // measurements that were never taken.
    const { container } = renderChart([
      { date: "2026-08-15", value: 1, note: null },
      { date: "2026-08-16", value: 0.98, note: null },
      { date: "2026-08-26", value: 0.98, note: null },
      { date: "2026-08-27", value: 0.982, note: null },
    ]);

    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="trend-dot"]')).toHaveLength(4);
  });

  it("marks every published day that carries no measurement", () => {
    const { container } = renderChart([
      { date: "2026-08-02", value: null, note: "unavailable" },
      { date: "2026-08-03", value: null, note: "unavailable" },
      { date: "2026-08-04", value: null, note: "unavailable" },
    ]);

    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(0);
    expect(screen.getByText("Queue efficiency composite: no history yet.")).toBeInTheDocument();
  });

  it("labels the axis with the real first and last dates of the series", () => {
    renderChart(CONSECUTIVE);

    // Scoped to the axis: the accessible table lists every date too, so a
    // page-wide query would match both and prove nothing about the axis.
    const axis = screen.getByTestId("qe-trend-axis");
    expect(within(axis).getByText("2026-09-16")).toBeInTheDocument();
    expect(within(axis).getByText("2026-09-18")).toBeInTheDocument();
    expect(within(axis).getByText("scale 0.00–1.00")).toBeInTheDocument();
  });

  it("renders the empty state without a drawing when there is no history", () => {
    const { container } = renderChart([]);

    expect(screen.getByText("Queue efficiency composite: no history yet.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("places a single measured day without dividing by a zero-width span", () => {
    const { container } = renderChart([{ date: "2026-09-20", value: 0.964, note: null }]);

    const dots = container.querySelectorAll('[data-testid="trend-dot"]');
    expect(dots).toHaveLength(1);
    const cx = Number(dots[0]?.getAttribute("cx"));
    expect(cx).toBeGreaterThan(0);
    expect(cx).not.toBeNaN();
  });
});
