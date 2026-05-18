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
    section: "section",
    workspaceGrid: "workspaceGrid",
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

const MOCK_WORKSPACE = {
  name: "rialto",
  path: "packages/rialto",
  type: "package" as const,
  currentLevel: 6,
  levelName: "Fully Autonomous",
  role: "Strategist",
  lastRun: "2026-05-01T00:00:00.000Z",
  summary: { detected: 45, total: 85, coverage: 0.529 },
  behavioral: {
    ciFlakeRate: 0,
    agentPrAcceptanceRate: 0.96,
    agentPrRevertRate: 0,
    evalPassRate: 0,
  },
  checks: {
    "acmm:prereq-test-suite": { passed: true },
    "acmm:claude-md": { passed: true },
    "acmm:editor-config": { passed: false },
  },
  behavioralGates: [{ level: 3, name: "ci-flake-rate", passed: true, value: 0, threshold: 0.2 }],
};

const MOCK_REPORT = {
  schema: "acmm-report/v1",
  generatedAt: "2026-05-01T10:00:00.000Z",
  workspaces: [
    MOCK_WORKSPACE,
    {
      ...MOCK_WORKSPACE,
      name: "users",
      path: "services/users",
      type: "service" as const,
      currentLevel: 5,
      levelName: "Optimizing",
    },
    {
      ...MOCK_WORKSPACE,
      name: "marketing",
      path: "apps/marketing",
      type: "app" as const,
      currentLevel: 3,
      levelName: "Integrated",
    },
  ],
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
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/acmm-report.json"));
  });

  it("groups workspaces by type with section headings", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText("Services")).toBeInTheDocument();
      expect(screen.getByText("Apps")).toBeInTheDocument();
      expect(screen.getByText("Packages")).toBeInTheDocument();
    });
  });

  it("renders workspace cards with level badge and name", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getByText("L6")).toBeInTheDocument();
      expect(screen.getByText("rialto")).toBeInTheDocument();
      expect(screen.getByText("Fully Autonomous")).toBeInTheDocument();
    });
  });

  it("shows criteria count and coverage", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      expect(screen.getAllByText("45/85 criteria").length).toBeGreaterThan(0);
    });
  });

  it("expands criteria on toggle button click", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("rialto"));

    const toggleBtn = screen.getAllByRole("button")[0];
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/prereq-test-suite/)).toBeInTheDocument();
      expect(screen.getByText(/editor-config/)).toBeInTheDocument();
    });
  });

  it("shows behavioral gates in expanded view", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("rialto"));

    const toggleBtn = screen.getAllByRole("button")[0];
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText("ci flake rate")).toBeInTheDocument();
    });
  });

  it("collapses on second toggle click", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => screen.getByText("rialto"));

    const toggleBtn = screen.getAllByRole("button")[0];
    fireEvent.click(toggleBtn);
    await waitFor(() => screen.getByText(/prereq-test-suite/));

    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(screen.queryByText(/prereq-test-suite/)).not.toBeInTheDocument();
    });
  });

  it("renders raw JSON link", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_REPORT });
    render(<AcmmPage />);
    await waitFor(() => {
      const link = screen.getByText("View raw JSON");
      expect(link).toHaveAttribute("href", "/acmm-report.json");
    });
  });
});
