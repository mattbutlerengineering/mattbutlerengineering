/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AcmmPage } from "./AcmmPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({ children, color }: any) => <span data-color={color}>{children}</span>,
  Button: ({ children, onClick, "aria-expanded": expanded }: any) => (
    <button onClick={onClick} aria-expanded={expanded}>
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Spinner: ({ size }: any) => <div data-testid="spinner" data-size={size} />,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

vi.mock("./AcmmPage.module.css", () => ({
  default: {
    container: "container",
    header: "header",
    subtitle: "subtitle",
    meta: "meta",
    error: "error",
    loading: "loading",
    wsCard: "wsCard",
    wsHeader: "wsHeader",
    wsTitle: "wsTitle",
    wsName: "wsName",
    wsLevel: "wsLevel",
    wsCoverage: "wsCoverage",
    coverageLabel: "coverageLabel",
    progressTrack: "progressTrack",
    progressFill: "progressFill",
    wsDetails: "wsDetails",
    detailSection: "detailSection",
    detailLabel: "detailLabel",
    criteriaList: "criteriaList",
    criteriaRow: "criteriaRow",
    passIcon: "passIcon",
    failIcon: "failIcon",
    criteriaId: "criteriaId",
    jsonLink: "jsonLink",
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const STALE_EVALS_REPORT = {
  schema: "acmm-report/v2",
  generatedAt: "2026-09-28T19:23:59.522Z",
  repo: {
    currentLevel: 6,
    levelName: "Fully Autonomous",
    role: "Strategist",
    lastRun: "2026-09-28T16:07:00.403Z",
    summary: { detected: 97, total: 114, coverage: 0.8508771929824561 },
    behavioral: {
      ciFlakeRate: 0,
      agentPrAcceptanceRate: 0.9841269841269841,
      agentPrRevertRate: 0,
      evalPassRate: null,
      evalsStale: true,
      evalsLastRun: "2026-05-10T21:42:57.095Z",
    },
    checks: {
      "acmm:prereq-test-suite": { passed: true },
      "acmm:claude-md": { passed: true },
      "acmm:editor-config": { passed: false },
    },
  },
};

const FRESH_EVALS_REPORT = {
  ...STALE_EVALS_REPORT,
  repo: {
    ...STALE_EVALS_REPORT.repo,
    behavioral: {
      ...STALE_EVALS_REPORT.repo.behavioral,
      evalPassRate: 0.865,
      evalsStale: false,
      evalsLastRun: "2026-09-25T00:00:00.000Z",
    },
  },
};

describe("AcmmPage", () => {
  it("renders loading spinner initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<AcmmPage />);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(screen.getByText("ACMM Dashboard")).toBeInTheDocument();
  });

  it("renders error when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Error loading report.*Network error/)).toBeInTheDocument();
    });
  });

  it("renders error when response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load report: 404/)).toBeInTheDocument();
    });
  });

  it("fetches /acmm-report.json", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/acmm-report.json"));
  });

  it("renders the repo level badge, level name, and role", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText("L6")).toBeInTheDocument();
      expect(screen.getByText("Fully Autonomous")).toBeInTheDocument();
      expect(screen.getByText("Strategist")).toBeInTheDocument();
    });
  });

  it("shows criteria met/total and coverage percent", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText("97/114 criteria")).toBeInTheDocument();
      expect(screen.getByText("85.1%")).toBeInTheDocument();
    });
  });

  it("shows the last-updated date from generatedAt", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Last updated: Sep 28, 2026/)).toBeInTheDocument();
    });
  });

  it("renders stale evals as 'not measured since <date>', never a percentage", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Agent evals: not measured since May 10, 2026/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/86.*pass/)).not.toBeInTheDocument();
  });

  it("renders a live pass rate when evals are fresh", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => FRESH_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Agent evals: 86.5% pass/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/not measured/)).not.toBeInTheDocument();
  });

  it("does not render the old per-workspace grouping headings", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("Fully Autonomous"));
    expect(screen.queryByText("Services")).not.toBeInTheDocument();
    expect(screen.queryByText("Apps")).not.toBeInTheDocument();
    expect(screen.queryByText("Packages")).not.toBeInTheDocument();
  });

  it("expands criteria on toggle button click", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("Fully Autonomous"));

    const toggleBtn = screen.getAllByRole("button")[0];
    if (!toggleBtn) throw new Error("expected a toggle button");
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/prereq-test-suite/)).toBeInTheDocument();
      expect(screen.getByText(/editor-config/)).toBeInTheDocument();
    });
  });

  it("collapses on second toggle click", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("Fully Autonomous"));

    const toggleBtn = screen.getAllByRole("button")[0];
    if (!toggleBtn) throw new Error("expected a toggle button");
    fireEvent.click(toggleBtn);
    await waitFor(() => screen.getByText(/prereq-test-suite/));

    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(screen.queryByText(/prereq-test-suite/)).not.toBeInTheDocument();
    });
  });

  it("renders raw JSON link", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      const link = screen.getByText("View raw JSON");
      expect(link).toHaveAttribute("href", "/acmm-report.json");
    });
  });
});
