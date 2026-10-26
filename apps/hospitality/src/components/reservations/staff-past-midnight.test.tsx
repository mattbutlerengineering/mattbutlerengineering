// Device in New York, venue in Los Angeles; DINNER_CONFIG's service runs 17:00 to 02:00.
process.env.TZ = "America/New_York";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Reservation, Table } from "@mbe/types";
import { NewReservationDialog } from "./NewReservationDialog.js";
import { EditReservationDrawer } from "../timeline/EditReservationDrawer.js";
import { DINNER_CONFIG } from "../../utils/dinner-config.fixture.js";

vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
const mockCheck = vi.fn((_args: unknown) => ({ phase: "idle", verdict: null }));
vi.mock("../../hooks/useStaffBookingCheck.js", () => ({
  useStaffBookingCheck: (args: unknown) => mockCheck(args),
}));
vi.mock("../../hooks/useStaffTonight.js", () => ({
  useStaffTonight: () => ({
    serviceDate: "2026-05-10",
    config: DINNER_CONFIG,
    rules: [],
    waitlistClosed: false,
  }),
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

describe("NewReservationDialog past-midnight seatings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("books 00:30 on service day 2026-05-10 as 2026-05-11 00:30 local, date stays the service day", async () => {
    const onConfirm = createWith("2026-05-10", "00:30");
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    const data = onConfirm.mock.calls[0]![0];
    expect(data.date).toBe("2026-05-10");
    expect(data.startTime).toBe("2026-05-11T07:30:00.000Z");
    expect(data.endTime).toBe("2026-05-11T09:00:00.000Z");
  });

  it("checks the live booking against the D+1 window it will send", () => {
    render(
      <NewReservationDialog
        tables={[TABLE]}
        venueId="venue-1"
        defaultDate="2026-05-10"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "00:30" } });
    expect(mockCheck).toHaveBeenLastCalledWith(
      expect.objectContaining({
        window: { start: "2026-05-11T07:30:00.000Z", end: "2026-05-11T09:00:00.000Z" },
      })
    );
  });

  it("leaves an ordinary 19:00 booking on the picked calendar date", async () => {
    const onConfirm = createWith("2026-05-10", "19:00");
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    const data = onConfirm.mock.calls[0]![0];
    expect(data.date).toBe("2026-05-10");
    expect(data.startTime).toBe("2026-05-11T02:00:00.000Z");
  });
});

function reservation(): Reservation {
  return {
    id: "res-1",
    date: "2026-05-10",
    startTime: "2026-05-11T07:30:00.000Z",
    endTime: "2026-05-11T09:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    guestName: "Jane Doe",
    tableId: "table-1",
    venueId: "venue-1",
    guestId: null,
  } as unknown as Reservation;
}

function renderDrawer(res: Reservation) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <EditReservationDrawer
      reservation={res}
      tables={[TABLE]}
      config={DINNER_CONFIG}
      onSave={onSave}
      onClose={vi.fn()}
    />
  );
  return onSave;
}

describe("EditReservationDrawer past-midnight seatings", () => {
  it("saves a 00:30 to 02:00 seating back on calendar day 2026-05-11", async () => {
    const onSave = renderDrawer(reservation());
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const payload = onSave.mock.calls[0]![1];
    expect(payload.startTime).toBe("2026-05-11T07:30:00.000Z");
    expect(payload.endTime).toBe("2026-05-11T09:00:00.000Z");
  });

  it("keeps an ordinary evening seating on the service day", async () => {
    const onSave = renderDrawer({
      ...reservation(),
      startTime: "2026-05-11T02:00:00.000Z",
      endTime: "2026-05-11T04:00:00.000Z",
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const payload = onSave.mock.calls[0]![1];
    expect(payload.startTime).toBe("2026-05-11T02:00:00.000Z");
    expect(payload.endTime).toBe("2026-05-11T04:00:00.000Z");
  });
});
