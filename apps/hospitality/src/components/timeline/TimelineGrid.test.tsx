import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TimelineGrid } from "./TimelineGrid.js";
import { localDateString } from "../../utils/local-clock.js";
import type { Table, Reservation, TableStatus } from "@mbe/types";

// Mock CSS modules
vi.mock("./TimelineGrid.module.css", () => ({
  default: {
    gridFrame: "gridFrame",
    gridWrapper: "gridWrapper",
    gridWrapperMobile: "gridWrapperMobile",
    headerRow: "headerRow",
    tableColumnHeader: "tableColumnHeader",
    hourHeader: "hourHeader",
    tableRow: "tableRow",
    tableNameCell: "tableNameCell",
    tableMeta: "tableMeta",
    tableNameLine: "tableNameLine",
    tableName: "tableName",
    tableCapacity: "tableCapacity",
    reservationArea: "reservationArea",
    hourGrid: "hourGrid",
    hourGridLine: "hourGridLine",
    hourGridLineActive: "hourGridLineActive",
    currentTimeIndicator: "currentTimeIndicator",
    currentTimeDot: "currentTimeDot",
    currentTimeLabel: "currentTimeLabel",
    mobileNavHint: "mobileNavHint",
  },
}));

vi.mock("./ReservationBlock", () => ({
  ReservationBlock: ({
    reservation,
    style,
    isSelected,
    isFocused,
    isSeated,
    onClick,
  }: {
    reservation: Reservation;
    style: { left: number; width: number };
    isSelected?: boolean;
    isFocused?: boolean;
    isSeated?: boolean;
    onClick?: (reservation: Reservation) => void;
  }) => (
    <button
      data-testid={`reservation-${reservation.id}`}
      data-selected={isSelected}
      data-focused={isFocused}
      data-seated={isSeated}
      style={{ left: style.left, width: style.width }}
      onClick={() => onClick?.(reservation)}
    >
      {reservation.guestName ?? "Guest"}
    </button>
  ),
}));

// The menu owns the transitions (item 14); the grid only wires it up, so the mock
// exposes exactly what the grid hands it: id, name, status, pending, onChange(next).
vi.mock("./TableStatusMenu.js", () => ({
  TableStatusMenu: ({
    tableId,
    tableName,
    status,
    pending,
    onChange,
  }: {
    tableId: string;
    tableName: string;
    status: TableStatus;
    pending?: boolean;
    onChange: (next: TableStatus) => void;
  }) => (
    <div>
      <button
        type="button"
        data-testid={`table-status-${tableId}`}
        data-pending={pending ? "true" : "false"}
        aria-haspopup="menu"
      >
        {tableName}: {status}. Change status
      </button>
      <button
        type="button"
        data-testid={`table-status-item-${tableId}`}
        onClick={() => onChange("DIRTY")}
      >
        Mark dirty
      </button>
    </div>
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

  describe("table status menu", () => {
    it("renders a status trigger for each table, named by the row's table name", () => {
      render(<TimelineGrid {...defaultProps} onTableStatusChange={vi.fn()} />);
      expect(screen.getByTestId("table-status-table-1")).toHaveTextContent(
        "Table 1: AVAILABLE. Change status"
      );
      expect(screen.getByTestId("table-status-table-2")).toHaveTextContent(
        "Table 2: AVAILABLE. Change status"
      );
      expect(screen.queryByTestId(/status-badge-/)).toBeNull();
    });

    it("forwards the menu's chosen status as onTableStatusChange(tableId, next)", () => {
      const onTableStatusChange = vi.fn();
      render(<TimelineGrid {...defaultProps} onTableStatusChange={onTableStatusChange} />);

      fireEvent.click(screen.getByTestId("table-status-item-table-2"));

      expect(onTableStatusChange).toHaveBeenCalledTimes(1);
      expect(onTableStatusChange).toHaveBeenCalledWith("table-2", "DIRTY");
    });

    it("does not pick the next status itself — the menu does", () => {
      const onTableStatusChange = vi.fn();
      render(<TimelineGrid {...defaultProps} onTableStatusChange={onTableStatusChange} />);

      fireEvent.click(screen.getByTestId("table-status-table-1"));

      expect(onTableStatusChange).not.toHaveBeenCalled();
    });

    it("marks only the pending table's trigger as pending", () => {
      render(
        <TimelineGrid {...defaultProps} onTableStatusChange={vi.fn()} pendingTableId="table-2" />
      );
      expect(screen.getByTestId("table-status-table-1")).toHaveAttribute("data-pending", "false");
      expect(screen.getByTestId("table-status-table-2")).toHaveAttribute("data-pending", "true");
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

    it("prevents default on Space so the page does not scroll", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowRight" });
      const notCancelled = fireEvent.keyDown(grid, { key: " " });

      // fireEvent returns false when preventDefault() was called on a cancelable event
      expect(notCancelled).toBe(false);
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

  describe("active cell focus ring", () => {
    it("marks the initial cell (0, 0) as active", () => {
      render(<TimelineGrid {...defaultProps} />);
      const cell = screen.getByTestId("grid-cell-0-0");
      expect(cell.className).toContain("hourGridLineActive");
    });

    it("moves the focus ring right on ArrowRight", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowRight" });

      expect(screen.getByTestId("grid-cell-0-1").className).toContain("hourGridLineActive");
      expect(screen.getByTestId("grid-cell-0-0").className).not.toContain("hourGridLineActive");
    });

    it("moves the focus ring down to the next table row on ArrowDown", () => {
      render(<TimelineGrid {...defaultProps} />);
      const grid = screen.getByRole("grid");

      fireEvent.keyDown(grid, { key: "ArrowDown" });

      expect(screen.getByTestId("grid-cell-1-0").className).toContain("hourGridLineActive");
      expect(screen.getByTestId("grid-cell-0-0").className).not.toContain("hourGridLineActive");
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

  describe("now-line", () => {
    // Local wall-clock: P01 fixes the clock at 20:00 / 14:00 local, and the sweep walks
    // every service hour. `date` is the browser-local day of that clock (ux.md decision (a)).
    function atLocal(hour: number, minute = 0) {
      const now = new Date(2026, 4, 14, hour, minute, 0, 0);
      vi.setSystemTime(now);
      return { now, today: localDateString(now) };
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders the now-line at 20:00 local on today's date", () => {
      const { today } = atLocal(20);
      render(<TimelineGrid {...defaultProps} date={today} />);
      const line = screen.getByTestId("now-line");
      // left = tableColumn (120) + ((20 - 11) * 60 / 60) * 120 = 1200
      expect(parseFloat(line.style.left)).toBe(1200);
    });

    it("renders the now-line at 14:00 local on today's date", () => {
      const { today } = atLocal(14);
      render(<TimelineGrid {...defaultProps} date={today} />);
      expect(parseFloat(screen.getByTestId("now-line").style.left)).toBe(120 + 3 * 120);
    });

    it.each([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])(
      "renders the now-line for local hour %i and keeps it inside the grid width",
      (hour) => {
        const { today } = atLocal(hour, 30);
        render(<TimelineGrid {...defaultProps} date={today} />);
        const line = screen.getByTestId("now-line");
        const left = parseFloat(line.style.left);
        expect(left).toBeGreaterThanOrEqual(120);
        // 13 hour columns (11..23) × 120 + the 120 table column
        expect(left).toBeLessThan(120 + 13 * 120);
      }
    );

    it("labels the now-line with the local clock time, hidden from assistive tech", () => {
      const { now, today } = atLocal(20, 4);
      render(<TimelineGrid {...defaultProps} date={today} />);
      const line = screen.getByTestId("now-line");
      const label = line.querySelector("[aria-hidden='true']");
      expect(label).not.toBeNull();
      expect(label).toHaveTextContent(
        now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      );
    });

    it("does not render the now-line for another date, even at 20:00 local", () => {
      atLocal(20);
      render(<TimelineGrid {...defaultProps} date="2020-01-01" />);
      expect(screen.queryByTestId("now-line")).toBeNull();
      expect(screen.getByRole("grid").querySelector(".currentTimeIndicator")).toBeNull();
    });

    it("does not render the now-line outside service hours", () => {
      const { today } = atLocal(9);
      render(<TimelineGrid {...defaultProps} date={today} />);
      expect(screen.queryByTestId("now-line")).toBeNull();
    });

    it("scrolls the grid so the now-line sits a quarter of the way across on mount (A5.1)", () => {
      const { today } = atLocal(20);
      const scrollTo = vi.fn();
      Object.defineProperty(HTMLElement.prototype, "scrollTo", {
        value: scrollTo,
        configurable: true,
      });
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        value: 800,
        configurable: true,
      });
      try {
        render(<TimelineGrid {...defaultProps} date={today} />);
        // left = 120 + 1080 - 800 * 0.25 = 1000
        expect(scrollTo).toHaveBeenCalledWith({ left: 1000, behavior: expect.any(String) });
      } finally {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
      }
    });

    it("paints the now-line and its dot with the accent token, never the error token (xcut G)", () => {
      const css = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "TimelineGrid.module.css"),
        "utf8"
      );
      const block = (name: string) => {
        const match = css.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`));
        expect(match, `.${name} block`).not.toBeNull();
        return match?.[0] ?? "";
      };
      for (const name of ["currentTimeIndicator", "currentTimeDot"]) {
        expect(block(name)).toContain("var(--rialto-accent)");
        expect(block(name)).not.toContain("--rialto-error");
      }
    });
  });

  describe("table status menu stacking (browser-found, item 16)", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "TimelineGrid.module.css"),
      "utf8"
    );

    it("raises the open row's sticky cell above the rows after it", () => {
      expect(css).toMatch(/\.tableNameCell:has\(\[aria-expanded="true"\]\)\s*\{[^}]*z-index:\s*11/);
    });

    it("gives the scroller room for the last row's open menu", () => {
      expect(css).toMatch(/\.gridWrapper:has\(\[role="menu"\]\)\s*\{[^}]*padding-block-end/);
    });
  });

  describe("seated blocks", () => {
    it("marks a block seated when its id is in seatedIds", () => {
      render(<TimelineGrid {...defaultProps} seatedIds={new Set(["res-1"])} />);
      expect(screen.getByTestId("reservation-res-1")).toHaveAttribute("data-seated", "true");
      expect(screen.getByTestId("reservation-res-2")).toHaveAttribute("data-seated", "false");
      expect(screen.getByTestId("reservation-res-3")).toHaveAttribute("data-seated", "false");
    });

    it("marks nothing seated when seatedIds is absent", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByTestId("reservation-res-1")).toHaveAttribute("data-seated", "false");
    });
  });

  describe("empty night", () => {
    const emptyNight = (variant: "today" | "otherDate") => ({
      variant,
      dateLabel: "Thursday, May 14",
      onWalkIn: vi.fn(),
      onToday: vi.fn(),
    });

    it("overlays the quiet-night card while keeping every table row rendered (P02)", () => {
      render(<TimelineGrid {...defaultProps} reservations={[]} emptyNight={emptyNight("today")} />);
      const overlay = screen.getByTestId("timeline-empty-night");
      expect(overlay).toHaveTextContent("Quiet so far.");
      expect(screen.getByTestId("table-row-table-1")).toBeInTheDocument();
      expect(screen.getByTestId("table-row-table-2")).toBeInTheDocument();
      // Beside the grid, not inside it: role="grid" admits only rows, and the scroller
      // would carry the card away with the now-line scroll.
      const grid = screen.getByRole("grid");
      expect(grid).not.toContainElement(overlay);
      expect(overlay.closest(".gridFrame")).toBe(grid.parentElement);
    });

    it("offers Walk-in tonight and Back to today on another date", () => {
      const tonight = emptyNight("today");
      const { unmount } = render(
        <TimelineGrid {...defaultProps} reservations={[]} emptyNight={tonight} />
      );
      fireEvent.click(
        within(screen.getByTestId("timeline-empty-night")).getByRole("button", {
          name: "Walk-in",
        })
      );
      expect(tonight.onWalkIn).toHaveBeenCalledTimes(1);
      unmount();

      const other = emptyNight("otherDate");
      render(
        <TimelineGrid {...defaultProps} reservations={[]} date="2026-05-20" emptyNight={other} />
      );
      fireEvent.click(
        within(screen.getByTestId("timeline-empty-night")).getByRole("button", {
          name: "Back to today",
        })
      );
      expect(other.onToday).toHaveBeenCalledTimes(1);
    });

    it("renders no overlay when emptyNight is null even with zero reservations", () => {
      render(<TimelineGrid {...defaultProps} reservations={[]} emptyNight={null} />);
      expect(screen.queryByTestId("timeline-empty-night")).toBeNull();
    });
  });

  describe("bottom inset", () => {
    it("reserves the sheet's height as scroll padding so a scrolled-to block clears it", () => {
      render(<TimelineGrid {...defaultProps} bottomInset={240} />);
      expect(screen.getByRole("grid").style.scrollPaddingBlockEnd).toBe("240px");
    });

    it("reserves nothing when no sheet is open", () => {
      render(<TimelineGrid {...defaultProps} />);
      expect(screen.getByRole("grid").style.scrollPaddingBlockEnd).toBe("");
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
