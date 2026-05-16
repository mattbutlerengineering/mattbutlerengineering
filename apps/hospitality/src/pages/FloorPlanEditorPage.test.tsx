import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FloorPlan, Table } from "@mbe/types";

/* ── Mock react-router-dom (preserve MemoryRouter/Routes/Route) ─ */

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: vi.fn().mockReturnValue({ state: "unblocked" }),
  };
});

/* ── Mock @mbe/auth/react ─────────────────────────────────────── */

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "mock-token" }),
}));

/* ── Mock @mbe/api-client ─────────────────────────────────────── */

const mockGetById = vi.fn();
const mockBulkUpdatePositions = vi.fn();
const mockSetActive = vi.fn();
const mockTablesCreate = vi.fn();
const mockTablesDelete = vi.fn();

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn().mockReturnValue({
    floorPlans: {
      getById: mockGetById,
      bulkUpdatePositions: mockBulkUpdatePositions,
      setActive: mockSetActive,
    },
    tables: {
      create: mockTablesCreate,
      delete: mockTablesDelete,
    },
  }),
}));

/* ── Mock floor-plan components ───────────────────────────────── */

const mockFloorPlanCanvasOnTableMove = vi.fn();
const mockFloorPlanCanvasOnTableSelect = vi.fn();

vi.mock("../components/floor-plan/index.js", () => ({
  FloorPlanCanvas: ({
    tables,
    onTableMove,
    onTableSelect,
    selectedTableId,
    floorPlan: _fp,
    readOnly: _ro,
  }: {
    tables: Table[];
    onTableMove: (id: string, x: number, y: number) => void;
    onTableSelect: (id: string | null) => void;
    selectedTableId: string | null;
    floorPlan: FloorPlan;
    readOnly?: boolean;
  }) => (
    <div data-testid="floor-plan-canvas" data-selected={selectedTableId}>
      {tables.map((t) => (
        <button
          key={t.id}
          data-testid={`canvas-table-${t.id}`}
          onClick={() => {
            onTableMove(t.id, 200, 300);
            mockFloorPlanCanvasOnTableMove(t.id, 200, 300);
          }}
          onFocus={() => {
            onTableSelect(t.id);
            mockFloorPlanCanvasOnTableSelect(t.id);
          }}
        >
          {t.name}
        </button>
      ))}
    </div>
  ),
  AddTableDialog: ({
    onSubmit,
    onClose,
    venueId: _venueId,
    floorPlanId: _fpId,
  }: {
    onSubmit: (data: { name: string; capacity: number; minCovers: number; venueId: string; floorPlanId: string; shapeMetadata: object }) => Promise<void>;
    onClose: () => void;
    venueId: string;
    floorPlanId: string;
  }) => (
    <div data-testid="add-table-dialog" role="dialog">
      <button
        onClick={() =>
          onSubmit({
            name: "New Table",
            capacity: 4,
            minCovers: 1,
            venueId: "venue-1",
            floorPlanId: "fp-1",
            shapeMetadata: { x: 400, y: 300, width: 80, height: 60, shape: "rectangle" },
          })
        }
      >
        Submit Table
      </button>
      <button onClick={onClose}>Close Dialog</button>
    </div>
  ),
}));

/* ── Mock Rialto components ───────────────────────────────────── */

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className: _className,
    "aria-label": ariaLabel,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Heading: ({ children, className: _className }: { children: React.ReactNode; className?: string }) => (
    <h1>{children}</h1>
  ),
  Text: ({
    children,
    className: _className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span>{children}</span>,
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
    confirmLabel,
    cancelLabel,
    description: _description,
    variant: _variant,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    description?: string;
    variant?: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button onClick={onCancel}>{cancelLabel ?? "Stay"}</button>
        <button onClick={onConfirm}>{confirmLabel ?? "Leave"}</button>
      </div>
    ) : null,
}));

/* ── Mock ErrorRetryBanner ────────────────────────────────────── */

vi.mock("../components/ErrorRetryBanner.js", () => ({
  ErrorRetryBanner: ({
    error,
    onRetry,
  }: {
    error: string;
    onRetry: () => void;
  }) => (
    <div data-testid="error-retry-banner">
      <span>{error}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

/* ── Fixtures ─────────────────────────────────────────────────── */

const FLOOR_PLAN: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Dining",
  isActive: false,
  layoutJson: { width: 800, height: 600 },
  tables: [],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const TABLE_A: Table = {
  id: "table-a",
  name: "Table A",
  tableNumber: "A1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: "Window",
  isActive: true,
  priority: 0,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: { x: 100, y: 200, width: 80, height: 60, shape: "rect" },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const TABLE_B: Table = {
  id: "table-b",
  name: "Table B",
  tableNumber: "B2",
  capacity: 2,
  minCovers: 1,
  maxCovers: 2,
  location: null,
  isActive: true,
  priority: 1,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: { x: 300, y: 200, width: 80, height: 60, shape: "rect" },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

function renderPage(id = "fp-1") {
  return render(
    <MemoryRouter initialEntries={[`/floor-plans/${id}`]}>
      <Routes>
        <Route path="/floor-plans/:id" element={<FloorPlanEditorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// Lazy import so mocks are registered first
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FloorPlanEditorPage: (...args: any[]) => React.ReactNode;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("./FloorPlanEditorPage.js");
  FloorPlanEditorPage = mod.FloorPlanEditorPage;
});

/* ── Tests ────────────────────────────────────────────────────── */

describe("FloorPlanEditorPage", () => {
  describe("page load", () => {
    it("shows loading spinner initially", () => {
      // Never resolves during this test
      mockGetById.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole("status")).toBeDefined();
    });

    it("renders floor plan name after loading", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Main Dining")).toBeDefined();
      });
    });

    it("renders all tables in the sidebar list", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A, TABLE_B] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("A1")).toBeDefined();
        expect(screen.getByText("B2")).toBeDefined();
      });
    });

    it("shows error banner when API fails", async () => {
      mockGetById.mockRejectedValue(new Error("Network error"));
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("error-retry-banner")).toBeDefined();
        expect(screen.getByText("Network error")).toBeDefined();
      });
    });

    it("retries fetch when retry button is clicked", async () => {
      mockGetById
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("error-retry-banner")).toBeDefined();
      });

      fireEvent.click(screen.getByText("Retry"));

      await waitFor(() => {
        expect(mockGetById).toHaveBeenCalledTimes(2);
      });
    });

    it("shows floor plan not found when floor plan is null", async () => {
      mockGetById.mockRejectedValue(new Error("Floor plan not found"));
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Floor plan not found")).toBeDefined();
      });
    });

    it("shows Active badge when floor plan is active", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: true, tables: [] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Active")).toBeDefined();
      });
    });

    it("shows Set as Active button when floor plan is not active", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: false, tables: [] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Set as Active")).toBeDefined();
      });
    });

    it("renders Add Table button", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("+ Add Table")).toBeDefined();
      });
    });
  });

  describe("table selection", () => {
    it("shows no selection message by default", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Select a table to view details")).toBeDefined();
      });
    });

    it("shows table details when a table is selected from the sidebar", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("A1")).toBeDefined();
      });

      // Click table in the sidebar list
      fireEvent.click(screen.getByText("A1"));

      expect(screen.getByText("Window")).toBeDefined();
      expect(screen.queryByText("Select a table to view details")).toBeNull();
    });

    it("shows capacity range in table details", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      expect(screen.getByText(/1 - 4 guests/)).toBeDefined();
    });

    it("shows position in table details", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      expect(screen.getByText(/x: 100, y: 200/)).toBeDefined();
    });

    it("shows Not set when location is null", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_B] });
      renderPage();

      await waitFor(() => screen.getByText("B2"));
      fireEvent.click(screen.getByText("B2"));

      expect(screen.getByText("Not set")).toBeDefined();
    });
  });

  describe("edit mode", () => {
    it("save button is disabled initially (no changes)", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByText("Saved"));
      const saveButton = screen.getByText("Saved") as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });

    it("opens add table dialog when + Add Table is clicked", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByText("+ Add Table"));
      fireEvent.click(screen.getByText("+ Add Table"));

      expect(screen.getByTestId("add-table-dialog")).toBeDefined();
    });

    it("closes add table dialog when Close Dialog is clicked", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByText("+ Add Table"));
      fireEvent.click(screen.getByText("+ Add Table"));
      expect(screen.getByTestId("add-table-dialog")).toBeDefined();

      fireEvent.click(screen.getByText("Close Dialog"));
      expect(screen.queryByTestId("add-table-dialog")).toBeNull();
    });

    it("adds new table when dialog submits", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      const newTable: Table = { ...TABLE_A, id: "new-t", name: "New Table", tableNumber: "NT" };
      mockTablesCreate.mockResolvedValue(newTable);

      renderPage();

      await waitFor(() => screen.getByText("+ Add Table"));
      fireEvent.click(screen.getByText("+ Add Table"));

      // The mock dialog submits when the Submit Table button is clicked
      fireEvent.click(screen.getByText("Submit Table"));

      await waitFor(() => {
        expect(mockTablesCreate).toHaveBeenCalledOnce();
      });
    });

    it("deletes table when Delete Table button is clicked and confirmed", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      mockTablesDelete.mockResolvedValue(undefined);
      vi.spyOn(window, "confirm").mockReturnValue(true);

      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1")); // Select the table

      await waitFor(() => screen.getByText("Delete Table"));
      fireEvent.click(screen.getByText("Delete Table"));

      await waitFor(() => {
        expect(mockTablesDelete).toHaveBeenCalledWith("table-a");
      });
    });

    it("does not delete table when confirm dialog is cancelled", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      vi.spyOn(window, "confirm").mockReturnValue(false);

      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      await waitFor(() => screen.getByText("Delete Table"));
      fireEvent.click(screen.getByText("Delete Table"));

      expect(mockTablesDelete).not.toHaveBeenCalled();
    });

    it("activates floor plan when Set as Active is clicked", async () => {
      const activatedPlan = { ...FLOOR_PLAN, isActive: true };
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: false, tables: [] });
      mockSetActive.mockResolvedValue(activatedPlan);

      renderPage();

      await waitFor(() => screen.getByText("Set as Active"));
      fireEvent.click(screen.getByText("Set as Active"));

      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledWith("fp-1");
      });
    });

    it("navigates back when back button is clicked", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByLabelText("Back to floor plans"));
      fireEvent.click(screen.getByLabelText("Back to floor plans"));

      expect(mockNavigate).toHaveBeenCalledWith("/floor-plans");
    });

    it("shows table count in sidebar", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A, TABLE_B] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/All Tables \(2\)/)).toBeDefined();
      });
    });

    it("shows error when delete fails", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      mockTablesDelete.mockRejectedValue(new Error("Delete failed"));
      vi.spyOn(window, "confirm").mockReturnValue(true);

      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      await waitFor(() => screen.getByText("Delete Table"));
      fireEvent.click(screen.getByText("Delete Table"));

      await waitFor(() => {
        expect(screen.getByText("Delete failed")).toBeDefined();
      });
    });

    it("shows error when activate fails", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: false, tables: [] });
      mockSetActive.mockRejectedValue(new Error("Activate failed"));

      renderPage();

      await waitFor(() => screen.getByText("Set as Active"));
      fireEvent.click(screen.getByText("Set as Active"));

      await waitFor(() => {
        expect(screen.getByText("Activate failed")).toBeDefined();
      });
    });

    it("shows Save Changes button text when there are pending changes", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      mockBulkUpdatePositions.mockResolvedValue(undefined);
      renderPage();

      await waitFor(() => screen.getByText("A1"));

      // Click canvas table to trigger onTableMove in mock
      fireEvent.click(screen.getByTestId("canvas-table-table-a"));

      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeDefined();
      });
    });

    it("shows Back to Floor Plans button in error state", async () => {
      mockGetById.mockRejectedValue(new Error("Not found"));
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Back to Floor Plans")).toBeDefined();
      });
    });

    it("navigates to floor plans from error state back button", async () => {
      mockGetById.mockRejectedValue(new Error("Not found"));
      renderPage();

      await waitFor(() => screen.getByText("Back to Floor Plans"));
      fireEvent.click(screen.getByText("Back to Floor Plans"));

      expect(mockNavigate).toHaveBeenCalledWith("/floor-plans");
    });
  });

  describe("unsaved changes blocker", () => {
    it("shows unsaved changes dialog when navigation is blocked", async () => {
      const { useBlocker } = await import("react-router-dom");
      const mockBlocker = useBlocker as ReturnType<typeof vi.fn>;
      const mockProceed = vi.fn();
      const mockReset = vi.fn();
      mockBlocker.mockReturnValue({
        state: "blocked",
        proceed: mockProceed,
        reset: mockReset,
      });

      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Unsaved Changes" })).toBeDefined();
      });

      // Reset for other tests
      mockBlocker.mockReturnValue({ state: "unblocked" });
    });

    it("calls blocker.proceed when Leave is clicked", async () => {
      const { useBlocker } = await import("react-router-dom");
      const mockBlocker = useBlocker as ReturnType<typeof vi.fn>;
      const mockProceed = vi.fn();
      const mockReset = vi.fn();
      mockBlocker.mockReturnValue({
        state: "blocked",
        proceed: mockProceed,
        reset: mockReset,
      });

      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByRole("dialog", { name: "Unsaved Changes" }));
      fireEvent.click(screen.getByText("Leave"));

      expect(mockProceed).toHaveBeenCalledOnce();

      // Reset for other tests
      mockBlocker.mockReturnValue({ state: "unblocked" });
    });

    it("calls blocker.reset when Stay is clicked", async () => {
      const { useBlocker } = await import("react-router-dom");
      const mockBlocker = useBlocker as ReturnType<typeof vi.fn>;
      const mockProceed = vi.fn();
      const mockReset = vi.fn();
      mockBlocker.mockReturnValue({
        state: "blocked",
        proceed: mockProceed,
        reset: mockReset,
      });

      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByRole("dialog", { name: "Unsaved Changes" }));
      fireEvent.click(screen.getByText("Stay"));

      expect(mockReset).toHaveBeenCalledOnce();

      // Reset for other tests
      mockBlocker.mockReturnValue({ state: "unblocked" });
    });
  });
});
