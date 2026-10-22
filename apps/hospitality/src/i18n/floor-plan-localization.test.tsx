import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { FloorPlan, Table } from "@mbe/types";
import { localeRuntime } from "./runtime.js";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { TableStatusBadge } from "../components/TableStatusBadge.js";
import { NewFloorPlanDialog } from "../components/floor-plan/NewFloorPlanDialog.js";
import { AddTableDialog } from "../components/floor-plan/AddTableDialog.js";
import { FloorPlanCanvas } from "../components/floor-plan/FloorPlanCanvas.js";
import { TableSelectionOverlay } from "../components/floor-plan/TableSelectionOverlay.js";
import { FloorPlansPage } from "../pages/FloorPlansPage.js";
import { FloorPlanEditorPage } from "../pages/FloorPlanEditorPage.js";

vi.mock("react-konva", () => ({
  Stage: () => <div data-testid="konva-stage" />,
  Layer: () => null,
}));

const FLOOR_PLAN = {
  id: "fp1",
  venueId: "v1",
  name: "Main",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  updatedAt: "2026-01-02T00:00:00.000Z",
  tables: [],
} as unknown as FloorPlan;

const TABLE = {
  id: "t1",
  name: "T1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 2,
  maxCovers: 4,
  location: null,
  isActive: true,
  shapeMetadata: { shape: "square", x: 20, y: 40, width: 50, height: 50 },
} as unknown as Table;

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "v1" }),
}));
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: () => ({ floorPlans: {} }) }));
vi.mock("../hooks/useFloorPlans.js", () => ({
  useFloorPlans: () => ({ data: [FLOOR_PLAN], isLoading: false, error: null, refetch: vi.fn() }),
  useCloneFloorPlan: () => ({ mutateAsync: vi.fn() }),
  useFloorPlan: () => ({ data: FLOOR_PLAN, isLoading: false, error: null, refetch: vi.fn() }),
  useActivateFloorPlan: () => ({ mutateAsync: vi.fn() }),
  useBulkUpdatePositions: () => ({ mutateAsync: vi.fn() }),
  useAddTable: () => ({ mutateAsync: vi.fn() }),
  useDeleteTable: () => ({ mutateAsync: vi.fn() }),
  useUpdateFloorPlanLayout: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useFloorPlanDraft.js", () => ({
  useFloorPlanDraft: () => ({
    tables: [TABLE],
    move: vi.fn(),
    save: vi.fn(),
    addTable: vi.fn(),
    removeTable: vi.fn(),
    dirty: false,
    hasUnsentEdits: false,
    isSaving: false,
    saveFailure: null,
  }),
}));
vi.mock("../hooks/useSSESync.js", () => ({
  useTableStatuses: () => ({ statuses: new Map(), isStale: true }),
}));
vi.mock("react-router", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("react-router")),
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "fp1" }),
  useBlocker: () => ({ state: "unblocked" }),
}));

async function useLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("floor plans in es-MX", () => {
  beforeAll(() => useLocale("es-MX", esMX));

  it("translates the status badge", () => {
    render(<TableStatusBadge status="OCCUPIED" />);
    expect(screen.getByText("Ocupada")).toBeInTheDocument();
  });

  it("translates the new floor plan dialog", () => {
    render(
      <NewFloorPlanDialog venueId="v1" onCreated={vi.fn()} onClose={vi.fn()} onCreate={vi.fn()} />
    );
    expect(screen.getByRole("heading", { name: "Nuevo plano de sala" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar diálogo" })).toBeInTheDocument();
  });

  it("translates the add table dialog", () => {
    render(<AddTableDialog venueId="v1" floorPlanId="fp1" onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Agregar mesa" })).toBeInTheDocument();
    expect(screen.getByText("Cuadrado")).toBeInTheDocument();
  });

  it("translates the canvas and its keyboard overlay", () => {
    render(
      <FloorPlanCanvas
        floorPlan={FLOOR_PLAN}
        tables={[]}
        onTableMove={vi.fn()}
        onTableSelect={vi.fn()}
        selectedTableId={null}
        isStale
      />
    );
    expect(screen.getByRole("group", { name: "Lienzo del plano de sala" })).toBeInTheDocument();
    expect(screen.getByText("No hay mesas en este plano de sala")).toBeInTheDocument();
    expect(
      screen.getByText("Reconectando: mostrando el último estado conocido")
    ).toBeInTheDocument();

    render(
      <TableSelectionOverlay tables={[TABLE]} scale={1} selectedTableId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Mesa 1" })).toBeInTheDocument();
  });

  it("translates the floor plans list page", () => {
    render(
      <MemoryRouter>
        <FloorPlansPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Nuevo plano" })).toBeInTheDocument();
    expect(screen.getByText("0 mesas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clonar plano de sala: Main" })).toBeInTheDocument();
  });

  it("translates the editor page", () => {
    render(
      <MemoryRouter>
        <FloorPlanEditorPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Detalles de la mesa")).toBeInTheDocument();
    expect(screen.getByText("Selecciona una mesa para ver sus detalles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardado" })).toBeInTheDocument();
  });
});

describe("floor plans in fr-CA", () => {
  beforeAll(() => useLocale("fr-CA", frCA));

  it("translates the status badge and dialogs", () => {
    render(<TableStatusBadge status="DIRTY" />);
    expect(screen.getByText("À nettoyer")).toBeInTheDocument();
    render(
      <NewFloorPlanDialog venueId="v1" onCreated={vi.fn()} onClose={vi.fn()} onCreate={vi.fn()} />
    );
    expect(screen.getByRole("heading", { name: "Nouveau plan de salle" })).toBeInTheDocument();
  });
});
