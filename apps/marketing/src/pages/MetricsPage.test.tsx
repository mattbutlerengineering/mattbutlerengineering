/* eslint-disable @typescript-eslint/no-explicit-any, mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MetricsPage } from "./MetricsPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Badge: ({ children, color }: any) => <span data-color={color}>{children}</span>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Spinner: ({ size }: any) => <div data-testid="spinner" data-size={size} />,
}));

vi.mock("./MetricsPage.module.css", () => ({
  default: {
    container: "container",
    header: "header",
    subtitle: "subtitle",
    meta: "meta",
    error: "error",
    loading: "loading",
    section: "section",
    levelCard: "levelCard",
    levelDisplay: "levelDisplay",
    levelNumber: "levelNumber",
    levelInfo: "levelInfo",
    levelName: "levelName",
    levelRole: "levelRole",
    coverageBar: "coverageBar",
    coverageLabel: "coverageLabel",
    progressTrack: "progressTrack",
    progressFill: "progressFill",
    gateGrid: "gateGrid",
    gateCard: "gateCard",
    gateHeader: "gateHeader",
    gateName: "gateName",
    gateValue: "gateValue",
    statGrid: "statGrid",
    statCard: "statCard",
    statLabel: "statLabel",
    statValue: "statValue",
    historyTable: "historyTable",
    historyHeader: "historyHeader",
    historyRow: "historyRow",
    historyCell: "historyCell",
    levelBreakdown: "levelBreakdown",
    levelRow: "levelRow",
    levelLabel: "levelLabel",
    levelBarTrack: "levelBarTrack",
    levelBarFill: "levelBarFill",
    levelCount: "levelCount",
    jsonLink: "jsonLink",
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_METRICS = {
  schema: "acmm-metrics-v1",
  generatedAt: "2026-05-01T10:00:00Z",
  level: 3,
  levelName: "Integrated",
  role: "Tech Lead",
  summary: { detected: 45, total: 60, coverage: 0.75 },
  prerequisites: { met: 8, total: 10 },
  behavioral: {
    ciFlakeRate: 0.02,
    agentPrAcceptanceRate: 0.85,
    agentPrRevertRate: 0.05,
    evalPassRate: 0.9,
    evalMedianScore: 0.88,
  },
  history: [
    { date: "2026-04-01", level: 2, detected: 30, total: 55 },
    { date: "2026-05-01", level: 3, detected: 45, total: 60 },
  ],
  detectedByLevel: { "1": 15, "2": 20, "3": 10 },
  behavioralGates: [
    { level: 2, name: "ci-flake-rate", passed: true, value: 0.02, threshold: 0.1 },
    { level: 3, name: "agent-pr-acceptance", passed: true, value: 0.85, threshold: 0.7 },
    { level: 3, name: "eval-pass-rate", passed: false, value: 0.9, threshold: 0.95 },
  ],
};

const mockMetrics = {
  schema: "acmm-metrics-v1",
  generatedAt: "2026-05-08T12:00:00.000Z",
  level: 4,
  levelName: "L4 — Managed",
  role: "platform-owner",
  summary: { detected: 42, total: 60, coverage: 0.7 },
  prerequisites: { met: 8, total: 10 },
  behavioral: {
    ciFlakeRate: 0.05,
    agentPrAcceptanceRate: 0.85,
    agentPrRevertRate: 0.02,
    evalPassRate: 0.92,
    evalMedianScore: 0.88,
  },
  history: [
    { date: "2026-04-01", level: 3, detected: 30, total: 60 },
    { date: "2026-05-01", level: 4, detected: 42, total: 60 },
  ],
  detectedByLevel: { "1": 10, "2": 12, "3": 12, "4": 8 },
  behavioralGates: [
    { level: 4, name: "ci-flake-rate", passed: true, value: 0.05, threshold: 0.1 },
    { level: 4, name: "pr-acceptance-rate", passed: true, value: 0.85, threshold: 0.7 },
    { level: 4, name: "pr-revert-rate", passed: false, value: 0.15, threshold: 0.05 },
  ],
};

describe("MetricsPage", () => {
  it("renders loading state with spinner", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<MetricsPage />);

    expect(screen.getByText("Quality Metrics")).toBeInTheDocument();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading metrics/)).toBeInTheDocument();
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it("renders error state when response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load metrics: 404/)).toBeInTheDocument();
    });
  });

  it("renders metrics data on successful fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => MOCK_METRICS,
    });
    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText("Integrated")).toBeInTheDocument();
      expect(screen.getByText("Current Level")).toBeInTheDocument();
      expect(screen.getByText(/Role:.*Tech Lead/)).toBeInTheDocument();
    });
  });

  it("renders behavioral gates with pass/fail badges", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => MOCK_METRICS,
    });
    render(<MetricsPage />);

    await waitFor(() => {
      const passBadges = screen.getAllByText("Pass");
      const failBadges = screen.getAllByText("Fail");
      expect(passBadges.length).toBe(2);
      expect(failBadges.length).toBe(1);
    });
  });

  it("renders agent performance stats with formatted percentages", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => MOCK_METRICS,
    });
    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText("85.0%")).toBeInTheDocument();
      expect(screen.getByText("5.0%")).toBeInTheDocument();
      expect(screen.getByText("2.0%")).toBeInTheDocument();
      expect(screen.getByText("90.0%")).toBeInTheDocument();
    });
  });

  it("renders history entries in reverse chronological order", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => MOCK_METRICS,
    });
    render(<MetricsPage />);

    await waitFor(() => {
      const dateTexts = screen.getAllByText(/2026-0[45]-01/);
      expect(dateTexts.length).toBe(2);
      expect(dateTexts[0].textContent).toBe("2026-05-01");
      expect(dateTexts[1].textContent).toBe("2026-04-01");
    });
  });

  it("renders criteria by level breakdown", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => MOCK_METRICS,
    });
    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText("Level 1")).toBeInTheDocument();
      expect(screen.getByText("Level 2")).toBeInTheDocument();
      expect(screen.getByText("Level 3")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
    });
  });

  it("renders loading state initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<MetricsPage />);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders error state on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));
    render(<MetricsPage />);
    await waitFor(() => {
      expect(screen.getByText(/error loading metrics/i)).toBeInTheDocument();
    });
  });

  it("renders error state on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });
    render(<MetricsPage />);
    await waitFor(() => {
      expect(screen.getByText(/error loading metrics/i)).toBeInTheDocument();
    });
  });

  it("renders metrics data when fetch succeeds", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    });
    render(<MetricsPage />);
    await waitFor(() => {
      expect(screen.getByText("Quality Metrics")).toBeInTheDocument();
      expect(screen.getByText("L4 — Managed")).toBeInTheDocument();
      expect(screen.getAllByText("Pass")).toHaveLength(2);
      expect(screen.getByText("Fail")).toBeInTheDocument();
    });
  });

  it("renders behavioral gate values", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    });
    render(<MetricsPage />);
    await waitFor(() => {
      expect(screen.getByText("PR Acceptance")).toBeInTheDocument();
      expect(screen.getByText("PR Revert Rate")).toBeInTheDocument();
      expect(screen.getByText("CI Flake Rate")).toBeInTheDocument();
      expect(screen.getByText("Eval Pass Rate")).toBeInTheDocument();
    });
  });

  it("renders history entries", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    });
    render(<MetricsPage />);
    await waitFor(() => {
      expect(screen.getByText("2026-04-01")).toBeInTheDocument();
      expect(screen.getByText("2026-05-01")).toBeInTheDocument();
    });
  });

  it("renders criteria from main by level breakdown", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    });
    render(<MetricsPage />);
    await waitFor(() => {
      expect(screen.getByText("Level 1")).toBeInTheDocument();
      expect(screen.getByText("Level 2")).toBeInTheDocument();
      expect(screen.getByText("Level 4")).toBeInTheDocument();
    });
  });

  it("renders raw JSON link", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    });
    render(<MetricsPage />);
    await waitFor(() => {
      const link = screen.getByText("View raw JSON");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/metrics.json");
    });
  });
});
