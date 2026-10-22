import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FloorPlan, Table } from "@mbe/types";

/* ── Mock react-router (preserve MemoryRouter/Routes/Route) ─ */

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: vi.fn().mockReturnValue({ state: "unblocked" }),
  };
});

/* ── Mock TQ hooks ────────────────────────────────────────────── */

const mockGetById = vi.fn();
const mockBulkUpdatePositions = vi.fn();
const mockSetActive = vi.fn();
const mockUpdate = vi.fn();
const mockSectionsList = vi.fn();
const mockSectionsUpdate = vi.fn();
const mockTablesCreate = vi.fn();
const mockTablesDelete = vi.fn();

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => ({
    floorPlans: {
      getById: mockGetById,
      bulkUpdatePositions: mockBulkUpdatePositions,
      setActive: mockSetActive,
      update: mockUpdate,
    },
    floorPlanSections: { list: mockSectionsList, update: mockSectionsUpdate },
    tables: {
      create: mockTablesCreate,
      delete: mockTablesDelete,
    },
  })),
}));

vi.mock("../components/floor-plan/WallsPanel.js", () => ({
  WallsPanel: ({
    walls,
    onChange,
  }: {
    walls: { id: string }[];
    onChange: (w: unknown[]) => void;
  }) => (
    <div>
      <span data-testid="wall-count">{walls.length}</span>
      <button
        onClick={() =>
          onChange([...walls, { id: "wall-9", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 8 }])
        }
      >
        Stub add wall
      </button>
    </div>
  ),
}));

/* ── Mock useTableStatuses (SSESyncProvider isn't mounted in these tests) ── */

const mockUseTableStatuses = vi.fn(() => ({
  statuses: new Map<string, string>(),
  isStale: false,
}));

vi.mock("../hooks/useSSESync.js", () => ({
  useTableStatuses: () => mockUseTableStatuses(),
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
    tableStatuses,
    isStale,
    onDeleteRequest,
    sections,
  }: {
    sections?: { id: string; name: string; color: string; floorMaterial?: string | null }[];
    onDeleteRequest?: (id: string) => void;
    tables: Table[];
    onTableMove: (id: string, x: number, y: number) => void;
    onTableSelect: (id: string | null) => void;
    selectedTableId: string | null;
    floorPlan: FloorPlan;
    readOnly?: boolean;
    tableStatuses?: ReadonlyMap<string, string>;
    isStale?: boolean;
  }) => (
    <div
      data-testid="floor-plan-canvas"
      data-selected={selectedTableId}
      data-stale={isStale}
      data-sections={sections?.map((z) => `${z.name}:${z.color}`).join(",")}
      data-materials={sections?.map((z) => z.floorMaterial ?? "").join(",")}
    >
      {/* Stands in for the real canvas's focus-scoped Delete/Backspace handling. */}
      <button
        data-testid="canvas-delete-key"
        onClick={() => selectedTableId && onDeleteRequest?.(selectedTableId)}
      />
      {tables.map((t) => (
        <button
          key={t.id}
          data-testid={`canvas-table-${t.id}`}
          data-status={tableStatuses?.get(t.id)}
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
    onSubmit: (data: {
      name: string;
      capacity: number;
      minCovers: number;
      venueId: string;
      floorPlanId: string;
      shapeMetadata: object;
    }) => Promise<void>;
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
  Heading: ({
    children,
    className: _className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <h1>{children}</h1>,
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

/* ── Mock SectionMaterialPicker ───────────────────────────────── */
// Its own test covers the rialto Select; here we only need the two callbacks
// the page wires up — pick a material, and clear one.

vi.mock("../components/floor-plan/SectionMaterialPicker.js", () => ({
  SectionMaterialPicker: ({
    section,
    onChange,
    disabled,
  }: {
    section: { id: string; name: string; floorMaterial?: string | null };
    onChange: (m: string | null) => void;
    disabled?: boolean;
  }) => (
    <span data-testid={`material-picker-${section.id}`} data-value={section.floorMaterial ?? ""}>
      <button disabled={disabled} onClick={() => onChange("tile")}>
        {`Pick tile for ${section.name}`}
      </button>
      <button disabled={disabled} onClick={() => onChange(null)}>
        {`Clear floor for ${section.name}`}
      </button>
    </span>
  ),
}));

/* ── Mock ErrorRetryBanner ────────────────────────────────────── */

vi.mock("../components/ErrorRetryBanner.js", () => ({
  ErrorRetryBanner: ({ error, onRetry }: { error: string; onRetry: () => void }) => (
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
  shapeMetadata: { x: 100, y: 200, width: 80, height: 60, shape: "rectangle" },
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
  shapeMetadata: { x: 300, y: 200, width: 80, height: 60, shape: "rectangle" },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage(id = "fp-1") {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={[`/floor-plans/${id}`]}>
        <Routes>
          <Route path="/floor-plans/:id" element={<FloorPlanEditorPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  );
}

// Lazy import so mocks are registered first
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FloorPlanEditorPage: (...args: any[]) => React.ReactNode;

beforeEach(async () => {
  vi.clearAllMocks();
  mockUseTableStatuses.mockReturnValue({ statuses: new Map(), isStale: false });
  mockSectionsList.mockResolvedValue([]);
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

      expect(await screen.findByText("Window")).toBeDefined();
      expect(screen.queryByText("Select a table to view details")).toBeNull();
    });

    it("shows capacity range in table details", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      expect(await screen.findByText(/1 - 4 guests/)).toBeDefined();
    });

    it("shows position in table details", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      expect(await screen.findByText(/x: 100, y: 200/)).toBeDefined();
    });

    it("shows Not set when location is null", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_B] });
      renderPage();

      await waitFor(() => screen.getByText("B2"));
      fireEvent.click(screen.getByText("B2"));

      expect(await screen.findByText("Not set")).toBeDefined();
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

    it("saves edited walls into layoutJson, keeping the rest of the layout, and loads existing ones", async () => {
      const existing = { id: "wall-1", x1: 0, y1: 0, x2: 50, y2: 0, thickness: 8 };
      mockGetById.mockResolvedValue({
        ...FLOOR_PLAN,
        layoutJson: { width: 800, height: 600, gridSize: 20, walls: [existing] },
        tables: [],
      });
      mockUpdate.mockResolvedValue(FLOOR_PLAN);
      renderPage();

      await waitFor(() => expect(screen.getByTestId("wall-count").textContent).toBe("1"));
      fireEvent.click(screen.getByText("Stub add wall"));
      expect(screen.getByTestId("wall-count").textContent).toBe("2");
      fireEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
      expect(mockUpdate).toHaveBeenCalledWith("fp-1", {
        layoutJson: {
          width: 800,
          height: 600,
          gridSize: 20,
          walls: [existing, expect.objectContaining({ id: "wall-9" })],
        },
      });
    });

    it("draws saved section zones with their row's name and colour, and lists each with its table count", async () => {
      mockGetById.mockResolvedValue({
        ...FLOOR_PLAN,
        layoutJson: {
          width: 800,
          height: 600,
          sections: [
            { id: "sec-1", x: 0, y: 0, width: 100, height: 100 },
            { id: "gone", x: 0, y: 0, width: 50, height: 50 },
          ],
        },
        tables: [{ ...FLOOR_PLAN.tables![0]!, sectionId: "sec-1" }],
      });
      mockSectionsList.mockResolvedValue([
        { id: "sec-1", venueId: "venue-1", floorPlanId: "fp-1", name: "Patio", color: "#3366cc" },
      ]);
      renderPage();

      await waitFor(() =>
        expect(screen.getByTestId("floor-plan-canvas").dataset.sections).toBe("Patio:#3366cc")
      );
      expect(mockSectionsList).toHaveBeenCalledWith("venue-1", "fp-1");
      expect(screen.getByText("Patio")).toBeDefined();
      expect(screen.getByText("1 table")).toBeDefined();
    });

    it("passes each section's saved floor material through to the canvas", async () => {
      mockGetById.mockResolvedValue({
        ...FLOOR_PLAN,
        layoutJson: {
          width: 800,
          height: 600,
          sections: [{ id: "sec-1", x: 0, y: 0, width: 100, height: 100 }],
        },
      });
      mockSectionsList.mockResolvedValue([
        {
          id: "sec-1",
          venueId: "venue-1",
          floorPlanId: "fp-1",
          name: "Patio",
          color: "#3366cc",
          floorMaterial: "hardwood",
        },
      ]);
      renderPage();

      await waitFor(() =>
        expect(screen.getByTestId("floor-plan-canvas").dataset.materials).toBe("hardwood")
      );
    });

    it("saves a picked material, and clears it again, through the section route", async () => {
      mockGetById.mockResolvedValue({
        ...FLOOR_PLAN,
        layoutJson: {
          width: 800,
          height: 600,
          sections: [{ id: "sec-1", x: 0, y: 0, width: 100, height: 100 }],
        },
      });
      mockSectionsList.mockResolvedValue([
        {
          id: "sec-1",
          venueId: "venue-1",
          floorPlanId: "fp-1",
          name: "Patio",
          color: "#3366cc",
          floorMaterial: null,
        },
      ]);
      // The real route answers with the updated section, not an empty object.
      mockSectionsUpdate.mockImplementation((_venueId, sectionId, data) => ({
        id: sectionId,
        venueId: "venue-1",
        floorPlanId: "fp-1",
        name: "Patio",
        color: "#3366cc",
        displayOrder: 0,
        floorMaterial: data.floorMaterial ?? null,
        createdAt: "2026-10-22T00:00:00.000Z",
        updatedAt: "2026-10-22T00:00:00.000Z",
      }));
      renderPage();

      fireEvent.click(await screen.findByText("Pick tile for Patio"));
      await waitFor(() =>
        expect(mockSectionsUpdate).toHaveBeenCalledWith("venue-1", "sec-1", {
          floorMaterial: "tile",
        })
      );

      fireEvent.click(screen.getByText("Clear floor for Patio"));
      await waitFor(() =>
        expect(mockSectionsUpdate).toHaveBeenLastCalledWith("venue-1", "sec-1", {
          floorMaterial: null,
        })
      );
    });

    it("surfaces a failed material save inline instead of losing it", async () => {
      mockGetById.mockResolvedValue({
        ...FLOOR_PLAN,
        layoutJson: {
          width: 800,
          height: 600,
          sections: [{ id: "sec-1", x: 0, y: 0, width: 100, height: 100 }],
        },
      });
      mockSectionsList.mockResolvedValue([
        {
          id: "sec-1",
          venueId: "venue-1",
          floorPlanId: "fp-1",
          name: "Patio",
          color: "#3366cc",
          floorMaterial: null,
        },
      ]);
      mockSectionsUpdate.mockRejectedValue(new Error("Floor save failed"));
      renderPage();

      fireEvent.click(await screen.findByText("Pick tile for Patio"));
      await waitFor(() => expect(screen.getByText("Floor save failed")).toBeDefined());
      // The editor stays usable — this is an inline banner, not a replaced page.
      expect(screen.getByTestId("floor-plan-canvas")).toBeDefined();
    });

    it("opens add table dialog when + Add Table is clicked", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByText("+ Add Table"));
      fireEvent.click(screen.getByText("+ Add Table"));

      expect(await screen.findByTestId("add-table-dialog")).toBeDefined();
    });

    it("closes add table dialog when Close Dialog is clicked", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      renderPage();

      await waitFor(() => screen.getByText("+ Add Table"));
      fireEvent.click(screen.getByText("+ Add Table"));
      expect(await screen.findByTestId("add-table-dialog")).toBeDefined();

      fireEvent.click(screen.getByText("Close Dialog"));
      await waitFor(() => expect(screen.queryByTestId("add-table-dialog")).toBeNull());
    });

    it("adds new table when dialog submits", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [] });
      const newTable: Table = { ...TABLE_A, id: "new-t", name: "New Table", tableNumber: "NT" };
      mockTablesCreate.mockResolvedValue(newTable);

      renderPage();

      await waitFor(() => screen.getByText("+ Add Table"));
      fireEvent.click(screen.getByText("+ Add Table"));

      fireEvent.click(await screen.findByText("Submit Table"));

      await waitFor(() => {
        expect(mockTablesCreate).toHaveBeenCalledOnce();
      });
    });

    it("deletes table when Delete Table button is clicked and confirmed via the rialto ConfirmDialog", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      mockTablesDelete.mockResolvedValue(undefined);

      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1")); // Select the table

      await waitFor(() => screen.getByText("Delete Table"));
      fireEvent.click(screen.getByText("Delete Table"));

      const dialog = await screen.findByRole("dialog", { name: "Delete this table?" });
      fireEvent.click(within(dialog).getByText("Delete"));

      await waitFor(() => {
        expect(mockTablesDelete).toHaveBeenCalledWith("table-a");
      });
    });

    it("does not delete table when the ConfirmDialog is cancelled", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });

      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      await waitFor(() => screen.getByText("Delete Table"));
      fireEvent.click(screen.getByText("Delete Table"));

      const dialog = await screen.findByRole("dialog", { name: "Delete this table?" });
      fireEvent.click(within(dialog).getByText("Cancel"));

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Delete this table?" })).toBeNull();
      });
      expect(mockTablesDelete).not.toHaveBeenCalled();
    });

    it("uses the rialto ConfirmDialog, never window.confirm, for the Delete Table flow", async () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });

      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      await waitFor(() => screen.getByText("Delete Table"));
      fireEvent.click(screen.getByText("Delete Table"));

      expect(await screen.findByRole("dialog", { name: "Delete this table?" })).toBeDefined();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("shows the rialto ConfirmDialog when the Delete key is pressed with a table selected", async () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });

      renderPage();

      const tableButton = await screen.findByTestId("canvas-table-table-a");
      fireEvent.focus(tableButton); // selects the table via the mocked canvas

      fireEvent.click(screen.getByTestId("canvas-delete-key")); // canvas reports Delete pressed

      expect(await screen.findByRole("dialog", { name: "Delete this table?" })).toBeDefined();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("does not open the delete confirm or nudge when Backspace/Arrow fire with AddTableDialog open (#6387)", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });

      renderPage();

      const tableButton = await screen.findByTestId("canvas-table-table-a");
      fireEvent.focus(tableButton); // selects the table
      fireEvent.click(screen.getByText("+ Add Table"));
      const dialog = await screen.findByTestId("add-table-dialog");

      fireEvent.keyDown(dialog, { key: "Backspace" });
      fireEvent.keyDown(dialog, { key: "Delete" });
      fireEvent.keyDown(dialog, { key: "ArrowRight" });

      expect(screen.queryByRole("dialog", { name: "Delete this table?" })).toBeNull();
      expect(mockFloorPlanCanvasOnTableMove).not.toHaveBeenCalled();
    });

    it("activates floor plan when Set as Active is clicked", async () => {
      const activatedPlan = { ...FLOOR_PLAN, isActive: true };
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: false, tables: [] });
      mockSetActive.mockResolvedValue(activatedPlan);

      renderPage();

      await waitFor(() => screen.getByText("Set as Active"));
      expect(screen.queryByText("Active")).toBeNull();

      // The server now reports the plan as active; the detail query must refetch to show it.
      mockGetById.mockResolvedValue({ ...activatedPlan, tables: [] });
      fireEvent.click(screen.getByText("Set as Active"));

      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledWith("fp-1");
      });
      expect(await screen.findByText("Active")).toBeDefined();
      expect(screen.queryByText("Set as Active")).toBeNull();
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

      renderPage();

      await waitFor(() => screen.getByText("A1"));
      fireEvent.click(screen.getByText("A1"));

      await waitFor(() => screen.getByText("Delete Table"));
      fireEvent.click(screen.getByText("Delete Table"));

      const dialog = await screen.findByRole("dialog", { name: "Delete this table?" });
      fireEvent.click(within(dialog).getByText("Delete"));

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

    it("shows inline error and keeps floor plan visible when bulk position save fails", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      mockBulkUpdatePositions.mockRejectedValue(new Error("Connection refused"));

      renderPage();

      // Wait for the floor plan to load AND the canvas table button to mount. The canvas
      // container renders as soon as the plan loads, but its per-table buttons come from a
      // post-load effect that syncs `tables` into local state — a second commit. Gate on the
      // button itself (findBy retries until mounted), not just the canvas container, or the
      // click can race ahead of that second render and throw non-deterministically.
      const tableButton = await screen.findByTestId("canvas-table-table-a");

      // Trigger a table move to create a pending update
      fireEvent.click(tableButton);

      // Wait for Save Changes button (hasChanges becomes true)
      await waitFor(() => screen.getByText("Save Changes"));

      // Manually trigger save
      fireEvent.click(screen.getByText("Save Changes"));

      // (a) Error must be surfaced to the user
      await waitFor(() => {
        expect(screen.getByText("Connection refused")).toBeDefined();
      });

      // (b) Floor plan canvas must still be visible — layout changes not silently lost
      expect(screen.getByTestId("floor-plan-canvas")).toBeDefined();
      expect(screen.getByTestId("canvas-table-table-a")).toBeDefined();
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
      const { useBlocker } = await import("react-router");
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
      const { useBlocker } = await import("react-router");
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
      const { useBlocker } = await import("react-router");
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

  describe("live status", () => {
    it("threads useTableStatuses' map through to the canvas for each table", async () => {
      mockUseTableStatuses.mockReturnValue({
        statuses: new Map([["table-a", "seated"]]),
        isStale: false,
      });
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      const tableButton = await screen.findByTestId("canvas-table-table-a");
      expect(tableButton.getAttribute("data-status")).toBe("seated");
    });

    it("leaves status undefined for a table with no live status data (no regression)", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      const tableButton = await screen.findByTestId("canvas-table-table-a");
      expect(tableButton.getAttribute("data-status")).toBeNull();
    });

    it("marks the canvas stale when useTableStatuses reports isStale", async () => {
      mockUseTableStatuses.mockReturnValue({ statuses: new Map(), isStale: true });
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      const canvas = await screen.findByTestId("floor-plan-canvas");
      expect(canvas.getAttribute("data-stale")).toBe("true");
    });

    it("does not mark the canvas stale while the SSE connection is live", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      renderPage();

      const canvas = await screen.findByTestId("floor-plan-canvas");
      expect(canvas.getAttribute("data-stale")).toBe("false");
    });
  });

  describe("draft state (#6386)", () => {
    const positionOf = (x: number, y: number) => screen.getByText(`x: ${x}, y: ${y}`);

    async function selectAndMove(tableId: string) {
      const button = await screen.findByTestId(`canvas-table-${tableId}`);
      fireEvent.focus(button);
      fireEvent.click(button); // mocked canvas moves the table to (200, 300)
    }

    it("a failed save rolls back to the last saved positions", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A] });
      mockBulkUpdatePositions.mockRejectedValue(new Error("Connection refused"));
      renderPage();

      await selectAndMove("table-a");
      expect(positionOf(200, 300)).toBeDefined();

      fireEvent.click(await screen.findByText("Save Changes"));
      await screen.findByText("Connection refused");

      expect(positionOf(100, 200)).toBeDefined();
    });

    it("keeps a move made while a save is in flight", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, tables: [TABLE_A, TABLE_B] });
      let resolveSave: () => void = () => {};
      mockBulkUpdatePositions.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = () => {
              // Server now holds the first save's positions.
              mockGetById.mockResolvedValue({
                ...FLOOR_PLAN,
                tables: [
                  { ...TABLE_A, shapeMetadata: { ...TABLE_A.shapeMetadata!, x: 200, y: 300 } },
                  TABLE_B,
                ],
              });
              resolve();
            };
          })
      );
      renderPage();

      await selectAndMove("table-a");
      fireEvent.click(await screen.findByText("Save Changes"));
      await screen.findByText("Saving...");

      await selectAndMove("table-b"); // moved while the save is in flight
      resolveSave();

      await waitFor(() => expect(screen.queryByText("Saving...")).toBeNull());
      expect(screen.getByText("Save Changes")).toBeDefined(); // still dirty
      expect(positionOf(200, 300)).toBeDefined(); // table B still moved
    });

    it("a background refetch does not wipe unsaved moves", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: false, tables: [TABLE_A] });
      mockSetActive.mockResolvedValue({ ...FLOOR_PLAN, isActive: true });
      renderPage();

      await selectAndMove("table-a");
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: true, tables: [TABLE_A] });
      fireEvent.click(await screen.findByText("Set as Active")); // invalidates + refetches
      await screen.findByText("Active");

      expect(positionOf(200, 300)).toBeDefined();
      expect(screen.getByText("Save Changes")).toBeDefined();
    });

    it("a failed set-active does not disable autosave", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: false, tables: [TABLE_A] });
      mockSetActive.mockRejectedValue(new Error("Activate failed"));
      mockBulkUpdatePositions.mockResolvedValue(undefined);
      renderPage();

      fireEvent.click(await screen.findByText("Set as Active"));
      await screen.findByText("Activate failed");

      await selectAndMove("table-a");

      await waitFor(() => expect(mockBulkUpdatePositions).toHaveBeenCalled(), { timeout: 3000 });
    });

    it("retrying from the banner clears a stale action error", async () => {
      mockGetById.mockResolvedValue({ ...FLOOR_PLAN, isActive: false, tables: [] });
      mockSetActive.mockRejectedValue(new Error("Activate failed"));
      renderPage();

      fireEvent.click(await screen.findByText("Set as Active"));
      await screen.findByText("Activate failed");

      fireEvent.click(screen.getByText("Retry"));

      await waitFor(() => expect(screen.queryByText("Activate failed")).toBeNull());
    });
  });
});
