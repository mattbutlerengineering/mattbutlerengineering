/* eslint-disable @typescript-eslint/no-explicit-any, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";

// --- Module mocks (hoisted) ---

const { mockGetById, mockBulkUpdatePositions, mockSetActive, mockTablesDelete, mockTablesCreate } =
  vi.hoisted(() => ({
    mockGetById: vi.fn(),
    mockBulkUpdatePositions: vi.fn(),
    mockSetActive: vi.fn(),
    mockTablesDelete: vi.fn(),
    mockTablesCreate: vi.fn(),
  }));

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(() => ({
    floorPlans: {
      getById: mockGetById,
      bulkUpdatePositions: mockBulkUpdatePositions,
      setActive: mockSetActive,
    },
    tables: {
      delete: mockTablesDelete,
      create: mockTablesCreate,
    },
  })),
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(() => ({ accessToken: "test-token" })),
}));

vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual("react-router-dom")),
  useParams: vi.fn(() => ({ id: "fp-1" })),
  useNavigate: vi.fn(() => vi.fn()),
  useBlocker: vi.fn(() => ({ state: "unblocked", proceed: vi.fn(), reset: vi.fn() })),
}));

vi.mock("../components/floor-plan/index.js", () => ({
  AddTableDialog: ({ onClose, onSubmit }: any) => (
    <div data-testid="add-table-dialog">
      <button onClick={onClose}>Cancel</button>
      <button
        onClick={() =>
          onSubmit({
            name: "New Table",
            tableNumber: "T99",
            capacity: 4,
            minCovers: 1,
            venueId: "venue-1",
            floorPlanId: "fp-1",
          })
        }
      >
        Add
      </button>
    </div>
  ),
  FloorPlanCanvas: ({ tables, onTableSelect, onTableMove, selectedTableId }: any) => (
    <div data-testid="floor-plan-canvas">
      {tables.map((t: any) => (
        <div
          key={t.id}
          data-testid={`canvas-table-${t.id}`}
          data-selected={t.id === selectedTableId}
          onClick={() => onTableSelect(t.id)}
        >
          {t.name}
        </div>
      ))}
      <button data-testid="trigger-move" onClick={() => onTableMove("table-1", 200, 300)}>
        Move Table
      </button>
    </div>
  ),
}));

vi.mock("../components/ErrorRetryBanner.js", () => ({
  ErrorRetryBanner: ({ error, onRetry }: any) => (
    <div data-testid="error-banner">
      {error}
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ error, onRetry }: any) => (
    <div data-testid="error-banner">
      {error}
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, onClick, disabled, className, "aria-label": ariaLabel }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Heading: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
  }: any) =>
    open ? (
      <div data-testid="confirm-dialog" role="dialog" aria-label={title}>
        <p>{description}</p>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>{cancelLabel}</button>
      </div>
    ) : null,
}));

vi.mock("./FloorPlanEditorPage.module.css", () => ({
  default: {
    root: "root",
    loadingWrapper: "loadingWrapper",
    spinner: "spinner",
    errorContainer: "errorContainer",
    header: "header",
    headerLeft: "headerLeft",
    headerRight: "headerRight",
    backButton: "backButton",
    backIcon: "backIcon",
    floorPlanTitle: "floorPlanTitle",
    activeBadge: "activeBadge",
    activateButton: "activateButton",
    addTableButton: "addTableButton",
    saveButton: "saveButton",
    saveButtonActive: "saveButtonActive",
    saveButtonDisabled: "saveButtonDisabled",
    content: "content",
    canvasArea: "canvasArea",
    sidebar: "sidebar",
    sidebarTitle: "sidebarTitle",
    detailsStack: "detailsStack",
    detailLabel: "detailLabel",
    detailValue: "detailValue",
    detailValueActive: "detailValueActive",
    detailValueInactive: "detailValueInactive",
    detailValueMono: "detailValueMono",
    deleteTableButton: "deleteTableButton",
    noSelection: "noSelection",
    tableListSection: "tableListSection",
    tableListTitle: "tableListTitle",
    tableListStack: "tableListStack",
    tableListButton: "tableListButton",
    tableListButtonSelected: "tableListButtonSelected",
    backLink: "backLink",
  },
}));

import { FloorPlanEditorPage } from "./FloorPlanEditorPage.js";
import { useNavigate, useBlocker } from "react-router-dom";
import type { FloorPlan, Table } from "@mbe/types";

// --- Test data ---

const makeTable = (id: string, overrides: Partial<Table> = {}): Table => ({
  id,
  name: `Table ${id}`,
  tableNumber: `T${id}`,
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: "Main room",
  isActive: true,
  priority: 1,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeFloorPlan = (overrides: Partial<FloorPlan> = {}): FloorPlan => ({
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Dining",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [makeTable("table-1"), makeTable("table-2")],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

// --- Helpers ---

function renderPage() {
  return render(<FloorPlanEditorPage />);
}

describe("FloorPlanEditorPage", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useBlocker).mockReturnValue({
      state: "unblocked",
      proceed: vi.fn(),
      reset: vi.fn(),
    } as any);
    mockGetById.mockResolvedValue(makeFloorPlan());
    mockBulkUpdatePositions.mockResolvedValue(undefined);
    mockTablesDelete.mockResolvedValue(undefined);
    mockTablesCreate.mockResolvedValue(makeTable("table-new"));
    mockSetActive.mockResolvedValue(makeFloorPlan({ isActive: true }));
  });

  // --- Loading state ---

  it("shows loading spinner initially", () => {
    mockGetById.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    const spinner = document.querySelector('[aria-label="Loading"]');
    expect(spinner).not.toBeNull();
  });

  it("aria-busy is set on loading wrapper", () => {
    mockGetById.mockReturnValue(new Promise(() => {}));
    renderPage();
    const wrapper = document.querySelector('[aria-busy="true"]');
    expect(wrapper).not.toBeNull();
  });

  // --- Error state ---

  it("shows error banner when fetch fails", async () => {
    mockGetById.mockRejectedValue(new Error("Not found"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    expect(screen.getByTestId("error-banner").textContent).toContain("Not found");
  });

  it("retry button re-fetches floor plan", async () => {
    mockGetById.mockRejectedValueOnce(new Error("Network error"));
    mockGetById.mockResolvedValueOnce(makeFloorPlan());
    renderPage();

    await waitFor(() => expect(screen.getByTestId("error-banner")).toBeDefined());

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => expect(screen.getByText("Main Dining")).toBeDefined());
    expect(mockGetById).toHaveBeenCalledTimes(2);
  });

  // --- Loaded state ---

  it("renders floor plan name after loading", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Main Dining")).toBeDefined());
  });

  it("shows Active badge for active floor plan", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Active")).toBeDefined());
  });

  it("does not show Set as Active button for active floor plan", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Main Dining")).toBeDefined());
    expect(screen.queryByText("Set as Active")).toBeNull();
  });

  it("shows Set as Active button for inactive floor plan", async () => {
    mockGetById.mockResolvedValue(makeFloorPlan({ isActive: false }));
    renderPage();
    await waitFor(() => expect(screen.getByText("Set as Active")).toBeDefined());
  });

  it("renders FloorPlanCanvas with tables", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("floor-plan-canvas")).toBeDefined());
    expect(screen.getByTestId("canvas-table-table-1")).toBeDefined();
    expect(screen.getByTestId("canvas-table-table-2")).toBeDefined();
  });

  it("renders table list in sidebar", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("All Tables (2)")).toBeDefined());
  });

  // --- Table selection ---

  it("shows no-selection prompt when no table selected", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Select a table to view details")).toBeDefined());
  });

  it("shows table details when a table is selected via canvas", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("canvas-table-table-1")).toBeDefined());

    fireEvent.click(screen.getByTestId("canvas-table-table-1"));

    // After selection, the sidebar details panel shows Name, Capacity etc.
    // "Delete Table" button only appears when a table is selected
    await waitFor(() => expect(screen.getByText("Delete Table")).toBeDefined());
  });

  it("shows table capacity in details panel", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("canvas-table-table-1")).toBeDefined());

    fireEvent.click(screen.getByTestId("canvas-table-table-1"));

    await waitFor(() => expect(screen.getByText(/1 - 4 guests/)).toBeDefined());
  });

  it("selecting table via sidebar list shows its details", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("All Tables (2)")).toBeDefined());

    // Click the table list button (shows tableNumber or name)
    const listButtons = screen.getAllByRole("button");
    const t1Button = listButtons.find((b) => b.textContent === "Ttable-1");
    expect(t1Button).toBeDefined();
    fireEvent.click(t1Button!);

    // After selection, Delete Table button appears in sidebar details
    await waitFor(() => expect(screen.getByText("Delete Table")).toBeDefined());
  });

  // --- Table move / unsaved changes ---

  it("marks has-changes after table move", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("floor-plan-canvas")).toBeDefined());

    fireEvent.click(screen.getByTestId("trigger-move"));

    await waitFor(() => {
      const saveBtn = screen.getByText("Save Changes");
      expect(saveBtn).toBeDefined();
    });
  });

  it("save button is disabled when no changes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Saved")).toBeDefined());
    const savedBtn = screen.getByText("Saved").closest("button");
    expect(savedBtn?.disabled).toBe(true);
  });

  // --- Add table dialog ---

  it("opens Add Table dialog when + Add Table is clicked", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("+ Add Table")).toBeDefined());

    fireEvent.click(screen.getByText("+ Add Table"));

    expect(screen.getByTestId("add-table-dialog")).toBeDefined();
  });

  it("closes Add Table dialog when cancel is clicked", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("+ Add Table")).toBeDefined());

    fireEvent.click(screen.getByText("+ Add Table"));
    expect(screen.getByTestId("add-table-dialog")).toBeDefined();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("add-table-dialog")).toBeNull();
  });

  it("adds new table to list after dialog submit", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("All Tables (2)")).toBeDefined());

    fireEvent.click(screen.getByText("+ Add Table"));

    await act(async () => {
      fireEvent.click(screen.getByText("Add"));
    });

    await waitFor(() => expect(screen.getByText("All Tables (3)")).toBeDefined());
  });

  // --- Activate ---

  it("calls setActive API when Set as Active is clicked", async () => {
    const inactivePlan = makeFloorPlan({ isActive: false });
    const activatedPlan = makeFloorPlan({ isActive: true });
    mockGetById.mockResolvedValue(inactivePlan);
    mockSetActive.mockResolvedValue(activatedPlan);

    renderPage();
    await waitFor(() => expect(screen.getByText("Set as Active")).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText("Set as Active"));
    });

    expect(mockSetActive).toHaveBeenCalledWith("fp-1");
  });

  // --- Delete table ---

  it("calls delete API when Delete Table button is clicked and confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByTestId("canvas-table-table-1")).toBeDefined());

    // Select the table first
    fireEvent.click(screen.getByTestId("canvas-table-table-1"));

    await waitFor(() => expect(screen.getByText("Delete Table")).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText("Delete Table"));
    });

    expect(mockTablesDelete).toHaveBeenCalledWith("table-1");
  });

  it("does not delete table when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPage();
    await waitFor(() => expect(screen.getByTestId("canvas-table-table-1")).toBeDefined());

    fireEvent.click(screen.getByTestId("canvas-table-table-1"));
    await waitFor(() => expect(screen.getByText("Delete Table")).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText("Delete Table"));
    });

    expect(mockTablesDelete).not.toHaveBeenCalled();
  });

  it("removes table from list after successful delete", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByText("All Tables (2)")).toBeDefined());

    fireEvent.click(screen.getByTestId("canvas-table-table-1"));
    await waitFor(() => expect(screen.getByText("Delete Table")).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText("Delete Table"));
    });

    await waitFor(() => expect(screen.getByText("All Tables (1)")).toBeDefined());
  });

  // --- Navigation blocker ---

  it("shows confirm dialog when blocker is in blocked state", async () => {
    vi.mocked(useBlocker).mockReturnValue({
      state: "blocked",
      proceed: vi.fn(),
      reset: vi.fn(),
    } as any);

    renderPage();
    await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeDefined());
    // Dialog has aria-label="Unsaved Changes" and shows description text
    expect(
      screen.getByText(
        "You have unsaved changes to this floor plan. Are you sure you want to leave?"
      )
    ).toBeDefined();
  });

  it("calls blocker.proceed when Leave is clicked", async () => {
    const mockProceed = vi.fn();
    vi.mocked(useBlocker).mockReturnValue({
      state: "blocked",
      proceed: mockProceed,
      reset: vi.fn(),
    } as any);

    renderPage();
    await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeDefined());

    fireEvent.click(screen.getByText("Leave"));
    expect(mockProceed).toHaveBeenCalled();
  });

  it("calls blocker.reset when Stay is clicked", async () => {
    const mockReset = vi.fn();
    vi.mocked(useBlocker).mockReturnValue({
      state: "blocked",
      proceed: vi.fn(),
      reset: mockReset,
    } as any);

    renderPage();
    await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeDefined());

    fireEvent.click(screen.getByText("Stay"));
    expect(mockReset).toHaveBeenCalled();
  });

  // --- Back navigation ---

  it("navigates back to /floor-plans when back button is clicked", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Main Dining")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Back to floor plans" }));
    expect(mockNavigate).toHaveBeenCalledWith("/floor-plans");
  });

  // --- Save error / rollback ---

  it("shows error banner when bulk save fails", async () => {
    mockBulkUpdatePositions.mockRejectedValue(new Error("Save failed"));

    renderPage();
    await waitFor(() => expect(screen.getByTestId("floor-plan-canvas")).toBeDefined());

    // Trigger a table move to create pending updates
    fireEvent.click(screen.getByTestId("trigger-move"));

    // Click Save Changes button directly
    await waitFor(() => expect(screen.getByText("Save Changes")).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText("Save Changes"));
    });

    await waitFor(() => expect(screen.getByTestId("error-banner")).toBeDefined());
  });
});
