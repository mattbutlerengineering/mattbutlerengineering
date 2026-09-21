import { Text } from "@mattbutlerengineering/rialto";
import {
  describeTrendSeries,
  type TrendPoint,
  type TrendSeries,
} from "../data/ai-health-trends.js";
import styles from "./TrendChart.module.css";

/**
 * A trailing-window trend for one AI-health series (#5443), drawn as inline
 * SVG. No charting dependency: `packages/rialto` ships no time-series
 * primitive (`Stat` carries a single direction arrow, `Meter`/`Progress` a
 * single value, `TapeChart` a reservations gantt), and the platform guardrail
 * is to stay boring rather than pull a library in for two sparklines.
 *
 * Three rules hold this component to the page's stated purpose — honesty about
 * self-improvement:
 *
 * 1. **A gap is drawn as a gap.** A published day carrying no measurement gets
 *    its own dashed mark and breaks the line; the line is never drawn through
 *    it. Days the collector never recorded at all are simply absent from the
 *    series, so the line breaks there too rather than joining across them.
 * 2. **The drawing is never the only carrier.** The SVG is `aria-hidden`; the
 *    series is also stated as a sentence in the visible caption and published
 *    in full as a visually-hidden table, one row per day.
 * 3. **Colour carries no meaning.** Every mark is `currentColor` against the
 *    surrounding text colour, distinguished by shape (solid line and filled
 *    dot for measured, dashed vertical rule for missing).
 */
export interface TrendChartProps {
  readonly series: TrendSeries;
  /** Bottom of the value axis — the metric's own floor, not the data's. */
  readonly min: number;
  /** Top of the value axis — the metric's own ceiling, not the data's. */
  readonly max: number;
  readonly formatValue: (value: number) => string;
  /** Column heading for the value column of the accessible table. */
  readonly valueHeader: string;
  readonly testId: string;
}

/** SVG user units. Scaled to the container by `viewBox` + `width: 100%`. */
const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 180;
const PAD_X = 8;
const PAD_Y = 12;
const PLOT_WIDTH = VIEW_WIDTH - PAD_X * 2;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD_Y * 2;
const DOT_RADIUS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A point that carries a measurement, as opposed to a published hole. */
type MeasuredPoint = TrendPoint & { readonly value: number };

function isMeasured(point: TrendPoint): point is MeasuredPoint {
  return point.value !== null;
}

/** Whole days from `from` to `to`, both ISO dates, measured in UTC. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * Contiguous runs of measured points — a run breaks on a hole *and* on a
 * calendar skip, so no segment ever spans a day that was not measured.
 *
 * Runs shorter than two points are dropped: an isolated measurement has
 * nothing to connect to, and its dot already carries it. Emitting a
 * one-point polyline would draw nothing while implying a segment exists.
 */
function splitIntoRuns(points: readonly TrendPoint[]): MeasuredPoint[][] {
  const runs: MeasuredPoint[][] = [];
  let run: MeasuredPoint[] = [];

  for (const point of points) {
    const previous = run[run.length - 1];
    const adjacent = previous !== undefined && daysBetween(previous.date, point.date) === 1;
    if (!isMeasured(point) || !adjacent) {
      if (run.length > 0) runs.push(run);
      run = isMeasured(point) ? [point] : [];
      continue;
    }
    run = [...run, point];
  }

  return [...runs, run].filter((candidate) => candidate.length > 1);
}

export function TrendChart({
  series,
  min,
  max,
  formatValue,
  valueHeader,
  testId,
}: TrendChartProps) {
  const { points } = series;
  const summary = describeTrendSeries(series, formatValue);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (firstPoint === undefined || lastPoint === undefined) {
    return (
      <figure className={styles.figure} data-testid={testId}>
        <figcaption className={styles.caption}>{summary}</figcaption>
      </figure>
    );
  }

  const firstDate = firstPoint.date;
  const lastDate = lastPoint.date;
  const span = daysBetween(firstDate, lastDate);

  // A one-day series has no span to divide by; centre it instead of dividing
  // by zero, which would put the dot at NaN and drop it from the drawing.
  const x = (date: string) =>
    span === 0
      ? PAD_X + PLOT_WIDTH / 2
      : PAD_X + (daysBetween(firstDate, date) / span) * PLOT_WIDTH;

  const range = max - min;
  const y = (value: number) => {
    const clamped = Math.min(Math.max(value, min), max);
    return PAD_Y + (1 - (clamped - min) / range) * PLOT_HEIGHT;
  };

  const segments = splitIntoRuns(points).map((run) =>
    run.map((point) => `${x(point.date)},${y(point.value)}`).join(" ")
  );
  const measured = points.filter(isMeasured);
  const missing = points.filter((point) => !isMeasured(point));

  return (
    <figure className={styles.figure} data-testid={testId}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            className={styles.gridline}
            x1={PAD_X}
            x2={PAD_X + PLOT_WIDTH}
            y1={PAD_Y + fraction * PLOT_HEIGHT}
            y2={PAD_Y + fraction * PLOT_HEIGHT}
          />
        ))}
        {missing.map((point) => (
          <line
            key={`gap-${point.date}`}
            className={styles.gap}
            data-testid="trend-gap"
            x1={x(point.date)}
            x2={x(point.date)}
            y1={PAD_Y}
            y2={PAD_Y + PLOT_HEIGHT}
          />
        ))}
        {segments.map((segment) => (
          <polyline
            key={segment}
            className={styles.line}
            data-testid="trend-line"
            points={segment}
          />
        ))}
        {measured.map((point) => (
          <circle
            key={`dot-${point.date}`}
            className={styles.dot}
            data-testid="trend-dot"
            cx={x(point.date)}
            cy={y(point.value)}
            r={DOT_RADIUS}
          />
        ))}
      </svg>
      <div className={styles.axis} data-testid={`${testId}-axis`}>
        <Text as="span">{firstDate}</Text>
        <Text as="span" className={styles.scale}>
          scale {formatValue(min)}–{formatValue(max)}
        </Text>
        <Text as="span">{lastDate}</Text>
      </div>
      <figcaption className={styles.caption}>{summary}</figcaption>
      <div className={styles.srOnly}>
        {/* Rialto's <Table> is a sortable data grid: its controls are
            focusable, which is wrong inside a visually-hidden element. A plain
            table is the accessible equivalent of the drawing, nothing more. */}
        {/* eslint-disable mbe-local/prefer-rialto-components */}
        <table>
          <caption>{series.label} by day</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date}>
                <td>{point.date}</td>
                <td>
                  {point.value === null
                    ? `No data${point.note === null ? "" : ` (${point.note})`}`
                    : formatValue(point.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* eslint-enable mbe-local/prefer-rialto-components */}
      </div>
    </figure>
  );
}
