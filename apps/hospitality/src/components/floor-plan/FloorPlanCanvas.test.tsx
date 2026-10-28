import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FloorPlan, Table, TableDisplayStatus } from "@mbe/types";

/* ── Mock react-konva ─────────────────────────────────────────── */

const mockOnClick = vi.fn();

vi.mock("react-konva", () => ({
  Stage: ({
    children,
    width,
    height,
    scaleX,
    scaleY,
    onClick,
    onTap,
  }: {
    children?: React.ReactNode;
    width?: number;
    height?: number;
    scaleX?: number;
    scaleY?: number;
    onClick?: (e: unknown) => void;
    onTap?: (e: unknown) => void;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid="konva-stage"
      data-width={width}
      data-height={height}
      data-scale-x={scaleX}
      data-scale-y={scaleY}
      onClick={(e) => {
        mockOnClick(e);
        // Simulate stage click by calling the passed onClick handler
        // with a mock event that makes e.target === e.target.getStage()
        const fakeStage = { getStage: () => fakeStage };
        onClick?.({ target: fakeStage, currentTarget: null });
        onTap?.({ target: fakeStage, currentTarget: null });
      }}
    >
      {children}
    </div>
  ),
  Layer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="konva-layer">{children}</div>
  ),
}));

/* ── Mock TableShape ──────────────────────────────────────────── */

vi.mock("./TableShape.js", () => ({
  TableShape: ({
    table,
    isSelected,
    isDragging,
    onSelect,
    onDragStart,
    onDragEnd,
    status,
  }: {
    table: Table;
    isSelected: boolean;
    isDragging: boolean;
    onSelect: (id: string) => void;
    onDragStart: (id: string) => void;
    onDragEnd: (id: string, x: number, y: number) => void;
    status?: string;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid={`table-shape-${table.id}`}
      data-selected={isSelected}
      data-dragging={isDragging}
      data-status={status}
      onClick={() => onSelect(table.id)}
      onMouseDown={() => onDragStart(table.id)}
      onMouseUp={() => onDragEnd(table.id, 120, 240)}
    >
      {table.name}
    </div>
  ),
}));

vi.mock("./SectionZone.js", () => ({
  SectionZone: ({
    zone,
    texture,
    labelTheme,
  }: {
    zone: { id: string; name: string };
    texture?: HTMLImageElement;
    labelTheme?: { plate: string; text: string };
  }) => (
    <div
      data-testid={`section-zone-${zone.id}`}
      data-textured={String(Boolean(texture))}
      data-label-plate={labelTheme?.plate}
    >
      {zone.name}
    </div>
  ),
}));

vi.mock("./PlanFloor.js", () => ({
  PlanFloor: ({
    texture,
    width,
    height,
  }: {
    texture?: HTMLImageElement;
    width: number;
    height: number;
  }) => (
    <div
      data-testid="plan-floor"
      data-textured={String(Boolean(texture))}
      data-size={`${width}x${height}`}
    />
  ),
}));

import { FloorPlanCanvas } from "./FloorPlanCanvas.js";

/* ── Fixtures ─────────────────────────────────────────────────── */

const FLOOR_PLAN: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Dining",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

function makeTable(id: string, name: string, overrides: Partial<Table> = {}): Table {
  return {
    id,
    name,
    tableNumber: id.toUpperCase(),
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: "fp-1",
    shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle" },
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const TABLE_A = makeTable("t1", "Table 1");
const TABLE_B = makeTable("t2", "Table 2");

const defaultProps = {
  floorPlan: FLOOR_PLAN,
  tables: [TABLE_A, TABLE_B],
  onTableMove: vi.fn(),
  onTableSelect: vi.fn(),
  selectedTableId: null as string | null,
  readOnly: false,
};

/* ── Tests ────────────────────────────────────────────────────── */

describe("FloorPlanCanvas sections", () => {
  const zone = { id: "s1", name: "Patio", color: "#3366cc", x: 0, y: 0, width: 100, height: 100 };

  it("renders section zones beneath the tables", () => {
    render(<FloorPlanCanvas {...defaultProps} sections={[zone]} />);
    const zoneEl = screen.getByTestId("section-zone-s1");
    const tableEl = screen.getByTestId("table-shape-t1");
    expect(zoneEl.compareDocumentPosition(tableEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders as before when a plan has no sections", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    expect(screen.queryByTestId(/section-zone-/)).toBeNull();
    expect(screen.getByTestId("table-shape-t1")).toBeTruthy();
  });

  it("hands each zone the texture for its own material, and none to a bare zone", async () => {
    const loaded: Record<string, () => void> = {};
    class StubImage {
      onload: (() => void) | null = null;
      set src(value: string) {
        const material = value.split("/").pop()!.replace(".png", "");
        loaded[material] = () => this.onload?.();
      }
    }
    vi.stubGlobal("Image", StubImage);

    render(
      <FloorPlanCanvas
        {...defaultProps}
        sections={[
          { ...zone, floorMaterial: "hardwood" },
          { ...zone, id: "s2", name: "Bar", floorMaterial: null },
        ]}
      />
    );
    expect(screen.getByTestId("section-zone-s1").dataset.textured).toBe("false");

    await act(async () => loaded.hardwood?.());
    expect(screen.getByTestId("section-zone-s1").dataset.textured).toBe("true");
    expect(screen.getByTestId("section-zone-s2").dataset.textured).toBe("false");
    vi.unstubAllGlobals();
  });

  it("still textures a zone under StrictMode, which is how the app renders in dev", async () => {
    // `main.tsx` wraps the app in <StrictMode>, so a dev mount runs
    // effect -> cleanup -> effect. This is the whole dev render path, not just
    // the hook: a texture dropped by that remount is invisible in `pnpm dev`.
    const loaded: Record<string, () => void> = {};
    class StubImage {
      onload: (() => void) | null = null;
      set src(value: string) {
        const material = value.split("/").pop()!.replace(".png", "");
        loaded[material] = () => this.onload?.();
      }
    }
    vi.stubGlobal("Image", StubImage);

    render(
      <StrictMode>
        <FloorPlanCanvas {...defaultProps} sections={[{ ...zone, floorMaterial: "hardwood" }]} />
      </StrictMode>
    );

    await act(async () => loaded.hardwood?.());
    expect(screen.getByTestId("section-zone-s1").dataset.textured).toBe("true");
    vi.unstubAllGlobals();
  });

  it("draws the plan-level floor beneath the sections, textured once its material loads", async () => {
    const loaded: Record<string, () => void> = {};
    class StubImage {
      onload: (() => void) | null = null;
      set src(value: string) {
        const material = value.split("/").pop()!.replace(".png", "");
        loaded[material] = () => this.onload?.();
      }
    }
    vi.stubGlobal("Image", StubImage);

    render(
      <FloorPlanCanvas
        {...defaultProps}
        floorPlan={{
          ...FLOOR_PLAN,
          layoutJson: { width: 1200, height: 800, floorMaterial: "concrete" },
        }}
        sections={[zone]}
      />
    );
    const floor = screen.getByTestId("plan-floor");
    expect(floor.dataset.size).toBe("1200x800");
    expect(floor.dataset.textured).toBe("false");
    expect(
      floor.compareDocumentPosition(screen.getByTestId("section-zone-s1")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await act(async () => loaded.concrete?.());
    expect(screen.getByTestId("plan-floor").dataset.textured).toBe("true");
    vi.unstubAllGlobals();
  });

  it("resolves one label theme for the whole canvas", () => {
    render(<FloorPlanCanvas {...defaultProps} sections={[zone]} />);
    expect(screen.getByTestId("section-zone-s1").dataset.labelPlate).toBeTruthy();
  });
});

describe("FloorPlanCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getBoundingClientRect so container resize logic works
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("render", () => {
    it("renders the floor plan name overlay", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    it("shows (Active) label when floor plan is active", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByText("(Active)")).toBeDefined();
    });

    it("does not show (Active) label when floor plan is not active", () => {
      const inactivePlan = { ...FLOOR_PLAN, isActive: false };
      render(<FloorPlanCanvas {...defaultProps} floorPlan={inactivePlan} />);
      expect(screen.queryByText("(Active)")).toBeNull();
    });

    it("renders the Konva Stage and Layer", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByTestId("konva-stage")).toBeDefined();
      expect(screen.getByTestId("konva-layer")).toBeDefined();
    });

    it("renders a TableShape for each table", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByTestId("table-shape-t1")).toBeDefined();
      expect(screen.getByTestId("table-shape-t2")).toBeDefined();
    });

    it("shows empty state when no tables exist", () => {
      render(<FloorPlanCanvas {...defaultProps} tables={[]} />);
      expect(screen.getByText("No tables on this floor plan")).toBeDefined();
    });

    it("does not show empty state when tables exist", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.queryByText("No tables on this floor plan")).toBeNull();
    });

    it("renders the zoom percentage indicator", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      // Scale = 800 / 800 = 1.0 → 100%
      expect(screen.getByText("100%")).toBeDefined();
    });
  });

  describe("live status threading", () => {
    it("passes each table's status from tableStatuses to its TableShape", () => {
      const tableStatuses = new Map<string, TableDisplayStatus>([
        ["t1", "seated"],
        ["t2", "needs-bussing"],
      ]);
      render(<FloorPlanCanvas {...defaultProps} tableStatuses={tableStatuses} />);

      expect(screen.getByTestId("table-shape-t1").getAttribute("data-status")).toBe("seated");
      expect(screen.getByTestId("table-shape-t2").getAttribute("data-status")).toBe(
        "needs-bussing"
      );
    });

    it("leaves status undefined for a table with no entry in tableStatuses", () => {
      const tableStatuses = new Map<string, TableDisplayStatus>([["t1", "seated"]]);
      render(<FloorPlanCanvas {...defaultProps} tableStatuses={tableStatuses} />);

      expect(screen.getByTestId("table-shape-t2").getAttribute("data-status")).toBeNull();
    });

    it("leaves status undefined for every table when tableStatuses is omitted (no regression to editor-only usage)", () => {
      render(<FloorPlanCanvas {...defaultProps} />);

      expect(screen.getByTestId("table-shape-t1").getAttribute("data-status")).toBeNull();
      expect(screen.getByTestId("table-shape-t2").getAttribute("data-status")).toBeNull();
    });
  });

  describe("click handling", () => {
    it("marks the correct table as selected", () => {
      render(<FloorPlanCanvas {...defaultProps} selectedTableId="t1" />);
      const shape = screen.getByTestId("table-shape-t1");
      expect(shape.getAttribute("data-selected")).toBe("true");
    });

    it("marks non-selected tables as not selected", () => {
      render(<FloorPlanCanvas {...defaultProps} selectedTableId="t1" />);
      const shape = screen.getByTestId("table-shape-t2");
      expect(shape.getAttribute("data-selected")).toBe("false");
    });

    it("calls onTableSelect when a table shape is clicked", () => {
      const onTableSelect = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} onTableSelect={onTableSelect} />);
      fireEvent.click(screen.getByTestId("table-shape-t1"));
      expect(onTableSelect).toHaveBeenCalledWith("t1");
    });

    it("calls onTableSelect(null) when clicking empty stage area", () => {
      const onTableSelect = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} onTableSelect={onTableSelect} />);
      // Click the stage directly (our mock simulates an empty stage click)
      fireEvent.click(screen.getByTestId("konva-stage"));
      expect(onTableSelect).toHaveBeenCalledWith(null);
    });

    it("calls onTableSelect to toggle off when clicking already-selected table", () => {
      const onTableSelect = vi.fn();
      render(
        <FloorPlanCanvas {...defaultProps} selectedTableId="t1" onTableSelect={onTableSelect} />
      );
      fireEvent.click(screen.getByTestId("table-shape-t1"));
      // handleSelect toggles: if tableId === selectedTableId → null
      expect(onTableSelect).toHaveBeenCalledWith(null);
    });
  });

  describe("drag state", () => {
    it("calls onTableMove when a table drag ends", () => {
      const onTableMove = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} onTableMove={onTableMove} />);
      // mousedown = dragStart, mouseup = dragEnd
      fireEvent.mouseDown(screen.getByTestId("table-shape-t1"));
      fireEvent.mouseUp(screen.getByTestId("table-shape-t1"));
      expect(onTableMove).toHaveBeenCalledWith("t1", expect.any(Number), expect.any(Number));
    });

    it("marks table as dragging when drag starts", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      // Drag start tracked by component state; shape gets isDragging=true
      fireEvent.mouseDown(screen.getByTestId("table-shape-t1"));
      const shape = screen.getByTestId("table-shape-t1");
      expect(shape.getAttribute("data-dragging")).toBe("true");
    });

    it("does not call onTableMove when readOnly", () => {
      const onTableMove = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} readOnly={true} onTableMove={onTableMove} />);
      fireEvent.mouseDown(screen.getByTestId("table-shape-t1"));
      fireEvent.mouseUp(screen.getByTestId("table-shape-t1"));
      // readOnly guard in handleDragStart prevents dragging state
      expect(onTableMove).not.toHaveBeenCalled();
    });
  });

  describe("keyboard selection", () => {
    it("calls onTableSelect when a table's keyboard-focusable button is activated", async () => {
      const onTableSelect = vi.fn();
      const user = userEvent.setup();
      render(<FloorPlanCanvas {...defaultProps} onTableSelect={onTableSelect} />);

      const button = screen.getByRole("button", { name: /T1/ });
      button.focus();
      await user.keyboard("{Enter}");

      expect(onTableSelect).toHaveBeenCalledWith("t1");
    });

    it("marks the selected table's keyboard button with aria-pressed", () => {
      render(<FloorPlanCanvas {...defaultProps} selectedTableId="t1" />);
      expect(screen.getByRole("button", { name: /T1/ })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /T2/ })).toHaveAttribute("aria-pressed", "false");
    });

    it("still allows keyboard selection when readOnly, matching existing pointer behavior", async () => {
      const onTableSelect = vi.fn();
      const user = userEvent.setup();
      render(<FloorPlanCanvas {...defaultProps} readOnly onTableSelect={onTableSelect} />);

      const button = screen.getByRole("button", { name: /T1/ });
      button.focus();
      await user.keyboard("{Enter}");

      expect(onTableSelect).toHaveBeenCalledWith("t1");
    });
  });

  describe("staleness indicator", () => {
    it("shows a staleness indicator when isStale is true", () => {
      render(<FloorPlanCanvas {...defaultProps} isStale />);
      expect(screen.getByTestId("floor-plan-stale-indicator")).toBeDefined();
    });

    it("does not show a staleness indicator when isStale is false", () => {
      render(<FloorPlanCanvas {...defaultProps} isStale={false} />);
      expect(screen.queryByTestId("floor-plan-stale-indicator")).toBeNull();
    });

    it("does not show a staleness indicator when isStale is omitted (no regression to editor-only usage)", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.queryByTestId("floor-plan-stale-indicator")).toBeNull();
    });

    it("keeps rendering last-known table statuses while stale", () => {
      const tableStatuses = new Map<string, TableDisplayStatus>([["t1", "seated"]]);
      render(<FloorPlanCanvas {...defaultProps} isStale tableStatuses={tableStatuses} />);

      expect(screen.getByTestId("floor-plan-stale-indicator")).toBeDefined();
      expect(screen.getByTestId("table-shape-t1").getAttribute("data-status")).toBe("seated");
    });
  });

  describe("grid background", () => {
    it("draws the grid using the rialto border token, not a hardcoded hex color", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      const wrapper = screen.getByTestId("floor-plan-canvas-wrapper");
      const backgroundImage = wrapper.style.backgroundImage;
      expect(backgroundImage).toContain("var(--rialto-border)");
      // #f8f6f3 / #d8d4cd were the pre-fix hardcoded light-theme grid colors
      // baked into a data-URI SVG — they never adapted to dark theme.
      expect(backgroundImage).not.toMatch(/#f8f6f3|#d8d4cd/i);
    });
  });

  describe("zoom level", () => {
    it("adjusts zoom level based on container width", () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      render(<FloorPlanCanvas {...defaultProps} />);
      // scale = 400/800 = 0.5 → 50%
      expect(screen.getByText("50%")).toBeDefined();
    });

    it("updates zoom when window resizes", () => {
      const { rerender } = render(<FloorPlanCanvas {...defaultProps} />);
      // First render at 800 → 100%
      expect(screen.getByText("100%")).toBeDefined();

      // Simulate resize to half width
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      fireEvent(window, new Event("resize"));
      rerender(<FloorPlanCanvas {...defaultProps} />);
      // After resize 400/800 = 0.5 → 50%
      expect(screen.getByText("50%")).toBeDefined();
    });
  });
  describe("keyboard manipulation (focus-scoped)", () => {
    const getWrapper = () => screen.getByTestId("floor-plan-canvas-wrapper");

    it("nudges the selected table by one grid step, snapped", () => {
      const onTableMove = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} selectedTableId="t1" onTableMove={onTableMove} />);
      fireEvent.keyDown(getWrapper(), { key: "ArrowRight" });
      expect(onTableMove).toHaveBeenCalledWith("t1", 120, 100);
      fireEvent.keyDown(getWrapper(), { key: "ArrowUp" });
      expect(onTableMove).toHaveBeenCalledWith("t1", 100, 80);
    });

    describe("clamping (x/y are the table centre)", () => {
      const nudge = (
        x: number,
        y: number,
        key: string,
        shape: "rectangle" | "square" | "circle" = "rectangle"
      ) => {
        const onTableMove = vi.fn();
        const size = {
          rectangle: { w: 80, h: 60 },
          square: { w: 60, h: 60 },
          circle: { w: 70, h: 70 },
        }[shape];
        const table = makeTable("t3", "Edge", {
          shapeMetadata: { x, y, width: size.w, height: size.h, shape },
        });
        const { unmount } = render(
          <FloorPlanCanvas
            {...defaultProps}
            tables={[table]}
            selectedTableId="t3"
            onTableMove={onTableMove}
          />
        );
        fireEvent.keyDown(getWrapper(), { key });
        unmount();
        return onTableMove;
      };

      it("a vertical nudge at the right edge does not move x", () => {
        expect(nudge(740, 300, "ArrowUp")).toHaveBeenCalledWith("t3", 740, 280);
      });

      it("a horizontal nudge at the bottom edge does not move y", () => {
        expect(nudge(400, 560, "ArrowLeft")).toHaveBeenCalledWith("t3", 380, 560);
      });

      it("keeps the whole shape on the canvas (centre >= half size)", () => {
        expect(nudge(40, 300, "ArrowLeft")).toHaveBeenCalledWith("t3", 40, 300);
        expect(nudge(760, 300, "ArrowRight")).toHaveBeenCalledWith("t3", 760, 300);
        expect(nudge(400, 30, "ArrowUp")).toHaveBeenCalledWith("t3", 400, 30);
        expect(nudge(400, 570, "ArrowDown")).toHaveBeenCalledWith("t3", 400, 570);
      });

      it("uses the round table's diameter", () => {
        expect(nudge(400, 40, "ArrowUp", "circle")).toHaveBeenCalledWith("t3", 400, 35);
      });
    });

    it("announces the move", () => {
      const onAnnounce = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} selectedTableId="t1" onAnnounce={onAnnounce} />);
      fireEvent.keyDown(getWrapper(), { key: "ArrowDown" });
      expect(onAnnounce).toHaveBeenCalledWith("Table 1 moved to 100, 120");
    });

    it("requests deletion on Delete/Backspace when onDeleteRequest is provided", () => {
      const onDeleteRequest = vi.fn();
      render(
        <FloorPlanCanvas {...defaultProps} selectedTableId="t1" onDeleteRequest={onDeleteRequest} />
      );
      fireEvent.keyDown(getWrapper(), { key: "Delete" });
      fireEvent.keyDown(getWrapper(), { key: "Backspace" });
      expect(onDeleteRequest).toHaveBeenCalledTimes(2);
      expect(onDeleteRequest).toHaveBeenCalledWith("t1");
    });

    it("ignores keys when read-only or nothing is selected", () => {
      const onTableMove = vi.fn();
      const onDeleteRequest = vi.fn();
      const { rerender } = render(
        <FloorPlanCanvas
          {...defaultProps}
          readOnly
          selectedTableId="t1"
          onTableMove={onTableMove}
          onDeleteRequest={onDeleteRequest}
        />
      );
      fireEvent.keyDown(getWrapper(), { key: "ArrowRight" });
      fireEvent.keyDown(getWrapper(), { key: "Delete" });
      rerender(
        <FloorPlanCanvas
          {...defaultProps}
          selectedTableId={null}
          onTableMove={onTableMove}
          onDeleteRequest={onDeleteRequest}
        />
      );
      fireEvent.keyDown(getWrapper(), { key: "ArrowRight" });
      expect(onTableMove).not.toHaveBeenCalled();
      expect(onDeleteRequest).not.toHaveBeenCalled();
    });

    it("does not react to keys pressed outside the canvas (e.g. an open dialog)", () => {
      const onTableMove = vi.fn();
      const onDeleteRequest = vi.fn();
      render(
        <>
          <FloorPlanCanvas
            {...defaultProps}
            selectedTableId="t1"
            onTableMove={onTableMove}
            onDeleteRequest={onDeleteRequest}
          />
          <div role="dialog" aria-label="Add table">
            <button type="button">Shape</button>
          </div>
        </>
      );
      const dialogButton = screen.getByText("Shape");
      fireEvent.keyDown(dialogButton, { key: "ArrowRight" });
      fireEvent.keyDown(dialogButton, { key: "Backspace" });
      fireEvent.keyDown(window, { key: "Delete" });
      expect(onTableMove).not.toHaveBeenCalled();
      expect(onDeleteRequest).not.toHaveBeenCalled();
    });

    it("keeps the canvas focusable and described for assistive tech", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      const wrapper = getWrapper();
      expect(wrapper.getAttribute("tabindex")).toBe("-1");
      expect(wrapper.getAttribute("role")).toBe("group");
      const describedBy = wrapper.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)?.textContent).toMatch(/arrow keys/i);
    });
  });

  // Room templates (#7256) create plans at 1200x800, 1600x1000 and 2000x1200,
  // so the canvas has to read each plan's own size instead of assuming 800x600.
  describe("plans larger than the default canvas", () => {
    const biggerPlan: FloorPlan = { ...FLOOR_PLAN, layoutJson: { width: 1200, height: 800 } };
    const getWrapper = () => screen.getByTestId("floor-plan-canvas-wrapper");

    it("scales to the plan's own width, not the 800px default", () => {
      // Container is 800 wide; a 1200-wide plan therefore renders at 67%.
      render(<FloorPlanCanvas {...defaultProps} floorPlan={biggerPlan} />);
      expect(screen.getByText("67%")).toBeDefined();
    });

    it("gives the stage the plan's own aspect ratio", () => {
      render(<FloorPlanCanvas {...defaultProps} floorPlan={biggerPlan} />);
      const stage = screen.getByTestId("konva-stage");
      // 800 wide at 1200x800 => 800 * (800/1200) = 533 tall, not 600.
      expect(Number(stage.getAttribute("data-width"))).toBe(800);
      expect(Math.round(Number(stage.getAttribute("data-height")))).toBe(533);
    });

    it("re-scales when the plan it is showing changes size", () => {
      const { rerender } = render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByText("100%")).toBeDefined();

      rerender(<FloorPlanCanvas {...defaultProps} floorPlan={biggerPlan} />);
      expect(screen.getByText("67%")).toBeDefined();
    });

    it("lets a nudge reach the far edge of a wider plan", () => {
      const onTableMove = vi.fn();
      const table = makeTable("t4", "Far", {
        shapeMetadata: { x: 1140, y: 400, width: 80, height: 60, shape: "rectangle" },
      });
      render(
        <FloorPlanCanvas
          {...defaultProps}
          floorPlan={biggerPlan}
          tables={[table]}
          selectedTableId="t4"
          onTableMove={onTableMove}
        />
      );

      fireEvent.keyDown(getWrapper(), { key: "ArrowRight" });
      // Clamped to 1200 - 40, not to the default canvas's 800 - 40.
      expect(onTableMove).toHaveBeenCalledWith("t4", 1160, 400);
    });

    it("clamps a nudge by the table's own footprint, not the shape default", () => {
      const onTableMove = vi.fn();
      // A template long table is 140 wide, where SHAPE_DEFAULTS.rectangle is 80.
      const table = makeTable("t5", "Long", {
        shapeMetadata: { x: 1120, y: 400, width: 140, height: 56, shape: "rectangle" },
      });
      render(
        <FloorPlanCanvas
          {...defaultProps}
          floorPlan={biggerPlan}
          tables={[table]}
          selectedTableId="t5"
          onTableMove={onTableMove}
        />
      );

      fireEvent.keyDown(getWrapper(), { key: "ArrowRight" });
      expect(onTableMove).toHaveBeenCalledWith("t5", 1130, 400);
    });
  });
});
