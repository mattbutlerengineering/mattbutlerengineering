/**
 * Trend series for the AI-health page (#5443).
 *
 * `apps/marketing/public/ai-health-trends.json` is written by
 * `scripts/generate-health-trends.mjs` from the two committed, append-only
 * histories (`.claude/acmm/state.json` and `metrics/process-metrics.jsonl`)
 * and fetched at runtime — the same mechanism the page's point-in-time panels
 * already use for `/sensor-report.json`.
 *
 * Normalization here mirrors `ai-health.ts`'s `normalizeSensorReport`: the
 * payload crossed a file boundary written by a script that can be interrupted
 * or run by an older revision, so its shape is read defensively and never
 * trusted. A malformed response degrades to an empty series instead of
 * throwing.
 *
 * A day the collector could not measure arrives as `value: null` plus the
 * recorded `note`. A calendar day inside the first-to-last span that has no
 * row at all is the same kind of hole: it is inserted here, with no note,
 * so the caption, the table, and the chart count and draw it. Neither kind
 * of hole is dropped, and neither is interpolated. This is the page whose
 * stated purpose is honesty about self-improvement, so an unmeasured day
 * has to read as unmeasured.
 */

/** One published reading. `value: null` is an explicitly unmeasured day. */
export interface TrendPointPayload {
  readonly date?: unknown;
  readonly value?: unknown;
  readonly note?: unknown;
}

/**
 * One published series, as `generate-health-trends.mjs` writes it. `source` is
 * provenance for anyone reading the raw JSON; nothing on the page renders it,
 * so `normalizeSeries` deliberately does not read it.
 */
export interface TrendSeriesPayload {
  readonly label?: unknown;
  readonly source?: unknown;
  readonly points?: readonly TrendPointPayload[];
}

/** The fetched payload — see `scripts/generate-health-trends.mjs`. */
export interface HealthTrendsPayload {
  readonly generated_at?: unknown;
  readonly window_days?: unknown;
  readonly acmmLevel?: TrendSeriesPayload;
  readonly queueEfficiency?: TrendSeriesPayload;
}

/** Safe view model for one point. */
export interface TrendPoint {
  readonly date: string;
  readonly value: number | null;
  readonly note: string | null;
}

/** A measured reading, used for the endpoints of the accessible summary. */
export interface TrendReading {
  readonly date: string;
  readonly value: number;
}

/** Safe view model for one series. */
export interface TrendSeries {
  readonly label: string;
  readonly points: readonly TrendPoint[];
  /** Days carrying a measurement. */
  readonly reported: number;
  /** Calendar days in the span with no measurement, including dates with no row. */
  readonly missing: number;
  /** Oldest measured reading, skipping leading holes. */
  readonly first: TrendReading | null;
  /** Newest measured reading, skipping trailing holes. */
  readonly latest: TrendReading | null;
}

/** Safe view model for the trend panels. */
export interface HealthTrends {
  readonly generatedAt: string | null;
  readonly windowDays: number | null;
  readonly acmmLevel: TrendSeries;
  readonly queueEfficiency: TrendSeries;
}

/** Labels used when the payload predates the field, so a panel is never nameless. */
const DEFAULT_LABELS = {
  acmmLevel: "ACMM maturity level",
  queueEfficiency: "Queue efficiency composite",
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDay(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function formatUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True when `isoDate` is a real UTC calendar day, not an overflow like Feb 31. */
function isRealIsoDay(isoDate: string): boolean {
  if (!ISO_DATE.test(isoDate)) return false;
  const ms = utcDay(isoDate);
  return Number.isFinite(ms) && formatUtcDay(ms) === isoDate;
}

/**
 * One point per calendar day from the earliest reading to the latest.
 *
 * The axis labels that span, so the caption and the table have to span it
 * too. A date with no row becomes `{ value: null, note: null }`. A repeated
 * date keeps its last reading, the same rule `selectTrendWindow` uses when
 * it writes the file. A date that is not a real `YYYY-MM-DD` cannot be
 * placed, so the series is left as published rather than inventing days
 * around it.
 */
function fillCalendarSpan(points: readonly TrendPoint[]): readonly TrendPoint[] {
  if (points.length === 0 || !points.every((point) => isRealIsoDay(point.date))) {
    return points;
  }

  const byDate = new Map<string, TrendPoint>();
  for (const point of points) byDate.set(point.date, point);

  const dates = [...byDate.keys()].sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (start === undefined || end === undefined) return points;

  const filled: TrendPoint[] = [];
  for (let ms = utcDay(start); ms <= utcDay(end); ms += MS_PER_DAY) {
    const date = formatUtcDay(ms);
    filled.push(byDate.get(date) ?? { date, value: null, note: null });
  }
  return filled;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * A point is kept only when it is dated — an undated reading cannot be placed
 * on a time axis, so publishing it would invent a position. A dated point with
 * an unreadable value is kept as a hole, which is the honest reading.
 */
function normalizePoint(raw: unknown): TrendPoint | null {
  const point = asRecord(raw);
  const date = readString(point.date);
  if (date === null) return null;
  return { date, value: readNumber(point.value), note: readString(point.note) };
}

function normalizeSeries(raw: unknown, defaultLabel: string): TrendSeries {
  const series = asRecord(raw);
  const rawPoints = Array.isArray(series.points) ? series.points : [];
  const points = fillCalendarSpan(
    rawPoints.map(normalizePoint).filter((point): point is TrendPoint => point !== null)
  );
  const measured = points.filter((point) => point.value !== null);

  const toReading = (point: TrendPoint | undefined): TrendReading | null =>
    point === undefined || point.value === null ? null : { date: point.date, value: point.value };

  return {
    label: readString(series.label) ?? defaultLabel,
    points,
    reported: measured.length,
    missing: points.length - measured.length,
    first: toReading(measured[0]),
    latest: toReading(measured[measured.length - 1]),
  };
}

/** Normalizes a fetched trends payload (any shape) into safe display values. */
export function normalizeHealthTrends(payload: unknown): HealthTrends {
  const raw = asRecord(payload);
  return {
    generatedAt: readString(raw.generated_at),
    windowDays: readNumber(raw.window_days),
    acmmLevel: normalizeSeries(raw.acmmLevel, DEFAULT_LABELS.acmmLevel),
    queueEfficiency: normalizeSeries(raw.queueEfficiency, DEFAULT_LABELS.queueEfficiency),
  };
}

function pluralizeDays(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

/**
 * One sentence carrying everything the chart encodes visually: the span, both
 * endpoints, and — stated, not implied — how many days went unmeasured.
 *
 * This is the chart's accessible equivalent at a glance; the per-day table
 * rendered alongside it carries the full series. Neither depends on colour.
 */
export function describeTrendSeries(
  series: TrendSeries,
  formatValue: (value: number) => string
): string {
  if (series.first === null || series.latest === null) {
    return `${series.label}: no history yet.`;
  }

  const span = `${series.label} over ${pluralizeDays(series.points.length)}`;
  const from = `${formatValue(series.first.value)} on ${series.first.date}`;
  const to = `${formatValue(series.latest.value)} on ${series.latest.date}`;
  const counts = `${pluralizeDays(series.reported)} measured, ${pluralizeDays(series.missing)} with no measurement`;

  return `${span}: ${from} to ${to}. ${counts}.`;
}
