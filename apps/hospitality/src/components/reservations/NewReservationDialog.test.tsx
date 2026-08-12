import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FOCUSABLE_SELECTOR } from "@mattbutlerengineering/rialto/hooks";
import { NewReservationDialog } from "./NewReservationDialog.js";
import type { Table } from "@mbe/types";

// Mock scrollIntoView for JSDOM (rialto Select uses it)
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "1",
    capacity: 2,
    minCovers: 1,
    maxCovers: 2,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

function makeTables(): Table[] {
  return [
    makeTable({ id: "table-1", name: "Table 1", capacity: 2 }),
    makeTable({ id: "table-2", name: "Table 2", capacity: 4 }),
    makeTable({ id: "table-3", name: "Table 3", capacity: 6, isActive: false }),
    makeTable({ id: "table-4", name: "Table 4", capacity: 8 }),
  ];
}

describe("NewReservationDialog", () => {
  const defaultProps = {
    tables: makeTables(),
    venueId: "venue-1",
    defaultDate: "2026-04-10",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });
  }

  it("should render the dialog with title", () => {
    render(<NewReservationDialog {...defaultProps} />);
    expect(screen.getByText("New Reservation")).toBeDefined();
  });

  it("should render with dialog role and aria-modal", () => {
    render(<NewReservationDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("should default the date field to defaultDate", () => {
    render(<NewReservationDialog {...defaultProps} />);
    const dateInput = screen.getByLabelText(/^date/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-04-10");
  });

  it("should default to party size 2 and auto-select the best-fit active table", () => {
    render(<NewReservationDialog {...defaultProps} />);
    const btn = screen.getByRole("button", { name: "2" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 1 (seats 2)");
  });

  it("should exclude inactive tables from the table select", () => {
    render(<NewReservationDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "6" }));

    // Table 3 (cap 6) is inactive, so best fit becomes Table 4 (cap 8)
    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 4 (seats 8)");
  });

  it("should show a message and disable submit when no table fits", () => {
    const smallTables = [makeTable({ id: "tiny", name: "Tiny", capacity: 1 })];
    render(<NewReservationDialog {...defaultProps} tables={smallTables} />);

    expect(screen.getByText(/no tables available for a party of 2/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Create Reservation" })).toBeDisabled();
  });

  it("should require guest name", async () => {
    render(<NewReservationDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText(/guest name is required/i)).toBeDefined();
    });
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("should require a guest email or phone number", async () => {
    render(<NewReservationDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText(/provide a guest email or phone/i)).toBeDefined();
    });
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("should call onConfirm with a complete CreateReservationRequest on submit", async () => {
    render(<NewReservationDialog {...defaultProps} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data).toMatchObject({
      date: "2026-04-10",
      startTime: "2026-04-10T18:30:00",
      endTime: "2026-04-10T20:00:00",
      partySize: 2,
      tableId: "table-1",
      venueId: "venue-1",
      guestName: "Smith",
      guestEmail: "smith@example.com",
    });
    expect(data.guestPhone).toBeUndefined();
  });

  it("should roll endTime to the next calendar day when start time is within the duration of midnight", async () => {
    render(<NewReservationDialog {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "23:15" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.startTime).toBe("2026-04-10T23:15:00");
    expect(data.endTime).toBe("2026-04-11T00:45:00");
    expect(new Date(data.endTime).getTime()).toBeGreaterThan(new Date(data.startTime).getTime());
  });

  it("should call onClose when Cancel is clicked", () => {
    render(<NewReservationDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("should display the error envelope message when onConfirm rejects", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Table is not available"));
    render(<NewReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText("Table is not available")).toBeDefined();
    });
  });

  it("should display a fallback error when onConfirm rejects with a non-Error", async () => {
    const onConfirm = vi.fn().mockRejectedValue("boom");
    render(<NewReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to create reservation.")).toBeDefined();
    });
  });

  it("should show loading state while submitting", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<NewReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText("Creating…")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePromise!(undefined);
  });

  describe("accessibility (focus trap + return focus)", () => {
    it("traps Tab focus within the dialog", () => {
      const { container } = render(<NewReservationDialog {...defaultProps} />);
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(document.activeElement).toBe(first);

      fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    });

    it("returns focus to the trigger element when closed via Cancel", () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();

      render(<NewReservationDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(document.activeElement).toBe(trigger);
      document.body.removeChild(trigger);
    });

    it("closes and returns focus on Escape key", () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();

      render(<NewReservationDialog {...defaultProps} />);
      fireEvent.keyDown(document, { key: "Escape" });

      expect(defaultProps.onClose).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(trigger);
      document.body.removeChild(trigger);
    });

    it("returns focus when closed via backdrop click", () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();

      const { container } = render(<NewReservationDialog {...defaultProps} />);
      const overlay = container.firstChild as HTMLElement;
      fireEvent.click(overlay);

      expect(defaultProps.onClose).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(trigger);
      document.body.removeChild(trigger);
    });
  });
});
