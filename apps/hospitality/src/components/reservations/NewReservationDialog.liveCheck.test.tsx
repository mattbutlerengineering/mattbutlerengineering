import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewReservationDialog } from "./NewReservationDialog.js";
import type { Table, TimeSlot } from "@mbe/types";
import type { StaffCheckParams, StaffCheckResult } from "../../hooks/useStaffBookingCheck.js";

const mockCheck = vi.fn<(params: StaffCheckParams) => StaffCheckResult>();
const mockOpenTimes = vi.fn();

vi.mock("../../hooks/useStaffBookingCheck.js", () => ({
  useStaffBookingCheck: (params: StaffCheckParams) => mockCheck(params),
}));
vi.mock("../../hooks/useOpenTimes.js", () => ({
  useOpenTimes: (params: unknown) => mockOpenTimes(params),
}));
vi.mock("../../hooks/useStaffTonight.js", () => ({
  useStaffTonight: () => ({ serviceDate: null, rules: [], waitlistClosed: false }),
}));
vi.mock("../../hooks/useGuestLookup.js", () => ({
  useGuestLookup: () => ({ rows: [], hasMore: false, isLoading: false, failed: false, query: "" }),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeTable(id: string, capacity: number): Table {
  return {
    id,
    name: `Table ${id}`,
    tableNumber: id,
    capacity,
    minCovers: 1,
    maxCovers: capacity,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  };
}

const IDLE: StaffCheckResult = { phase: "idle", verdict: null };
const SOFT: StaffCheckResult = {
  phase: "done",
  verdict: { kind: "soft", limits: ["after_last_seating"], message: "x" },
};
const CLOSED: StaffCheckResult = {
  phase: "done",
  verdict: {
    kind: "hard",
    reason: "closed",
    message: "Closed 10:00-11:00 PM, 'burst pipe'.",
  },
};

describe("NewReservationDialog live availability check", () => {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const props = {
    tables: [makeTable("t1", 2), makeTable("t2", 2)],
    venueId: "venue-1",
    defaultDate: "2026-04-10",
    onConfirm,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockReturnValue(IDLE);
    mockOpenTimes.mockReturnValue({ data: [], isLoading: false, error: null });
  });

  function fill() {
    fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "21:30" } });
  }

  it("asks nothing while no time is entered", () => {
    render(<NewReservationDialog {...props} />);
    expect(mockCheck).toHaveBeenLastCalledWith(expect.objectContaining({ window: null }));
  });

  it("books past a soft limit only with a reason, sending it as the override", async () => {
    mockCheck.mockReturnValue(SOFT);
    render(<NewReservationDialog {...props} />);
    fill();

    expect(screen.getByText(/after last seating/i)).toBeInTheDocument();
    const book = screen.getByRole("button", { name: "Book with override" });
    expect(book).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "  Regular  " } });
    expect(book).toBeEnabled();
    fireEvent.click(book);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0]![0]).toMatchObject({ override: { reason: "Regular" } });
  });

  it("sends no override when the check is ok", async () => {
    mockCheck.mockReturnValue({ ...IDLE, phase: "done", verdict: { kind: "ok" } });
    render(<NewReservationDialog {...props} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0]![0]).not.toHaveProperty("override");
  });

  it("blocks booking inside a closure and shows why", () => {
    mockCheck.mockReturnValue(CLOSED);
    render(<NewReservationDialog {...props} />);
    fill();

    expect(screen.getByText(/burst pipe/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/reason/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Create Reservation" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("falls back to the server when the check fails", async () => {
    mockCheck.mockReturnValue({ ...IDLE, phase: "failed" });
    render(<NewReservationDialog {...props} />);
    fill();

    expect(screen.getByText(/couldn.t check availability/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0]![0]).not.toHaveProperty("override");
  });

  it("offers open times as one-tap shortcuts for the time field", async () => {
    const slots: TimeSlot[] = [
      { time: new Date("2026-04-10T19:15:00").toISOString(), available: true },
    ];
    mockOpenTimes.mockReturnValue({ data: slots, isLoading: false, error: null });
    render(<NewReservationDialog {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /7:15/ }));
    await waitFor(() =>
      expect((screen.getByLabelText(/start time/i) as HTMLInputElement).value).toBe("19:15")
    );
  });

  it("says so when no times are open", () => {
    render(<NewReservationDialog {...props} />);
    expect(screen.getByText(/no open times for 2/i)).toBeInTheDocument();
  });

  it("checks the selected table only", () => {
    render(<NewReservationDialog {...props} />);
    expect(mockCheck).toHaveBeenLastCalledWith(expect.objectContaining({ selectedTableId: "t1" }));
  });

  it("blocks booking when the selected table is blocked at that time", () => {
    mockCheck.mockReturnValue({
      phase: "done",
      verdict: { kind: "hard", reason: "table_blocked", message: "This table is not available." },
    });
    render(<NewReservationDialog {...props} />);
    fill();
    expect(screen.getByText(/not available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Reservation" })).toBeDisabled();
  });
});
