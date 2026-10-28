import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Table } from "@mbe/types";
import { TableSelectionOverlay } from "./TableSelectionOverlay.js";
import type { TableDisplayStatus } from "./table-status.js";

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

describe("TableSelectionOverlay", () => {
  it("renders a keyboard-focusable button for each table", () => {
    render(
      <TableSelectionOverlay
        tables={[TABLE_A, TABLE_B]}
        scale={1}
        selectedTableId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /T1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /T2/ })).toBeInTheDocument();
  });

  it("sizes the hit area to the stored footprint at the current scale (#7847)", () => {
    const wide = makeTable("t3", "Long", {
      shapeMetadata: { x: 100, y: 100, width: 140, height: 60, shape: "rectangle" },
    });
    render(
      <TableSelectionOverlay
        tables={[wide]}
        scale={0.5}
        selectedTableId={null}
        onSelect={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: /T3/ });
    expect(button.style.width).toBe("70px");
    expect(button.style.height).toBe("30px");
  });

  it("falls back to the shape default when no footprint is stored (#7847)", () => {
    const bare = makeTable("t4", "Bare", {
      shapeMetadata: { x: 100, y: 100, shape: "square" } as Table["shapeMetadata"],
    });
    render(
      <TableSelectionOverlay tables={[bare]} scale={1} selectedTableId={null} onSelect={vi.fn()} />
    );
    const button = screen.getByRole("button", { name: /T4/ });
    expect(button.style.width).toBe("60px");
    expect(button.style.height).toBe("60px");
  });

  it("calls onSelect with the table id when a button is activated via keyboard", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <TableSelectionOverlay
        tables={[TABLE_A, TABLE_B]}
        scale={1}
        selectedTableId={null}
        onSelect={onSelect}
      />
    );

    const button = screen.getByRole("button", { name: /T1/ });
    button.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("exposes the selected table's state via aria-pressed", () => {
    render(
      <TableSelectionOverlay
        tables={[TABLE_A, TABLE_B]}
        scale={1}
        selectedTableId="t1"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /T1/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /T2/ })).toHaveAttribute("aria-pressed", "false");
  });

  describe("status in the accessible name (#7844)", () => {
    it("names the status, so the canvas glyph need not be announced", () => {
      render(
        <TableSelectionOverlay
          tables={[TABLE_A, TABLE_B]}
          scale={1}
          selectedTableId={null}
          onSelect={vi.fn()}
          tableStatuses={
            new Map<string, TableDisplayStatus>([
              ["t1", "needs-bussing"],
              ["t2", "reserved-soon"],
            ])
          }
        />
      );
      expect(screen.getByRole("button", { name: "Table T1, Needs bussing" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Table T2, Reserved soon" })).toBeInTheDocument();
    });

    it("names an inactive table as inactive, whatever its status", () => {
      render(
        <TableSelectionOverlay
          tables={[makeTable("t5", "Five", { isActive: false })]}
          scale={1}
          selectedTableId={null}
          onSelect={vi.fn()}
          tableStatuses={new Map<string, TableDisplayStatus>([["t5", "seated"]])}
        />
      );
      expect(screen.getByRole("button", { name: "Table T5, Inactive" })).toBeInTheDocument();
    });

    it("defaults a table missing from the map to available", () => {
      render(
        <TableSelectionOverlay
          tables={[TABLE_A]}
          scale={1}
          selectedTableId={null}
          onSelect={vi.fn()}
          tableStatuses={new Map()}
        />
      );
      expect(screen.getByRole("button", { name: "Table T1, Available" })).toBeInTheDocument();
    });

    it("leaves the name unchanged when no statuses are supplied", () => {
      render(
        <TableSelectionOverlay
          tables={[TABLE_A]}
          scale={1}
          selectedTableId={null}
          onSelect={vi.fn()}
        />
      );
      expect(screen.getByRole("button", { name: "Table T1" })).toBeInTheDocument();
    });
  });

  it("positions each button at the table's scaled canvas coordinates", () => {
    render(
      <TableSelectionOverlay
        tables={[TABLE_A]}
        scale={0.5}
        selectedTableId={null}
        onSelect={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: /T1/ });
    expect(button.style.left).toBe("50px");
    expect(button.style.top).toBe("50px");
  });
});
