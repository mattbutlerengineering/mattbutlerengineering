import type { WeeklyResource } from "../data/weekly-intake.js";

// --- Service status types (shared with StatusPage) ---

export interface ServiceStatus {
  readonly name: string;
  readonly url: string;
  readonly status: "ok" | "degraded" | "error" | "loading";
  readonly version?: string;
  readonly latency?: number;
  readonly checkedAt?: string;
}

// --- Status color / label / overall ---

export function statusColor(status: string): "green" | "yellow" | "red" | "neutral" {
  switch (status) {
    case "ok":
      return "green";
    case "degraded":
      return "yellow";
    case "error":
      return "red";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "ok":
      return "Operational";
    case "degraded":
      return "Degraded";
    case "error":
      return "Down";
    case "loading":
      return "Checking...";
    default:
      return "Unknown";
  }
}

export function overallStatus(statuses: ServiceStatus[]): "ok" | "degraded" | "error" | "loading" {
  if (statuses.some((s) => s.status === "loading")) return "loading";
  if (statuses.every((s) => s.status === "ok")) return "ok";
  if (statuses.some((s) => s.status === "error")) return "error";
  return "degraded";
}

// --- Sensor status ---

export function formatSensorStatus(available: boolean): string {
  return available ? "Available" : "Unavailable";
}

export function getSensorColor(available: boolean): "green" | "red" {
  return available ? "green" : "red";
}

// --- Number / date formatters ---

/**
 * Format a whole-number percentage (0–100 input).
 * e.g. formatPercent(95.5) → "95.5%"
 */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}%`;
}

/**
 * Format a ratio (0–1 input) as a percentage with one decimal place.
 * e.g. formatRatio(0.951) → "95.1%"
 */
export function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a build-time measurement instant as the calendar day it was taken.
 *
 * Pinned to UTC — the repo-stats snapshot records an instant, but the proof
 * strip reports a day, and a local-timezone read would show the previous day
 * for every viewer west of GMT.
 */
export function formatMeasuredAt(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatTimestamp(value: string | null | undefined): string {
  if (value == null) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const STALE_THRESHOLD_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns true when an ISO timestamp is older than the 14-day freshness
 * window — used to flag dashboards showing out-of-date data.
 */
export function isStale(generatedAt: string, now: Date = new Date()): boolean {
  const ageDays = (now.getTime() - new Date(generatedAt).getTime()) / MS_PER_DAY;
  return ageDays > STALE_THRESHOLD_DAYS;
}

const DEFAULT_REPORT_STALE_THRESHOLD_HOURS = 48;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Returns true when an ISO timestamp is older than `thresholdHours` — used by
 * the AI-health dashboard to flag a sensor report snapshot as stale. Distinct
 * from `isStale` (day-granular, used by the ACMM metrics dashboard): this
 * needs an hour-granular threshold to catch a report as little as 2 days old.
 */
export function isReportStale(
  generatedAt: string,
  thresholdHours: number = DEFAULT_REPORT_STALE_THRESHOLD_HOURS,
  now: Date = new Date()
): boolean {
  const ageHours = (now.getTime() - new Date(generatedAt).getTime()) / MS_PER_HOUR;
  return ageHours > thresholdHours;
}

// --- Weekly source maps ---

export const SOURCE_COLORS: Record<
  WeeklyResource["source"],
  "yellow" | "blue" | "purple" | "neutral"
> = {
  "js-weekly": "yellow",
  "react-weekly": "blue",
  "ai-weekly": "purple",
  other: "neutral",
};

export const SOURCE_LABELS: Record<WeeklyResource["source"], string> = {
  "js-weekly": "JS Weekly",
  "react-weekly": "React Weekly",
  "ai-weekly": "AI Weekly",
  other: "Other",
};
