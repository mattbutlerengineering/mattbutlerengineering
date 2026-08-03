/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { AiHealthPage } from "./AiHealthPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Badge: ({ children, color }: any) => <span data-color={color}>{children}</span>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Spinner: ({ size }: any) => <div data-testid="spinner" data-size={size} />,
  Alert: ({ children, variant, title, className }: any) => (
    <div role="alert" data-variant={variant} className={className}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  ),
}));

vi.mock("./AiHealthPage.module.css", () => ({
  default: {
    container: "container",
    header: "header",
    subtitle: "subtitle",
    meta: "meta",
    error: "error",
    loading: "loading",
    section: "section",
    statGrid: "statGrid",
    statCard: "statCard",
    statLabel: "statLabel",
    statValue: "statValue",
    statNote: "statNote",
    sensorGrid: "sensorGrid",
    sensorRow: "sensorRow",
    sensorName: "sensorName",
    sensorBadge: "sensorBadge",
    jsonLink: "jsonLink",
    staleBanner: "staleBanner",
  },
}));

/** Builds an ISO timestamp `hoursAgo` hours before now — keeps staleness tests independent of wall-clock date. */
function isoHoursAgo(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <AiHealthPage />
    </Wrapper>
  );
}

// Matches scripts/build-sensor-report.mjs's buildReport() output — the real
// shape written to apps/marketing/public/sensor-report.json.
const MOCK_REPORT = {
  generated_at: "2026-05-09T05:48:08.683Z",
  sensors: {
    acmm: { available: true, level: 6, criteria_met: 99, criteria_total: 100 },
    ciHealth: { available: true, pass_rate_pct: 95, completed: 10 },
    prMetrics: { available: true, latest: { merged: 16 } },
    issues: { available: true, created_7d: 20, closed_7d: 14, queue_depth: 3 },
    lighthouse: { available: false, note: "needs first run" },
    sentry: { available: true, totalIssues: 0, errorCount: 0, note: "healthy" },
    agentCost: { available: true, sessions: 5 },
    queueEfficiency: {
      available: true,
      composite: 0.95,
      sub_metrics: {
        issues_merged: 32,
        first_pass_success_rate: 0.875,
        median_time_to_merge_hours: 0.6,
        median_rework_cycles: 0,
        cost_per_issue_usd: 1.2,
        review_coverage: 0.25,
      },
      distribution: {
        "size:xs": { count: 12, avg_commits: 1.3, avg_ttm_hours: 2.4 },
        "size:m": { count: 9, avg_commits: 1.6, avg_ttm_hours: 2.3 },
      },
      baseline: null,
    },
  },
  regressions: [],
  summary: { sensors_available: 7, sensors_total: 8, regressions_detected: 0, status: "healthy" },
};

describe("AiHealthPage", () => {
  it("throws when rendered outside a QueryClientProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<AiHealthPage />)).toThrow(/QueryClient/i);
    consoleError.mockRestore();
  });

  it("renders loading spinner initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText("AI Health Dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders error when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Error loading.*Network error/)).toBeInTheDocument();
    });
  });

  it("renders error when response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Error loading.*404/)).toBeInTheDocument();
    });
  });

  it("fetches /sensor-report.json", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/sensor-report.json",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );
  });

  it("renders key metric cards on success", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("CI Pass Rate")).toBeInTheDocument();
      expect(screen.getByText("95%")).toBeInTheDocument();
      expect(screen.getByText("PRs Merged (30d)")).toBeInTheDocument();
      expect(screen.getByText("16")).toBeInTheDocument();
    });
  });

  it("renders issues ready count", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Issues Ready")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("renders sensor availability table", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Sensor Status")).toBeInTheDocument();
      expect(screen.getByText("acmm")).toBeInTheDocument();
      expect(screen.getByText("ciHealth")).toBeInTheDocument();
      expect(screen.getByText("sentry")).toBeInTheDocument();
    });
  });

  it("shows green badge for available sensors and red for unavailable", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() => {
      const greenBadges = screen.getAllByText("Available");
      const redBadges = screen.getAllByText("Unavailable");
      expect(greenBadges.length).toBeGreaterThan(0);
      expect(redBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders an explicit As of timestamp", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/As of/)).toBeInTheDocument();
      expect(screen.getByText(/May/)).toBeInTheDocument();
    });
  });

  it("renders link to raw JSON", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() => {
      const link = screen.getByText("View raw JSON");
      expect(link).toHaveAttribute("href", "/sensor-report.json");
    });
  });

  // #3659 regression guard: scripts/sensor-report.mjs now writes the newer
  // buildReport() schema (generated_at/ciHealth/prMetrics.latest/summary.sensors_*)
  // to this page's data source. Full migration is tracked separately (#3660);
  // this only asserts the page degrades to placeholders instead of throwing.
  const NEW_SCHEMA_REPORT = {
    generated_at: "2026-08-02T20:06:07.196Z",
    period: { start: "2026-07-26", end: "2026-08-02" },
    sensors: {
      acmm: { available: true, level: 5, criteria_met: 95, criteria_total: 114 },
      ciHealth: { available: true, pass_rate_pct: 72, passed: 21, completed: 29 },
      prMetrics: { available: true, latest: { merged: 65 }, entry_count: 2 },
      issues: { available: true, created_7d: 50, closed_7d: 16, queue_depth: 27 },
    },
    regressions: [
      { sensor: "ciHealth", metric: "pass_rate_pct", current: 72, previous: 89, delta: -17 },
    ],
    summary: { sensors_available: 11, sensors_total: 15, regressions_detected: 1 },
  };

  it("renders the new buildReport() schema shape without throwing", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => NEW_SCHEMA_REPORT });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("AI Health Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Sensor Status")).toBeInTheDocument();
      expect(screen.getByText("ciHealth")).toBeInTheDocument();
    });
  });

  it("falls back to placeholders for fields the new schema renamed", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => NEW_SCHEMA_REPORT });
    renderPage();
    await waitFor(() => {
      // sensors.ci doesn't exist under the new schema (renamed to ciHealth
      // with different field names) — old-shape reads must not throw.
      expect(screen.getByText("CI Pass Rate")).toBeInTheDocument();
    });
  });

  it("renders new-schema regression objects as readable labels, not [object Object]", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => NEW_SCHEMA_REPORT });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Active Regressions")).toBeInTheDocument();
      expect(screen.getByText("ciHealth.pass_rate_pct")).toBeInTheDocument();
    });
  });

  describe("Queue Efficiency panel", () => {
    it("renders composite score and sub-metrics when the sensor is available", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Queue Efficiency")).toBeInTheDocument();
        expect(screen.getByText("0.95")).toBeInTheDocument();
        expect(screen.getByText("87.5%")).toBeInTheDocument();
        expect(screen.getByText("$1.20")).toBeInTheDocument();
        expect(screen.getByText("0.6h")).toBeInTheDocument();
      });
    });

    it("renders size-tier distribution counts", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("size:xs")).toBeInTheDocument();
        expect(screen.getByText("12")).toBeInTheDocument();
        expect(screen.getByText("size:m")).toBeInTheDocument();
        expect(screen.getByText("9")).toBeInTheDocument();
      });
    });

    it("renders a graceful not-available state when the sensor is missing", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => NEW_SCHEMA_REPORT });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Queue Efficiency")).toBeInTheDocument();
        expect(screen.getByText("queueEfficiency")).toBeInTheDocument();
      });
      expect(screen.queryByText("Composite Score")).not.toBeInTheDocument();
    });
  });

  describe("stale-data banner", () => {
    it("hides the banner when generated_at is 47h59m old", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...MOCK_REPORT, generated_at: isoHoursAgo(47 + 59 / 60) }),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("AI Health Dashboard")).toBeInTheDocument();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the banner when generated_at is 48h01m old", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...MOCK_REPORT, generated_at: isoHoursAgo(48 + 1 / 60) }),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
    });

    it("still renders the As of line when the banner is showing", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...MOCK_REPORT, generated_at: isoHoursAgo(72) }),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/As of/)).toBeInTheDocument();
      });
    });
  });
});
