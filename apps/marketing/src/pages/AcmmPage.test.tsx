/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AcmmPage } from "./AcmmPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({ children, variant }: any) => <span data-variant={variant}>{children}</span>,
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
    gateList: "gateList",
    gateRow: "gateRow",
    gateRowName: "gateRowName",
    gateRowValue: "gateRowValue",
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

// Midday UTC on purpose: formatDate() renders in the local timezone via
// toLocaleDateString, so a late-UTC timestamp (e.g. 19:23Z or 21:42Z) rolls
// over to the next calendar day under TZ=Asia/Tokyo (UTC+9). Noon UTC stays
// on the same calendar day for every real timezone from UTC-11 to UTC+11.
const STALE_EVALS_REPORT = {
  schema: "acmm-report/v2",
  generatedAt: "2026-09-28T12:00:00.000Z",
  repo: {
    currentLevel: 6,
    levelName: "Fully Autonomous",
    role: "Strategist",
    // Audited the same day the report was generated, in this fixture.
    lastRun: "2026-09-28T12:00:00.000Z",
    summary: { detected: 97, total: 114, coverage: 0.8508771929824561 },
    behavioral: {
      ciFlakeRate: 0,
      agentPrAcceptanceRate: 0.9841269841269841,
      agentPrRevertRate: 0,
      evalPassRate: null,
      evalsStale: true,
      evalsLastRun: "2026-05-10T12:00:00.000Z",
    },
    checks: {
      "acmm:prereq-test-suite": { passed: true },
      "acmm:claude-md": { passed: true },
      "acmm:editor-config": { passed: false },
    },
    behavioralGates: [
      {
        level: 3,
        name: "ci-flake-rate",
        passed: true,
        value: 0,
        threshold: 0.2,
        unverifiable: false,
      },
      {
        level: 6,
        name: "agent-pr-revert-rate",
        passed: false,
        value: 0.15,
        threshold: 0.1,
        unverifiable: false,
      },
      // #5852 gates that couldn't be checked carry `unverifiable: true` and a
      // null value — must render without crashing or printing "null".
      {
        level: 6,
        name: "human-touch-ratio",
        passed: false,
        value: null,
        threshold: 0.5,
        unverifiable: true,
      },
    ],
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
      evalsLastRun: "2026-09-25T12:00:00.000Z",
    },
  },
};

// Audit ran months before the report was (re)generated — the header must
// show the OLDER lastRun date, never the newer generatedAt.
const OLD_AUDIT_REPORT = {
  ...STALE_EVALS_REPORT,
  generatedAt: "2026-09-28T12:00:00.000Z",
  repo: {
    ...STALE_EVALS_REPORT.repo,
    lastRun: "2026-05-10T12:00:00.000Z",
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

  it("maps a high level (L6) to the Badge success variant", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText("L6")).toHaveAttribute("data-variant", "success");
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

  it("shows the audited date from repo.lastRun", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Audited Sep 28, 2026/)).toBeInTheDocument();
    });
  });

  it("shows the lastRun date, not generatedAt, when the audit predates the report by months", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => OLD_AUDIT_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Audited May 10, 2026/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Sep 28, 2026/)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when lastRun is missing, without crashing", async () => {
    const noLastRun = {
      ...STALE_EVALS_REPORT,
      repo: { ...STALE_EVALS_REPORT.repo, lastRun: null },
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => noLastRun });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText(/Audited date unknown/)).toBeInTheDocument();
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

  it("renders behavioral gates in the expanded view with name, value/threshold, and pass/fail badges", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("Fully Autonomous"));

    const toggleBtn = screen.getAllByRole("button")[0];
    if (!toggleBtn) throw new Error("expected a toggle button");
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText("ci flake rate")).toBeInTheDocument();
      expect(screen.getByText("Pass")).toBeInTheDocument();
      expect(screen.getByText("Pass")).toHaveAttribute("data-variant", "success");
      expect(screen.getByText("agent pr revert rate")).toBeInTheDocument();
      expect(screen.getByText("Fail")).toBeInTheDocument();
      expect(screen.getByText("Fail")).toHaveAttribute("data-variant", "error");
      expect(screen.getByText("0 / 0.2")).toBeInTheDocument();
    });
  });

  it("renders an unverifiable gate with a null value without crashing or printing 'null'", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => STALE_EVALS_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("Fully Autonomous"));

    const toggleBtn = screen.getAllByRole("button")[0];
    if (!toggleBtn) throw new Error("expected a toggle button");
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText("human touch ratio")).toBeInTheDocument();
      expect(screen.getByText("Unverifiable")).toBeInTheDocument();
      expect(screen.getByText("Unverifiable")).toHaveAttribute("data-variant", "neutral");
      expect(screen.getByText("— / 0.5")).toBeInTheDocument();
    });
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
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
