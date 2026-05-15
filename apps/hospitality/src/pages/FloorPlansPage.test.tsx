/* eslint-disable react/jsx-no-undef, @typescript-eslint/no-explicit-any, @eslint-react/no-array-index-key */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FloorPlansPage } from "./FloorPlansPage.js";
import { useAuth } from "@mbe/auth/react";
import { useNavigate } from "react-router-dom";
import { useVenue } from "../contexts/VenueContext.js";

vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual("react-router-dom")),
  useNavigate: vi.fn(),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));

const { mockFloorPlansList, mockFloorPlansClone, mockFloorPlansCreate } = vi.hoisted(() => ({
  mockFloorPlansList: vi.fn(),
  mockFloorPlansClone: vi.fn(),
  mockFloorPlansCreate: vi.fn(),
}));
vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(() => ({
    floorPlans: {
      list: mockFloorPlansList,
      clone: mockFloorPlansClone,
      create: mockFloorPlansCreate,
    },
  })),
}));

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));
vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ error, onRetry, onDismiss }: any) => (
    <div data-testid="error-banner">
      {error}
      <button onClick={onRetry}>Retry</button>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  ),
}));
vi.mock("../components/floor-plan", () => ({
  NewFloorPlanDialog: ({ onClose, onCreated, onCreate }: any) => (
    <div data-testid="new-dialog">
      <button onClick={onClose}>Close</button>
      <button
        onClick={() => {
          onCreate({ name: "Test Plan", venueId: "v1" }).then((fp: any) => onCreated(fp));
        }}
      >
        Create
      </button>
    </div>
  ),
}));
vi.mock("./FloorPlansPage.module.css", () => ({
  default: {
    container: "container",
    header: "header",
    cardGrid: "cardGrid",
    card: "card",
    cardPreview: "cardPreview",
    cardPreviewIcon: "pi",
    cardBody: "cardBody",
    cardActions: "cardActions",
    cardMeta: "cardMeta",
    cardName: "cardName",
    cardDetails: "cardDetails",
  },
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, disabled, variant, size, ...rest }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      aria-label={rest["aria-label"]}
    >
      {children}
    </button>
  ),
  EmptyState: ({ heading, description }: any) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

/* ── Test data ─────────────────────────────────, @eslint-react/no-array-index-key */

const mockFloorPlan = {
  id: "fp-1",
  name: "Main Dining",
  tables: [{ id: "t1" }, { id: "t2" }],
  isActive: true,
  updatedAt: "2026-01-15T10:00:00Z",
};

const mockFloorPlan2 = {
  id: "fp-2",
  name: "Patio",
  tables: [{ id: "t3" }],
  isActive: false,
  updatedAt: "2026-02-20T14:00:00Z",
};

/* ── Helpers ───────────────────────────────────, @eslint-react/no-array-index-key */

const mockNavigate = vi.fn();

function renderPage() {
  return render(
    <MemoryRouter>
      <FloorPlansPage />
    </MemoryRouter>
  );
}

describe("FloorPlansPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ accessToken: "tok-abc" } as any);
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "v1",
      venues: [{ id: "v1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);
    mockFloorPlansList.mockResolvedValue({ data: [mockFloorPlan, mockFloorPlan2] });
  });

  it("shows loading skeleton initially", () => {
    mockFloorPlansList.mockReturnValue(new Promise(() => {}));
    renderPage();

    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.getByTestId("skeleton-group")).toBeDefined();
  });

  it("shows card grid after loading", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Main Dining")).toBeDefined();
    });
    expect(screen.getByText("Patio")).toBeDefined();
  });

  it("each card shows name, table count, and updated date", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    expect(screen.getByText("2 tables")).toBeDefined();
    expect(screen.getByText("1 tables")).toBeDefined();

    const formattedDate = new Date("2026-01-15T10:00:00Z").toLocaleDateString();
    expect(screen.getByText(`Updated ${formattedDate}`)).toBeDefined();
  });

  it("active floor plan shows Active badge", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    const badges = screen.getAllByTestId("badge");
    const activeBadge = badges.find((b) => b.textContent === "Active");
    expect(activeBadge).toBeDefined();
  });

  it("clicking card navigates to /floor-plans/:id", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    const cardButton = screen.getByLabelText("Open floor plan: Main Dining");
    fireEvent.click(cardButton);

    expect(mockNavigate).toHaveBeenCalledWith("/floor-plans/fp-1");
  });

  it("New Floor Plan button opens dialog", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    fireEvent.click(screen.getByText("New Floor Plan"));

    expect(screen.getByTestId("new-dialog")).toBeDefined();
  });

  it("New Floor Plan button disabled when no selectedVenueId", async () => {
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: null,
      venues: [],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    renderPage();

    await waitFor(() => {
      const btn = screen.getByText("New Floor Plan");
      expect(btn).toBeDefined();
    });

    const btn = screen.getByText("New Floor Plan");
    expect(btn.closest("button")!.disabled).toBe(true);
  });

  it("clone button calls api.floorPlans.clone and navigates", async () => {
    const clonedPlan = {
      id: "fp-3",
      name: "Main Dining (Copy)",
      tables: [{ id: "t4" }],
      isActive: false,
      updatedAt: "2026-03-01T08:00:00Z",
    };
    mockFloorPlansClone.mockResolvedValue(clonedPlan);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    const cloneBtn = screen.getByLabelText("Clone floor plan: Main Dining");
    await act(async () => {
      fireEvent.click(cloneBtn);
    });

    expect(mockFloorPlansClone).toHaveBeenCalledWith("fp-1");
    expect(mockNavigate).toHaveBeenCalledWith("/floor-plans/fp-3");
  });

  it("clone error shows error banner", async () => {
    mockFloorPlansClone.mockRejectedValue(new Error("Clone failed"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    const cloneBtn = screen.getByLabelText("Clone floor plan: Main Dining");
    await act(async () => {
      fireEvent.click(cloneBtn);
    });

    await waitFor(() => {
      const banner = screen.getByTestId("error-banner");
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain("Clone failed");
    });
  });

  it("shows empty state when no floor plans", async () => {
    mockFloorPlansList.mockResolvedValue({ data: [] });

    renderPage();

    await waitFor(() => {
      const empty = screen.getByTestId("empty-state");
      expect(empty).toBeDefined();
      expect(empty.textContent).toContain("No floor plans yet");
    });
  });

  it("shows ErrorRetryBanner on fetch error", async () => {
    mockFloorPlansList.mockRejectedValue(new Error("Server error"));

    renderPage();

    await waitFor(() => {
      const banner = screen.getByTestId("error-banner");
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain("Server error");
    });
  });

  it("live region updates on clone success", async () => {
    const clonedPlan = {
      id: "fp-4",
      name: "Patio (Copy)",
      tables: [],
      isActive: false,
      updatedAt: "2026-03-10T12:00:00Z",
    };
    mockFloorPlansClone.mockResolvedValue(clonedPlan);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Patio")).toBeDefined();
    });

    const cloneBtn = screen.getByLabelText("Clone floor plan: Patio");
    await act(async () => {
      fireEvent.click(cloneBtn);
    });

    await waitFor(() => {
      const liveRegion = screen.getByRole("status");
      expect(liveRegion.textContent).toContain('Floor plan "Patio (Copy)" cloned successfully');
    });
  });
});
