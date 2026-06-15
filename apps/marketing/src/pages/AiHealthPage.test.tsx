/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiHealthPage } from "./AiHealthPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Badge: ({ children, color }: any) => <span data-color={color}>{children}</span>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Spinner: ({ size }: any) => <div data-testid="spinner" data-size={size} />,
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
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_REPORT = {
  timestamp: "2026-05-09T05:48:08.683Z",
  sensors: {
    acmm: { available: true, level: "6", score: 99, gaps: 1 },
    ci: { available: true, passRate: 95, recentRuns: 10 },
    prMetrics: { available: true, merged30d: 16 },
    issues: { available: true, open: 14, ready: 3 },
    lighthouse: { available: false, surfacesChecked: 0, surfacesTotal: 4, note: "needs first run" },
    sentry: { available: true, totalIssues: 0, errorCount: 0, note: "healthy" },
    agentCost: { available: true, sessions: 5 },
  },
  regressions: [],
  summary: { available: 6, total: 7 },
};

describe("AiHealthPage", () => {
  it("renders loading spinner initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<AiHealthPage />);
    expect(screen.getByText("AI Health Dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders error when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<AiHealthPage />);
    await waitFor(() => {
      expect(screen.getByText(/Error loading.*Network error/)).toBeInTheDocument();
    });
  });

  it("renders error when response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    render(<AiHealthPage />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load.*404/)).toBeInTheDocument();
    });
  });

  it("fetches /sensor-report.json", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AiHealthPage />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/sensor-report.json"));
  });

  it("renders key metric cards on success", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AiHealthPage />);
    await waitFor(() => {
      expect(screen.getByText("CI Pass Rate")).toBeInTheDocument();
      expect(screen.getByText("95%")).toBeInTheDocument();
      expect(screen.getByText("PRs Merged (30d)")).toBeInTheDocument();
      expect(screen.getByText("16")).toBeInTheDocument();
    });
  });

  it("renders issues ready count", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AiHealthPage />);
    await waitFor(() => {
      expect(screen.getByText("Issues Ready")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("renders sensor availability table", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AiHealthPage />);
    await waitFor(() => {
      expect(screen.getByText("Sensor Status")).toBeInTheDocument();
      expect(screen.getByText("acmm")).toBeInTheDocument();
      expect(screen.getByText("ci")).toBeInTheDocument();
      expect(screen.getByText("sentry")).toBeInTheDocument();
    });
  });

  it("shows green badge for available sensors and red for unavailable", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AiHealthPage />);
    await waitFor(() => {
      const greenBadges = screen.getAllByText("Available");
      const redBadges = screen.getAllByText("Unavailable");
      expect(greenBadges.length).toBeGreaterThan(0);
      expect(redBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders last updated timestamp", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AiHealthPage />);
    await waitFor(() => {
      expect(screen.getByText(/Last updated/)).toBeInTheDocument();
      expect(screen.getByText(/May/)).toBeInTheDocument();
    });
  });

  it("renders link to raw JSON", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AiHealthPage />);
    await waitFor(() => {
      const link = screen.getByText("View raw JSON");
      expect(link).toHaveAttribute("href", "/sensor-report.json");
    });
  });
});
