import { describe, it, expect } from "vitest";
import {
  statusColor,
  statusLabel,
  overallStatus,
  formatSensorStatus,
  getSensorColor,
  formatPercent,
  formatRatio,
  formatDate,
  formatMeasuredAt,
  formatTimestamp,
  isStale,
  SOURCE_COLORS,
  SOURCE_LABELS,
} from "./formatters.js";
import type { ServiceStatus } from "./formatters.js";

describe("statusColor", () => {
  it("returns green for ok", () => {
    expect(statusColor("ok")).toBe("green");
  });

  it("returns yellow for degraded", () => {
    expect(statusColor("degraded")).toBe("yellow");
  });

  it("returns red for error", () => {
    expect(statusColor("error")).toBe("red");
  });

  it("returns neutral for unknown status", () => {
    expect(statusColor("loading")).toBe("neutral");
    expect(statusColor("unknown")).toBe("neutral");
  });
});

describe("statusLabel", () => {
  it("returns Operational for ok", () => {
    expect(statusLabel("ok")).toBe("Operational");
  });

  it("returns Degraded for degraded", () => {
    expect(statusLabel("degraded")).toBe("Degraded");
  });

  it("returns Down for error", () => {
    expect(statusLabel("error")).toBe("Down");
  });

  it("returns Checking... for loading", () => {
    expect(statusLabel("loading")).toBe("Checking...");
  });

  it("returns Unknown for unknown status", () => {
    expect(statusLabel("unknown")).toBe("Unknown");
  });
});

describe("overallStatus", () => {
  const makeStatus = (status: ServiceStatus["status"]): ServiceStatus => ({
    name: "test",
    url: "/test",
    status,
  });

  it("returns loading when any service is loading", () => {
    const statuses = [makeStatus("ok"), makeStatus("loading"), makeStatus("error")];
    expect(overallStatus(statuses)).toBe("loading");
  });

  it("returns ok when all services are ok", () => {
    const statuses = [makeStatus("ok"), makeStatus("ok")];
    expect(overallStatus(statuses)).toBe("ok");
  });

  it("returns error when any service has error and none loading", () => {
    const statuses = [makeStatus("ok"), makeStatus("error")];
    expect(overallStatus(statuses)).toBe("error");
  });

  it("returns degraded when mixed ok/degraded and no errors", () => {
    const statuses = [makeStatus("ok"), makeStatus("degraded")];
    expect(overallStatus(statuses)).toBe("degraded");
  });
});

describe("formatSensorStatus", () => {
  it("returns Available for true", () => {
    expect(formatSensorStatus(true)).toBe("Available");
  });

  it("returns Unavailable for false", () => {
    expect(formatSensorStatus(false)).toBe("Unavailable");
  });
});

describe("getSensorColor", () => {
  it("returns green for available", () => {
    expect(getSensorColor(true)).toBe("green");
  });

  it("returns red for unavailable", () => {
    expect(getSensorColor(false)).toBe("red");
  });
});

describe("formatPercent", () => {
  it("formats integer percentage value", () => {
    expect(formatPercent(100)).toBe("100%");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0%");
  });

  it("rounds to one decimal when not whole", () => {
    expect(formatPercent(95.5)).toBe("95.5%");
  });
});

describe("formatRatio", () => {
  it("formats a ratio (0-1) as percentage with one decimal", () => {
    expect(formatRatio(0.951)).toBe("95.1%");
  });

  it("formats zero ratio", () => {
    expect(formatRatio(0)).toBe("0.0%");
  });

  it("formats 1.0 as 100.0%", () => {
    expect(formatRatio(1)).toBe("100.0%");
  });
});

describe("formatDate", () => {
  it("formats ISO date string to readable format", () => {
    const result = formatDate("2026-05-09T05:48:08.683Z");
    expect(result).toContain("2026");
    expect(result).toContain("May");
  });
});

describe("formatMeasuredAt", () => {
  it("formats the ISO timestamp as a readable date", () => {
    expect(formatMeasuredAt("2026-07-29T00:00:00.000Z")).toBe("July 29, 2026");
  });

  it("reads the date in UTC so the label does not shift with the viewer's timezone", () => {
    // Midnight UTC is the previous day in every negative-offset zone; pinning to
    // UTC keeps the rendered date identical to the one the build recorded.
    expect(formatMeasuredAt("2026-01-01T00:30:00.000Z")).toBe("January 1, 2026");
  });
});

describe("formatTimestamp", () => {
  it("formats ISO timestamp to readable date", () => {
    const result = formatTimestamp("2026-05-09T05:48:08.683Z");
    expect(result).toContain("2026");
    expect(result).toContain("May");
  });

  it("handles null gracefully", () => {
    expect(formatTimestamp(null)).toBe("Never");
  });

  it("handles undefined gracefully", () => {
    expect(formatTimestamp(undefined)).toBe("Never");
  });
});

describe("isStale", () => {
  it("returns false when generatedAt is within the 14-day freshness window", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const generatedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(generatedAt, now)).toBe(false);
  });

  it("returns false exactly at the 14-day boundary", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const generatedAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(generatedAt, now)).toBe(false);
  });

  it("returns true when generatedAt exceeds the 14-day freshness window", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const generatedAt = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(generatedAt, now)).toBe(true);
  });
});

describe("SOURCE_COLORS", () => {
  it("maps js-weekly to yellow", () => {
    expect(SOURCE_COLORS["js-weekly"]).toBe("yellow");
  });

  it("maps react-weekly to blue", () => {
    expect(SOURCE_COLORS["react-weekly"]).toBe("blue");
  });

  it("maps ai-weekly to purple", () => {
    expect(SOURCE_COLORS["ai-weekly"]).toBe("purple");
  });

  it("maps other to neutral", () => {
    expect(SOURCE_COLORS["other"]).toBe("neutral");
  });
});

describe("SOURCE_LABELS", () => {
  it("maps js-weekly to JS Weekly", () => {
    expect(SOURCE_LABELS["js-weekly"]).toBe("JS Weekly");
  });

  it("maps react-weekly to React Weekly", () => {
    expect(SOURCE_LABELS["react-weekly"]).toBe("React Weekly");
  });

  it("maps ai-weekly to AI Weekly", () => {
    expect(SOURCE_LABELS["ai-weekly"]).toBe("AI Weekly");
  });

  it("maps other to Other", () => {
    expect(SOURCE_LABELS["other"]).toBe("Other");
  });
});
