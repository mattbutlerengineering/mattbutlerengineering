/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { AiHealthPage } from "./AiHealthPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Badge: ({ children, color }: any) => <span data-color={color}>{children}</span>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  // Rialto's real Text extends HTMLAttributes and spreads the rest, so the
  // mock must too — dropping them silently swallowed a `data-testid` (#5619).
  Text: ({ children, className, ...rest }: any) => (
    <span className={className} {...rest}>
      {children}
    </span>
  ),
  Spinner: ({ size }: any) => <div data-testid="spinner" data-size={size} />,
  Alert: ({
    children,
    variant,
    title,
    className,
  }: {
    children?: React.ReactNode;
    variant?: string;
    title?: string;
    className?: string;
  }) => (
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
    panelNote: "panelNote",
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

  it("no longer renders a Domain Activity panel — the collector was retired (#5561)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Review Burden")).toBeInTheDocument();
    });
    expect(screen.queryByText("Domain Activity")).not.toBeInTheDocument();
    expect(screen.queryByTestId("domain-activity-panel")).not.toBeInTheDocument();
  });

  describe("ACMM Maturity panel", () => {
    it("renders level, level name, and criteria-detected stats when available", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...MOCK_REPORT,
          sensors: {
            ...MOCK_REPORT.sensors,
            acmm: {
              available: true,
              level: 5,
              level_name: "Semi-Automated",
              criteria_met: 96,
              criteria_total: 99,
              capped: false,
              failing_gates: [],
            },
          },
        }),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("ACMM Maturity")).toBeInTheDocument();
        expect(screen.getByText("Level 5")).toBeInTheDocument();
        expect(screen.getByText("Semi-Automated")).toBeInTheDocument();
        expect(screen.getByText("96/99")).toBeInTheDocument();
      });
    });

    it("renders a graceful not-available state when the sensor is missing", async () => {
      const { acmm: _acmm, ...restSensors } = NEW_SCHEMA_REPORT.sensors;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...NEW_SCHEMA_REPORT, sensors: restSensors }),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("ACMM Maturity")).toBeInTheDocument();
        expect(screen.getByText("acmm")).toBeInTheDocument();
      });
      expect(screen.queryByText("Criteria Detected")).not.toBeInTheDocument();
    });

    it("shows a warning alert naming each failing gate's description when capped", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...MOCK_REPORT,
          sensors: {
            ...MOCK_REPORT.sensors,
            acmm: {
              available: true,
              level: 4,
              level_name: "Assisted",
              criteria_met: 80,
              criteria_total: 99,
              capped: true,
              failing_gates: [
                {
                  name: "acmm:human-touch-ratio",
                  description: "Human-touch ratio must be below 50% to reach level 5",
                  value: 0.62,
                  threshold: 0.5,
                  direction: "below",
                },
              ],
            },
          },
        }),
      });
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByText("Human-touch ratio must be below 50% to reach level 5")
        ).toBeInTheDocument();
        expect(screen.queryByText("acmm:human-touch-ratio")).not.toBeInTheDocument();
      });
    });

    it("does not render the blocking-gate alert when not capped", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...MOCK_REPORT, generated_at: isoHoursAgo(1) }),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("ACMM Maturity")).toBeInTheDocument();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

  describe("Review Burden panel (#5530)", () => {
    // The whole point of the panel: review-burden numbers were collected into
    // a file nobody read. A panel that silently renders nothing when the
    // sensor is missing would reproduce that, so both branches are asserted.
    const withReviewBurden = {
      ...MOCK_REPORT,
      sensors: {
        ...MOCK_REPORT.sensors,
        reviewBurden: {
          available: true,
          collected_at: "2026-09-19T04:52:03.798Z",
          window_days: 7,
          total_closed_prs: 73,
          total_reviewers: 3,
          total_reviews: 11,
          overall_rubber_stamp_ratio: 0.09,
          overall_approvals: 11,
          overall_rubber_stamps: 1,
        },
      },
    };

    it("renders reviewers, reviews, and the rubber-stamp ratio when available", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => withReviewBurden });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Review Burden")).toBeInTheDocument();
      });
      const panel = within(screen.getByTestId("review-burden-panel"));
      expect(panel.getByText("Reviewers")).toBeInTheDocument();
      expect(panel.getByText("3")).toBeInTheDocument();
      expect(panel.getByText("Reviews")).toBeInTheDocument();
      expect(panel.getByText("11")).toBeInTheDocument();
      expect(panel.getByText("Rubber-Stamped")).toBeInTheDocument();
      expect(panel.getByText("9.0%")).toBeInTheDocument();
      expect(panel.getByText("73")).toBeInTheDocument();
      expect(panel.getByText("7-day window")).toBeInTheDocument();
    });

    // #5619. Measured 2026-09-21: all 100 most-recently-closed PRs carry zero
    // GitHub review submissions, confirmed independently against
    // `GET /repos/.../pulls/{n}/reviews`. The rubber-stamp ratio is therefore
    // undefined, not 0% — rendering "0.0%" reads as a clean bill of health for
    // a repo that has no formal review stage to be clean about.
    const structuralZero = {
      ...MOCK_REPORT,
      sensors: {
        ...MOCK_REPORT.sensors,
        reviewBurden: {
          available: true,
          collected_at: "2026-09-21T01:23:00.924Z",
          window_days: 7,
          total_closed_prs: 100,
          total_reviewers: 0,
          total_reviews: 0,
          overall_rubber_stamp_ratio: 0,
          overall_approvals: 0,
          overall_rubber_stamps: 0,
          review_coverage: "no-formal-review-stage",
          no_formal_review_stage: true,
        },
      },
    };

    it("does not render a 0% rubber-stamp ratio when there is no formal review stage", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => structuralZero });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Review Burden")).toBeInTheDocument();
      });
      const panel = within(screen.getByTestId("review-burden-panel"));
      expect(panel.queryByText("0.0%")).not.toBeInTheDocument();
      expect(panel.getByTestId("review-burden-no-formal-stage")).toBeInTheDocument();
    });

    it("states the structural zero instead of implying reviewers are keeping up", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => structuralZero });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Review Burden")).toBeInTheDocument();
      });
      const note = within(screen.getByTestId("review-burden-panel")).getByTestId(
        "review-burden-no-formal-stage"
      );
      expect(note).toHaveTextContent(/no formal review stage/i);
      expect(note).toHaveTextContent(/100/);
      // Still reports the honest sample size it is based on.
      expect(
        within(screen.getByTestId("review-burden-panel")).getByText("100")
      ).toBeInTheDocument();
    });

    it("does not claim a structural zero when the collector never classified one", async () => {
      const unclassified = {
        ...structuralZero,
        sensors: {
          ...structuralZero.sensors,
          reviewBurden: {
            ...structuralZero.sensors.reviewBurden,
            review_coverage: "unknown",
            no_formal_review_stage: false,
          },
        },
      };
      mockFetch.mockResolvedValue({ ok: true, json: async () => unclassified });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Review Burden")).toBeInTheDocument();
      });
      expect(
        within(screen.getByTestId("review-burden-panel")).queryByTestId(
          "review-burden-no-formal-stage"
        )
      ).not.toBeInTheDocument();
    });

    it("says Unavailable rather than rendering nothing when the sensor is missing", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => NEW_SCHEMA_REPORT });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Review Burden")).toBeInTheDocument();
      });
      expect(screen.getByTestId("review-burden-panel")).toHaveTextContent("Unavailable");
      expect(
        within(screen.getByTestId("review-burden-panel")).queryByText("Reviews")
      ).not.toBeInTheDocument();
    });
  });

  // #5443: the page's whole stated purpose is honesty about self-improvement,
  // which a point-in-time snapshot cannot demonstrate. Both trends come from
  // one extra payload, fetched the same way the snapshot panels already are.
  describe("trend panels", () => {
    // Matches scripts/generate-health-trends.mjs's output.
    const MOCK_TRENDS = {
      generated_at: "2026-09-20T12:00:00.000Z",
      window_days: 60,
      acmmLevel: {
        label: "ACMM maturity level",
        source: ".claude/acmm/state.json",
        points: [
          { date: "2026-09-18", value: 4, note: null },
          { date: "2026-09-19", value: 5, note: null },
          { date: "2026-09-20", value: 5, note: null },
        ],
      },
      queueEfficiency: {
        label: "Queue efficiency composite",
        source: "metrics/process-metrics.jsonl",
        points: [
          { date: "2026-09-13", value: 0.923, note: null },
          { date: "2026-09-15", value: null, note: "query_error" },
          { date: "2026-09-16", value: 0.911, note: null },
        ],
      },
    };

    /** Routes each URL to its own payload, or to a rejection. */
    function mockByUrl(responses: Record<string, unknown>) {
      mockFetch.mockImplementation((url: string) => {
        const payload = responses[url];
        if (payload instanceof Error) return Promise.reject(payload);
        return Promise.resolve({ ok: true, json: async () => payload });
      });
    }

    it("fetches /ai-health-trends.json alongside the sensor report", async () => {
      mockByUrl({ "/sensor-report.json": MOCK_REPORT, "/ai-health-trends.json": MOCK_TRENDS });
      renderPage();

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          "/ai-health-trends.json",
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
      );
    });

    it("charts the ACMM level history and states it in text", async () => {
      mockByUrl({ "/sensor-report.json": MOCK_REPORT, "/ai-health-trends.json": MOCK_TRENDS });
      renderPage();

      const panel = await screen.findByTestId("acmm-level-trend");
      expect(panel).toHaveTextContent(
        "ACMM maturity level over 3 days: 4 on 2026-09-18 to 5 on 2026-09-20. " +
          "3 days measured, 0 days with no measurement."
      );
      expect(panel.querySelectorAll('[data-testid="trend-dot"]')).toHaveLength(3);
    });

    it("charts the queueEfficiency composite and surfaces its real gap", async () => {
      mockByUrl({ "/sensor-report.json": MOCK_REPORT, "/ai-health-trends.json": MOCK_TRENDS });
      renderPage();

      const panel = await screen.findByTestId("queue-efficiency-trend");
      expect(panel).toHaveTextContent("1 day with no measurement");
      expect(panel.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(1);
      expect(
        within(panel).getByRole("cell", { name: "No data (query_error)" })
      ).toBeInTheDocument();
    });

    it("still charts the history when today's snapshot reading is unavailable", async () => {
      // A failed collection today says nothing about the trailing window, so
      // hiding the trend behind the snapshot's availability would hide the
      // history the panel exists to show.
      mockByUrl({
        "/sensor-report.json": {
          ...MOCK_REPORT,
          sensors: { ...MOCK_REPORT.sensors, queueEfficiency: { available: false } },
        },
        "/ai-health-trends.json": MOCK_TRENDS,
      });
      renderPage();

      const panel = await screen.findByTestId("queue-efficiency-trend");
      expect(panel).toHaveTextContent("2 days measured, 1 day with no measurement");
    });

    it("says the trend history is unavailable rather than showing an empty chart", async () => {
      mockByUrl({
        "/sensor-report.json": MOCK_REPORT,
        "/ai-health-trends.json": new Error("Network error"),
      });
      renderPage();

      await waitFor(() =>
        expect(screen.getAllByText("Trend history unavailable.")).toHaveLength(2)
      );
      // The snapshot panels still render behind the missing trends.
      expect(screen.getByText("Key Metrics")).toBeInTheDocument();
      expect(screen.queryByTestId("acmm-level-trend")).not.toBeInTheDocument();
    });
  });
});
