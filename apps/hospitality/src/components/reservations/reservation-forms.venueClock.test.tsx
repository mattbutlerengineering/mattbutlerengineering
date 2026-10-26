// Device in New York, venue in Los Angeles: the forms speak the venue's wall clock and the API
// speaks UTC instants.
process.env.TZ = "America/New_York";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Reservation, Table } from "@mbe/types";
import { NewReservationDialog } from "./NewReservationDialog.js";
import { EditReservationDrawer } from "../timeline/EditReservationDrawer.js";

vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

vi.mock("../../hooks/useStaffBookingCheck.js", () => ({
  useStaffBookingCheck: () => ({ phase: "idle", verdict: null, blockedTableIds: new Set() }),
}));
vi.mock("../../hooks/useOpenTimes.js", () => ({
  useOpenTimes: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("../../hooks/useGuestLookup.js", () => ({
  useGuestLookup: () => ({ rows: [], hasMore: false, isLoading: false, failed: false, query: "" }),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const TABLE = {
  id: "table-1",
  name: "Table 1",
  capacity: 4,
  isActive: true,
  status: "AVAILABLE",
} as unknown as Table;

function createWith(date: string, time: string) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(
    <NewReservationDialog
      tables={[TABLE]}
      venueId="venue-1"
      defaultDate={date}
      onConfirm={onConfirm}
      onClose={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
  fireEvent.change(screen.getByLabelText(/guest email/i), {
    target: { value: "smith@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: time } });
  fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));
  return onConfirm;
}

describe("NewReservationDialog on the venue clock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates 7:00 PM on 2026-05-10 as 2026-05-11T02:00Z, plus the 90 minute default", async () => {
    const onConfirm = createWith("2026-05-10", "19:00");
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    const data = onConfirm.mock.calls[0]![0];
    expect(data.date).toBe("2026-05-10");
    expect(data.startTime).toBe("2026-05-11T02:00:00.000Z");
    expect(data.endTime).toBe("2026-05-11T03:30:00.000Z");
  });

  it("uses the offset in force on the date at a DST edge (spring-forward 2026-03-08)", async () => {
    const onConfirm = createWith("2026-03-08", "12:00");
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0]![0].startTime).toBe("2026-03-08T19:00:00.000Z"); // PDT, not PST
  });
});

function reservation(): Reservation {
  return {
    id: "res-1",
    date: "2026-05-10",
    startTime: "2026-05-11T02:00:00.000Z",
    endTime: "2026-05-11T04:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    guestName: "Jane Doe",
    tableId: "table-1",
    venueId: "venue-1",
    guestId: null,
  } as unknown as Reservation;
}

describe("EditReservationDrawer on the venue clock", () => {
  it("shows a 02:00Z reservation as 19:00 and saves it back unchanged as UTC instants", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EditReservationDrawer
        reservation={reservation()}
        tables={[TABLE]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/start time/i) as HTMLInputElement).value).toBe("19:00");
    expect((screen.getByLabelText(/end time/i) as HTMLInputElement).value).toBe("21:00");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const payload = onSave.mock.calls[0]![1];
    expect(payload.startTime).toBe("2026-05-11T02:00:00.000Z");
    expect(payload.endTime).toBe("2026-05-11T04:00:00.000Z");
  });

  it("converts an edited time on the venue clock", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EditReservationDrawer
        reservation={reservation()}
        tables={[TABLE]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "20:00" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![1].startTime).toBe("2026-05-11T03:00:00.000Z");
  });
});
