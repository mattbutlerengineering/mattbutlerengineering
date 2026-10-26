import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewReservationDialog } from "./NewReservationDialog.js";
import type { DateRule, Table } from "@mbe/types";

vi.mock("../../hooks/useStaffBookingCheck.js", () => ({
  useStaffBookingCheck: () => ({ phase: "idle", verdict: null }),
}));
vi.mock("../../hooks/useOpenTimes.js", () => ({
  useOpenTimes: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("../../hooks/useGuestLookup.js", () => ({
  useGuestLookup: () => ({ rows: [], hasMore: false, isLoading: false, failed: false, query: "" }),
}));

const SERVICE_DATE = "2026-04-10";
const blockRule = {
  id: "r-block",
  kind: "tonight",
  targetKind: "tables",
  tableIds: ["t2"],
  startsOn: SERVICE_DATE,
  payload: { version: 1, stop: { from: 0, to: 2880 } },
} as DateRule;

const mockTonight = vi.fn();
vi.mock("../../hooks/useStaffTonight.js", () => ({
  useStaffTonight: () => mockTonight(),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeTable(id: string): Table {
  return {
    id,
    name: `Table ${id}`,
    tableNumber: id,
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
  };
}

const props = {
  tables: [makeTable("t1"), makeTable("t2")],
  venueId: "venue-1",
  defaultDate: SERVICE_DATE,
  onConfirm: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
};

describe("NewReservationDialog blocked tables (ux.md F8)", () => {
  beforeEach(() => {
    mockTonight.mockReturnValue({
      serviceDate: SERVICE_DATE,
      rules: [blockRule],
      waitlistClosed: false,
    });
  });

  it("renders a blocked table disabled with the reason in its name, and the others selectable", () => {
    render(<NewReservationDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "19:00" } });

    fireEvent.click(screen.getByRole("combobox", { name: /table/i }));

    const blocked = screen.getByRole("option", { name: /Table t2.*Blocked tonight/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    const open = screen.getByRole("option", { name: /Table t1/ });
    expect(open).not.toHaveAttribute("aria-disabled", "true");
    expect(open).not.toHaveTextContent("Blocked tonight");
  });

  it("blocks nothing on another date", () => {
    render(<NewReservationDialog {...props} defaultDate="2026-04-12" />);
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "19:00" } });

    fireEvent.click(screen.getByRole("combobox", { name: /table/i }));

    expect(screen.queryByText(/Blocked tonight/)).not.toBeInTheDocument();
  });

  it("disables Create while the selected table is blocked", () => {
    render(<NewReservationDialog {...props} tables={[makeTable("t2")]} />);
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "19:00" } });

    expect(screen.getByRole("button", { name: "Create Reservation" })).toBeDisabled();
  });
});
