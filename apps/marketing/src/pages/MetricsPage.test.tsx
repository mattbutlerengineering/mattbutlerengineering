/* eslint-disable @typescript-eslint/no-explicit-any, mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MetricsPage } from "./MetricsPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Badge: ({ children, color }: any) => <span data-color={color}>{children}</span>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Spinner: ({ size }: any) => <div data-testid="spinner" data-size={size} />,
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
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
      expect(screen.getByText("85.0%")).toBeInTheDocument(); // PR acceptance
      expect(screen.getByText("5.0%")).toBeInTheDocument(); // PR revert
      expect(screen.getByText("2.0%")).toBeInTheDocument(); // CI flake
      expect(screen.getByText("90.0%")).toBeInTheDocument(); // Eval pass
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
      // Reversed: most recent first
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
});
