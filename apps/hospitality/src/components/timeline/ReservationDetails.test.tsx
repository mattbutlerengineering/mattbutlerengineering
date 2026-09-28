import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";
import { ReservationDetails, type ReservationDetailsProps } from "./ReservationDetails.js";
import { ERROR_COPY } from "../../lib/describe-api-error.js";
import type { Reservation, Table } from "@mbe/types";

vi.mock("../crm/GuestCard.js", () => ({
  GuestCard: ({ guestId }: { guestId: string }) => <div data-testid="guest-card">{guestId}</div>,
}));

const mockUseDepositByReservation = vi.fn();

vi.mock("../../hooks/useDeposits.js", () => ({
  useDepositByReservation: (id: string | null | undefined) => mockUseDepositByReservation(id),
}));

vi.mock("./StaffDepositSection.js", () => ({
  StaffDepositSection: ({
    reservationId,
    existingDeposit,
  }: {
    reservationId: string;
    existingDeposit: { status: string } | null;
  }) => (
    <div data-testid="staff-deposit-section">
      {reservationId}:{existingDeposit ? existingDeposit.status : "none"}
    </div>
  ),
}));

/** A 500 the way `@mbe/api-client` raises it: `raw` is "<METHOD> <path> failed: 500 …". */
function serverError(method: string, path: string): ApiClientError {
  return new ApiClientError(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Internal Server Error",
    },
    method,
    path
  );
}

/* ── Fixtures ───────────────────────────────────────── */

// Local-time instants so `formatTime` prints the same clock reading in any zone.
const START = new Date(2026, 8, 9, 17, 30).toISOString();
const END = new Date(2026, 8, 9, 19, 30).toISOString();
const OCCUPIED_CAPTION = "Table 4 is still occupied — turn it or move the party.";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    date: "2026-09-09",
    startTime: START,
    endTime: END,
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Priya Shah",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "t4",
    venueId: "venue-1",
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "t4",
    name: "Table 4",
    tableNumber: null,
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

function renderDetails(overrides: Partial<ReservationDetailsProps> = {}) {
  const props: ReservationDetailsProps = {
    reservation: makeReservation(),
    tables: [makeTable()],
    seated: false,
    now: new Date(START),
    onEdit: vi.fn(),
    onSeat: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    onMarkNoShow: vi.fn(),
    ...overrides,
  };
  return { ...render(<ReservationDetails {...props} />), props };
}

const seatButton = () => screen.queryByRole("button", { name: "Seat Guest" });

/* ── Tests ──────────────────────────────────────────── */

describe("ReservationDetails", () => {
  beforeEach(() => {
    mockUseDepositByReservation.mockReset();
    mockUseDepositByReservation.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  describe("deposit visibility (#5725 item 1)", () => {
    it("passes the reservation id and fetched deposit down to StaffDepositSection", () => {
      mockUseDepositByReservation.mockReturnValue({
        data: { status: "held" },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderDetails({ reservation: makeReservation({ id: "r9" }) });

      expect(mockUseDepositByReservation).toHaveBeenCalledWith("r9");
      expect(screen.getByTestId("staff-deposit-section")).toHaveTextContent("r9:held");
    });

    it("passes null (not undefined) when the reservation has no deposit yet", () => {
      renderDetails();
      expect(screen.getByTestId("staff-deposit-section")).toHaveTextContent("r1:none");
    });

    it("stays inspectable for a NO_SHOW reservation — the deposit outcome is exactly what staff need to see", () => {
      mockUseDepositByReservation.mockReturnValue({
        data: { status: "uncollectable" },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderDetails({ reservation: makeReservation({ status: "NO_SHOW" }) });

      expect(screen.getByTestId("staff-deposit-section")).toHaveTextContent("r1:uncollectable");
    });
  });

  describe("status word and Seat Guest gating (A4.1, A4.2 sidebar half, P05)", () => {
    it("reads 'Seated' and hides Seat Guest for a CONFIRMED party seated at its OCCUPIED table", () => {
      renderDetails({ tables: [makeTable({ status: "OCCUPIED" })], seated: true });
      expect(screen.getByText("Seated")).toBeInTheDocument();
      expect(screen.queryByText("Confirmed")).toBeNull();
      expect(seatButton()).toBeNull();
      expect(screen.queryByText(OCCUPIED_CAPTION)).toBeNull();
    });

    it("shows Seat Guest for a PENDING party on an AVAILABLE table", () => {
      renderDetails({ reservation: makeReservation({ status: "PENDING" }) });
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(seatButton()).toBeInTheDocument();
    });

    it("explains the missing button when the table is OCCUPIED by another party", () => {
      renderDetails({
        tables: [makeTable({ status: "OCCUPIED" })],
        seated: false,
        // 30 minutes before this reservation's own start — a lingering earlier party, not us.
        now: new Date(new Date(START).getTime() - 30 * 60_000),
      });
      expect(screen.getByText("Confirmed")).toBeInTheDocument();
      expect(screen.getByText(OCCUPIED_CAPTION)).toBeInTheDocument();
      expect(seatButton()).toBeNull();
    });

    it("stays quiet once the party is running over — occupied by itself, not turned (#5270)", () => {
      renderDetails({
        tables: [makeTable({ status: "OCCUPIED" })],
        seated: false,
        now: new Date(new Date(END).getTime() + 60_000),
      });
      expect(screen.getByText("Confirmed")).toBeInTheDocument();
      expect(screen.queryByText(OCCUPIED_CAPTION)).toBeNull();
      expect(seatButton()).toBeNull();
    });

    it("hides Seat Guest for a status outside PENDING and CONFIRMED", () => {
      renderDetails({ reservation: makeReservation({ status: "COMPLETED" }) });
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(seatButton()).toBeNull();
    });

    it("reads 'table unknown' when the reservation's table is absent from the list", () => {
      renderDetails({ tables: [] });
      expect(screen.getByText("table unknown")).toBeInTheDocument();
      expect(screen.queryByText(OCCUPIED_CAPTION)).toBeNull();
    });
  });

  describe("seat failure (A3.2 seat half)", () => {
    it("renders 'Guest not seated.' with the sentence and keeps focus on the button", async () => {
      const onSeat = vi.fn().mockRejectedValue(serverError("POST", "/api/v1/reservations/r1/seat"));
      renderDetails({ onSeat });

      const button = seatButton()!;
      button.focus();
      fireEvent.click(button);

      const alert = await screen.findByRole("alert");
      expect(
        alert.textContent?.startsWith(`Guest not seated.${ERROR_COPY.serverError.detail}`)
      ).toBe(true);
      await waitFor(() => {
        expect(seatButton()).toHaveFocus();
      });
      expect(seatButton()).not.toBeDisabled();
      expect(onSeat).toHaveBeenCalledTimes(1);
    });

    it("shows no banner when onSeat resolves", async () => {
      const { props } = renderDetails();
      fireEvent.click(seatButton()!);
      await waitFor(() => {
        expect(props.onSeat).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("times (A10.3)", () => {
    it("prints the start and end via formatTime", () => {
      renderDetails();
      expect(screen.getByText(/5:30 PM/)).toBeInTheDocument();
      expect(screen.getByText(/7:30 PM/)).toBeInTheDocument();
    });
  });

  describe("other actions", () => {
    it("calls onEdit and onCancel, and hides Cancel for a CANCELLED reservation", () => {
      const { props } = renderDetails();
      fireEvent.click(screen.getByRole("button", { name: "Edit Reservation" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel Reservation" }));
      expect(props.onEdit).toHaveBeenCalledTimes(1);
      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("hides Cancel Reservation once cancelled", () => {
      renderDetails({ reservation: makeReservation({ status: "CANCELLED" }) });
      expect(screen.queryByRole("button", { name: "Cancel Reservation" })).toBeNull();
    });
  });

  describe("Mark No-Show (#5616 — only the CONFIRMED → NO_SHOW transition is valid)", () => {
    it("shows Mark No-Show for a CONFIRMED reservation and calls onMarkNoShow", () => {
      const { props } = renderDetails({ reservation: makeReservation({ status: "CONFIRMED" }) });
      fireEvent.click(screen.getByRole("button", { name: "Mark No-Show" }));
      expect(props.onMarkNoShow).toHaveBeenCalledTimes(1);
    });

    it.each(["PENDING", "COMPLETED", "CANCELLED", "NO_SHOW"] as const)(
      "hides Mark No-Show for a %s reservation",
      (status) => {
        renderDetails({ reservation: makeReservation({ status }) });
        expect(screen.queryByRole("button", { name: "Mark No-Show" })).toBeNull();
      }
    );
  });
});
