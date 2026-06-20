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

export function formatTimestamp(value: string | null | undefined): string {
  if (value == null) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
