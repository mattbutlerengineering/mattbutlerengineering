/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef, @eslint-react/no-array-index-key */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimelineGrid } from "./TimelineGrid.js";
import type { Table, Reservation } from "@mbe/types";

// Mock CSS modules
vi.mock("./TimelineGrid.module.css", () => ({
  default: {
    gridWrapper: "gridWrapper",
    gridWrapperMobile: "gridWrapperMobile",
    headerRow: "headerRow",
    tableColumnHeader: "tableColumnHeader",
    hourHeader: "hourHeader",
    tableRow: "tableRow",
    tableNameCell: "tableNameCell",
    tableName: "tableName",
    tableCapacity: "tableCapacity",
    reservationArea: "reservationArea",
    hourGrid: "hourGrid",
    hourGridLine: "hourGridLine",
    currentTimeIndicator: "currentTimeIndicator",
    currentTimeDot: "currentTimeDot",
    mobileNavHint: "mobileNavHint",
  },
}));

// Mock child components
vi.mock("./ReservationBlock", () => ({
  ReservationBlock: ({
    reservation,
    style,
    isSelected,
    isFocused,
    onClick,
  }: {
    reservation: Reservation;
    style: { left: number; width: number };
    isSelected?: boolean;
    isFocused?: boolean;
    onClick?: () => void;
  }) => (
    <button
      data-testid={`reservation-${reservation.id}`}
      data-selected={isSelected}
      data-focused={isFocused}
      style={{ left: style.left, width: style.width }}
      onClick={onClick}
    >
      {reservation.guestName ?? "Guest"}
    </button>
  ),
}));

vi.mock("../TableStatusBadge.js", () => ({
  TableStatusBadge: ({
    status,
    onClick,
  }: {
    status: string;
    size?: string;
    onClick?: () => void;
  }) => (
    <span data-testid={`status-badge-${status}`} onClick={onClick}>
      {status}
    </span>
  ),
}));

// Mock matchMedia for useIsMobile hook
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "T1",
    capacity: 4,
    minCovers: 2,
    maxCovers: 4,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: null,
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-05-14",
    startTime: "2026-05-14T18:00:00.000Z",
    endTime: "2026-05-14T20:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    venueId: null,
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("TimelineGrid", () => {
  const defaultTables = [
    makeTable({ id: "table-1", name: "Table 1", tableNumber: "T1" }),
    makeTable({
      id: "table-2",
      name: "Table 2",
      tableNumber: "T2",
      minCovers: 4,
      maxCovers: 8,
      capacity: 8,
    }),
  ];

  const defaultReservations = [
    makeReservation({ id: "res-1", tableId: "table-1", guestName: "Jane Doe" }),
    makeReservation({
      id: "res-2",
      tableId: "table-1",
      guestName: "John Smith",
      startTime: "2026-05-14T20:00:00.000Z",
      endTime: "2026-05-14T21:30:00.000Z",
    }),
    makeReservation({
      id: "res-3",
      tableId: "table-2",
      guestName: "Alice Johnson",
      startTime: "2026-05-14T19:00:00.000Z",
      endTime: "2026-05-14T21:00:00.000Z",
    }),
  ];

  const defaultProps = {
    tables: defaultTables,
    reservations: defaultReservations,
    date: "2026-05-14",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset matchMedia to desktop
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  describe("rendering", () => {
    it("renders the grid with correct role and label", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid", { name: "Reservation timeline" });
      expect(grid).toBeDefined();
    });

    it("renders Tables column header", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByText("Tables")).toBeDefined();
    });

    it("renders hour headers with AM/PM format on desktop", () => {
      render(<TimelineGrid {...defaultProps} startHour={11} endHour={14} />);
      expect(screen.getByText("11 AM")).toBeDefined();
      expect(screen.getByText("12 PM")).toBeDefined();
      expect(screen.getByText("1 PM")).toBeDefined();
      expect(screen.getByText("2 PM")).toBeDefined();
    });

    it("renders default hour range (11-23) when not specified", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByText("11 AM")).toBeDefined();
      expect(screen.getByText("12 PM")).toBeDefined();
      expect(screen.getByText("11 PM")).toBeDefined();
    });

    it("renders table rows with table numbers", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByText("T1")).toBeDefined();
      expect(screen.getByText("T2")).toBeDefined();
    });

    it("falls back to table name when tableNumber is null", () => {
      const tables = [makeTable({ id: "table-1", name: "Patio A", tableNumber: null })];
      render(<TimelineGrid {...defaultProps} tables={tables} />);
      expect(screen.getByText("Patio A")).toBeDefined();
    });

    it("renders capacity info on desktop", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByText("2-4 guests")).toBeDefined();
      expect(screen.getByText("4-8 guests")).toBeDefined();
    });

    it("renders table row aria labels", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByRole("row", { name: "Table Table 1" })).toBeDefined();
      expect(screen.getByRole("row", { name: "Table Table 2" })).toBeDefined();
    });

    it("renders reservation blocks for each table", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByTestId("reservation-res-1")).toBeDefined();
      expect(screen.getByTestId("reservation-res-2")).toBeDefined();
      expect(screen.getByTestId("reservation-res-3")).toBeDefined();
    });

    it("renders with empty tables list", () => {
      render(<TimelineGrid {...defaultProps} tables={[]} reservations={[]} />);
      const grid = screen.getByRole("grid", { name: "Reservation timeline" });
      expect(grid).toBeDefined();
      expect(screen.getByText("Tables")).toBeDefined();
    });

    it("renders with tables but no reservations", () => {
      render(<TimelineGrid {...defaultProps} reservations={[]} />);
      expect(screen.getByText("T1")).toBeDefined();
      expect(screen.getByText("T2")).toBeDefined();
      expect(screen.queryByTestId("reservation-res-1")).toBeNull();
    });
  });

  describe("table status badges", () => {
    it("renders a status badge for each table", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getAllByTestId(/status-badge-/)).toHaveLength(2);
    });

    it("cycles table status on click when handler provided", () => {
      const onTableStatusChange = vi.fn();
      render(<TimelineGrid {...defaultProps} onTableStatusChange={onTableStatusChange} />);

      const badges = screen.getAllByTestId("status-badge-AVAILABLE");
      fireEvent.click(badges[0]);

      expect(onTableStatusChange).toHaveBeenCalledWith("table-1", "OCCUPIED");
    });

    it("cycles OCCUPIED to DIRTY", () => {
      const onTableStatusChange = vi.fn();
      const tables = [makeTable({ id: "table-1", status: "OCCUPIED" })];
      render(
        <TimelineGrid {...defaultProps} tables={tables} onTableStatusChange={onTableStatusChange} />
      );

      fireEvent.click(screen.getByTestId("status-badge-OCCUPIED"));
      expect(onTableStatusChange).toHaveBeenCalledWith("table-1", "DIRTY");
    });

    it("cycles DIRTY to AVAILABLE", () => {
      const onTableStatusChange = vi.fn();
      const tables = [makeTable({ id: "table-1", status: "DIRTY" })];
      render(
        <TimelineGrid {...defaultProps} tables={tables} onTableStatusChange={onTableStatusChange} />
      );

      fireEvent.click(screen.getByTestId("status-badge-DIRTY"));
      expect(onTableStatusChange).toHaveBeenCalledWith("table-1", "AVAILABLE");
    });
  });

  describe("reservation selection", () => {
    it("passes selectedReservationId to ReservationBlock", () => {
      render(<TimelineGrid {...defaultProps} selectedReservationId="res-1" />);
      const block = screen.getByTestId("reservation-res-1");
      expect(block.dataset.selected).toBe("true");
    });

    it("marks non-selected reservations as not selected", () => {
      render(<TimelineGrid {...defaultProps} selectedReservationId="res-1" />);
      const block = screen.getByTestId("reservation-res-2");
      expect(block.dataset.selected).toBe("false");
    });

    it("calls onReservationClick when reservation is clicked", () => {
      const onClick = vi.fn();
      render(<TimelineGrid {...defaultProps} onReservationClick={onClick} />);

      fireEvent.click(screen.getByTestId("reservation-res-1"));
      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ id: "res-1", guestName: "Jane Doe" })
      );
    });
  });

  describe("keyboard navigation", () => {
    it("focuses first reservation on ArrowRight when nothing focused", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowRight" });

      const block = screen.getByTestId("reservation-res-1");
      expect(block.dataset.focused).toBe("true");
    });

    it("focuses last reservation on ArrowLeft when nothing focused", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowLeft" });

      const block = screen.getByTestId("reservation-res-3");
      expect(block.dataset.focused).toBe("true");
    });

    it("moves focus right through reservations", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      // Focus first
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      expect(screen.getByTestId("reservation-res-1").dataset.focused).toBe("true");

      // Move right
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      expect(screen.getByTestId("reservation-res-2").dataset.focused).toBe("true");
      expect(screen.getByTestId("reservation-res-1").dataset.focused).toBe("false");
    });

    it("clamps right at last reservation", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      // Focus last via ArrowLeft
      fireEvent.keyDown(grid, { key: "ArrowLeft" });
      // Try to go further right
      fireEvent.keyDown(grid, { key: "ArrowRight" });

      // Should still be on last reservation
      expect(screen.getByTestId("reservation-res-3").dataset.focused).toBe("true");
    });

    it("moves focus left through reservations", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      // Focus first, then move right, then move left back
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      fireEvent.keyDown(grid, { key: "ArrowLeft" });

      expect(screen.getByTestId("reservation-res-1").dataset.focused).toBe("true");
    });

    it("clamps left at first reservation", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowRight" });
      fireEvent.keyDown(grid, { key: "ArrowLeft" });

      expect(screen.getByTestId("reservation-res-1").dataset.focused).toBe("true");
    });

    it("moves focus down to next table row", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      // Focus first reservation on table-1
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      expect(screen.getByTestId("reservation-res-1").dataset.focused).toBe("true");

      // Move down to table-2
      fireEvent.keyDown(grid, { key: "ArrowDown" });
      expect(screen.getByTestId("reservation-res-3").dataset.focused).toBe("true");
    });

    it("moves focus up to previous table row", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      // Focus first, move down, then back up
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      fireEvent.keyDown(grid, { key: "ArrowDown" });
      fireEvent.keyDown(grid, { key: "ArrowUp" });

      // Should be back on table-1 (last reservation on that table)
      expect(screen.getByTestId("reservation-res-2").dataset.focused).toBe("true");
    });

    it("triggers onReservationClick on Enter key", () => {
      const onClick = vi.fn();
      render(<TimelineGrid {...defaultProps} onReservationClick={onClick} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowRight" });
      fireEvent.keyDown(grid, { key: "Enter" });

      expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }));
    });

    it("triggers onReservationClick on Space key", () => {
      const onClick = vi.fn();
      render(<TimelineGrid {...defaultProps} onReservationClick={onClick} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowRight" });
      fireEvent.keyDown(grid, { key: " " });

      expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }));
    });

    it("clears focus on Escape", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowRight" });
      expect(screen.getByTestId("reservation-res-1").dataset.focused).toBe("true");

      fireEvent.keyDown(grid, { key: "Escape" });
      expect(screen.getByTestId("reservation-res-1").dataset.focused).toBe("false");
    });

    it("does nothing on ArrowRight with empty reservations", () => {
      render(<TimelineGrid {...defaultProps} reservations={[]} />);
      const grid = screen.getByRole("grid");
      // Should not throw
      fireEvent.keyDown(grid, { key: "ArrowRight" });
    });
  });

  describe("mobile view", () => {
    beforeEach(() => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    });

    it("renders hour headers without AM/PM on mobile", () => {
      render(<TimelineGrid {...defaultProps} startHour={11} endHour={13} />);
      expect(screen.getByText("11")).toBeDefined();
      expect(screen.getByText("12")).toBeDefined();
      expect(screen.getByText("1")).toBeDefined();
      expect(screen.queryByText("11 AM")).toBeNull();
    });

    it("hides capacity info on mobile", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.queryByText("2-4 guests")).toBeNull();
    });

    it("shows mobile nav hint when tables and reservations exist", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByText("Use arrow keys to navigate reservations")).toBeDefined();
    });

    it("hides mobile nav hint when no reservations", () => {
      render(<TimelineGrid {...defaultProps} reservations={[]} />);
      expect(screen.queryByText("Use arrow keys to navigate reservations")).toBeNull();
    });

    it("applies mobile wrapper class", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");
      expect(grid.className).toContain("gridWrapperMobile");
    });
  });

  describe("current time indicator", () => {
    it("does not render current time indicator for non-today dates", () => {
      render(<TimelineGrid {...defaultProps} date="2020-01-01" />);
      const grid = screen.getByRole("grid");
      const indicator = grid.querySelector(".currentTimeIndicator");
      expect(indicator).toBeNull();
    });
  });

  describe("reservation positioning", () => {
    it("positions reservation blocks with numeric left and width", () => {
      // Use local-time ISO strings so getHours() works regardless of TZ
      const localRes = makeReservation({
        id: "res-pos",
        tableId: "table-1",
        startTime: "2026-05-14T18:00:00",
        endTime: "2026-05-14T20:00:00",
      });
      render(<TimelineGrid {...defaultProps} reservations={[localRes]} startHour={11} />);
      const block = screen.getByTestId("reservation-res-pos");
      // left = ((18*60 - 11*60) / 60) * 120 = 840
      const leftVal = parseFloat(block.style.left);
      expect(leftVal).toBe(840);
      // width = ((120 min / 60) * 120) - 4 = 236
      const widthVal = parseFloat(block.style.width);
      expect(widthVal).toBe(236);
    });
  });
});
