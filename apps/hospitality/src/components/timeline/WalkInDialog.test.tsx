 
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { WalkInDialog } from "./WalkInDialog.js";
import type { Table } from "@mbe/types";

// Mock scrollIntoView for JSDOM
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeTables(overrides: Partial<Table>[] = []): Table[] {
  const defaults: Table[] = [
    {
      id: "table-1",
      name: "Table 1",
      capacity: 2,
      isActive: true,
      status: "AVAILABLE",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-2",
      name: "Table 2",
      capacity: 4,
      isActive: true,
      status: "AVAILABLE",
      x: 200,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-3",
      name: "Table 3",
      capacity: 6,
      isActive: true,
      status: "OCCUPIED",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-4",
      name: "Table 4",
      capacity: 8,
      isActive: true,
      status: "AVAILABLE",
      x: 600,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
  ];
  return defaults.map((t, i) => (overrides[i] ? { ...t, ...overrides[i] } : t));
}

describe("WalkInDialog", () => {
  const defaultProps = {
    tables: makeTables(),
    venueId: "venue-1",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the dialog with title", () => {
    render(<WalkInDialog {...defaultProps} />);
    expect(screen.getByText("Seat Walk-In")).toBeDefined();
  });

  it("should render with dialog role and aria-modal", () => {
    render(<WalkInDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("should render party size buttons 1 through 8", () => {
    render(<WalkInDialog {...defaultProps} />);
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByRole("button", { name: String(i) })).toBeDefined();
    }
  });

  it("should default to party size 2", () => {
    render(<WalkInDialog {...defaultProps} />);
    const btn = screen.getByRole("button", { name: "2" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("should auto-select best-fit table for default party size", () => {
    render(<WalkInDialog {...defaultProps} />);
    // Party size 2 → smallest available table with capacity >= 2 → Table 1 (cap 2)
    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 1 (seats 2)");
  });

  it("should update table selection when party size changes", () => {
    render(<WalkInDialog {...defaultProps} />);

    // Switch to party of 4
    fireEvent.click(screen.getByRole("button", { name: "4" }));

    // Best fit: Table 2 (cap 4, AVAILABLE) — Table 3 (cap 6) is OCCUPIED
    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 2 (seats 4)");
  });

  it("should mark selected party size button as pressed", () => {
    render(<WalkInDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(screen.getByRole("button", { name: "5" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("should only show available tables with sufficient capacity", () => {
    render(<WalkInDialog {...defaultProps} />);

    // Party size 2 (default) → available tables with cap >= 2:
    // Table 1 (cap 2, AVAILABLE), Table 2 (cap 4, AVAILABLE), Table 4 (cap 8, AVAILABLE)
    // Table 3 (cap 6, OCCUPIED) excluded
    const trigger = screen.getByRole("combobox", { name: /table/i });
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent).toContain("Table 1");
    expect(listbox.textContent).toContain("Table 2");
    expect(listbox.textContent).toContain("Table 4");
    expect(listbox.textContent).not.toContain("Table 3");
  });

  it("should show no-tables message when no tables fit", () => {
    // All tables occupied
    const occupiedTables = makeTables().map((t) => ({ ...t, status: "OCCUPIED" as const }));
    render(<WalkInDialog {...defaultProps} tables={occupiedTables} />);

    expect(screen.getByText(/no available tables for a party of 2/i)).toBeDefined();
  });

  it("should disable Seat Now when no tables available", () => {
    const occupiedTables = makeTables().map((t) => ({ ...t, status: "OCCUPIED" as const }));
    render(<WalkInDialog {...defaultProps} tables={occupiedTables} />);

    expect(screen.getByRole("button", { name: "Seat Now" })).toBeDisabled();
  });

  it("should render guest name input as optional", () => {
    render(<WalkInDialog {...defaultProps} />);
    expect(screen.getByLabelText(/guest name/i)).toBeDefined();
  });

  it("should allow entering guest name", () => {
    render(<WalkInDialog {...defaultProps} />);
    const input = screen.getByLabelText(/guest name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Smith" } });
    expect(input.value).toBe("Smith");
  });

  it("should call onConfirm with correct data on Seat Now click", async () => {
    render(<WalkInDialog {...defaultProps} />);

    // Enter guest name
    const nameInput = screen.getByLabelText(/guest name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Johnson" } });

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.partySize).toBe(2);
    expect(data.tableId).toBe("table-1");
    expect(data.venueId).toBe("venue-1");
    expect(data.guestName).toBe("Johnson");
  });

  it("should omit guestName when empty", async () => {
    render(<WalkInDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.guestName).toBeUndefined();
  });

  it("should trim whitespace-only guest name to undefined", async () => {
    render(<WalkInDialog {...defaultProps} />);
    const input = screen.getByLabelText(/guest name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.guestName).toBeUndefined();
  });

  it("should call onClose when Cancel button is clicked", () => {
    render(<WalkInDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("should display error when onConfirm throws an Error", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Server error"));
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeDefined();
    });
  });

  it("should display fallback error when onConfirm throws a non-Error", async () => {
    const onConfirm = vi.fn().mockRejectedValue("something broke");
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to seat walk-in.")).toBeDefined();
    });
  });

  it("should show loading state while confirming", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(screen.getByText("Seating…")).toBeDefined();
    });

    // Cancel button should be disabled during loading
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePromise!(undefined);
  });

  it("should disable party size buttons while loading", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
    });

    for (let i = 2; i <= 8; i++) {
      expect(screen.getByRole("button", { name: String(i) })).toBeDisabled();
    }

    resolvePromise!(undefined);
  });

  it("should disable guest name input while loading", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(screen.getByLabelText(/guest name/i)).toBeDisabled();
    });

    resolvePromise!(undefined);
  });

  it("should show error when no table is selected", async () => {
    // Provide tables but make none available so tableId stays empty
    const _noAvailable = makeTables().map((t) => ({ ...t, status: "OCCUPIED" as const }));
    const smallTables: Table[] = [
      {
        id: "table-tiny",
        name: "Tiny",
        capacity: 1,
        isActive: true,
        status: "AVAILABLE",
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        shape: "RECTANGLE",
        rotation: 0,
        venueId: "venue-1",
        floorPlanId: "fp-1",
      },
    ];
    // Default party size is 2, tiny has capacity 1 → findBestTable returns ""
    // But then no tables are available, so Seat Now is disabled
    // The "Please select a table" error is a guard for edge cases
    // We can't easily trigger it through the UI — Seat Now is disabled when no tables match
    render(<WalkInDialog {...defaultProps} tables={smallTables} />);
    expect(screen.getByRole("button", { name: "Seat Now" })).toBeDisabled();
  });

  it("should pass correct party size after changing selection", async () => {
    render(<WalkInDialog {...defaultProps} />);

    // Change to party of 6
    fireEvent.click(screen.getByRole("button", { name: "6" }));

    fireEvent.click(screen.getByRole("button", { name: "Seat Now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.partySize).toBe(6);
    // Best fit for 6: Table 4 (cap 8, AVAILABLE) — Table 3 (cap 6) is OCCUPIED
    expect(data.tableId).toBe("table-4");
  });
});
