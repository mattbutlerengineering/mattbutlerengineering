import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MetricsPage } from "./MetricsPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children }: any) => createElement("h2", null, children),
  Text: ({ children }: any) => createElement("p", null, children),
  Card: ({ children }: any) => createElement("div", null, children),
  Badge: ({ children, color }: any) => createElement("span", { "data-color": color }, children),
  Spinner: () => createElement("div", { "data-testid": "spinner" }),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<MetricsPage />);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
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

  it("renders criteria by level breakdown", async () => {
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
