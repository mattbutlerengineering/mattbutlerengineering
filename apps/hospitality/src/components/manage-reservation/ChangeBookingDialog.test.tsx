import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";
import type { ManagedReservation, ManagedReservationVenue } from "@mbe/api-client";
import { ChangeBookingDialog } from "./ChangeBookingDialog.js";

const mockGetSlots = vi.fn();
const mockCreateForVenue = vi.fn();
const mockReleaseForVenue = vi.fn();
const mockGetSessionId = vi.fn();
const mockModifyManaged = vi.fn();

vi.mock("@mbe/sentry/react", () => ({ reportApiError: vi.fn() }));
vi.mock("../../hooks/usePublicApiClient.js", () => ({ usePublicApiClient: () => api }));

const api = {
  availability: { getTimeSlotsForVenue: mockGetSlots },
  holds: {
    createForVenue: mockCreateForVenue,
    releaseForVenue: mockReleaseForVenue,
    getSessionId: mockGetSessionId,
  },
  reservations: { modifyManaged: mockModifyManaged },
};

const reservation: ManagedReservation = {
  id: "res_1",
  date: "2099-06-16",
  startTime: "2099-06-16T19:00:00.000Z",
  endTime: "2099-06-16T21:00:00.000Z",
  partySize: 4,
  guestName: "Ada",
  guestEmail: "ada@example.com",
  status: "CONFIRMED",
  notes: null,
};

const venue: ManagedReservationVenue = {
  id: "v1",
  name: "Oak",
  slug: "oak",
  ianaTimezone: "UTC",
  maxPartySizeChange: 2,
};

const slot = { time: "2099-06-17T20:00:00.000Z", available: true };

function problem(status: number, code: string) {
  return new ApiClientError({ type: "about:blank", title: "Err", status, detail: "x", code });
}

function setup(props: Partial<React.ComponentProps<typeof ChangeBookingDialog>> = {}) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(
    <ChangeBookingDialog
      token="tok"
      venue={venue}
      reservation={reservation}
      onChanged={onChanged}
      onClose={onClose}
      {...props}
    />
  );
  return { onChanged, onClose };
}

async function pickSlot() {
  fireEvent.click(screen.getByRole("button", { name: /find available times/i }));
  const option = await screen.findByText(/8:00/);
  fireEvent.click(option);
}

describe("ChangeBookingDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSlots.mockResolvedValue([slot]);
    mockCreateForVenue.mockResolvedValue({ hold: { id: "h1" }, sessionId: "s1" });
    mockReleaseForVenue.mockResolvedValue(undefined);
    mockGetSessionId.mockReturnValue("s1");
    mockModifyManaged.mockResolvedValue({ ...reservation, partySize: 4 });
  });

  it("labels the dialog with a semantic heading", () => {
    setup();
    const titleId = screen.getByRole("dialog").getAttribute("aria-labelledby");
    const title = document.getElementById(titleId ?? "");
    expect(title?.tagName).toMatch(/^H[1-6]$/);
  });
  it("opens prefilled with the current date and party size", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect((screen.getByLabelText(/^date/i) as HTMLInputElement).value).toBe("2099-06-16");
    expect(screen.getByRole("button", { name: "4", pressed: true })).toBeDefined();
  });

  it("limits party-size options by maxPartySizeChange", () => {
    setup();
    expect(screen.queryByRole("button", { name: "7" })).toBeNull();
    expect(screen.getByRole("button", { name: "6" })).toBeDefined();
  });

  it("holds the slot, then confirm calls modifyManaged and onChanged", async () => {
    const { onChanged } = setup();
    await pickSlot();
    await waitFor(() => expect(mockCreateForVenue).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: /confirm change/i }));
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: "res_1" }))
    );
    expect(mockModifyManaged).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ partySize: 4, startTime: slot.time }),
      { holdId: "h1", sessionId: "s1" }
    );
  });

  it("releases the hold when closed", async () => {
    const { onClose } = setup();
    await pickSlot();
    await waitFor(() => expect(mockCreateForVenue).toHaveBeenCalled());
    await screen.findByRole("button", { name: /confirm change/i });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(mockReleaseForVenue).toHaveBeenCalledWith("oak", "h1"));
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ["SLOT_UNAVAILABLE", /original booking is unchanged/i],
    ["HOLD_EXPIRED", /hold expired/i],
    ["PARTY_SIZE_DEPOSIT_HELD", /deposit/i],
    ["MODIFICATION_CUTOFF", /too close/i],
    ["PARTY_SIZE_CHANGE_TOO_LARGE", /too large/i],
  ])("shows a distinct message for %s", async (code, pattern) => {
    mockModifyManaged.mockRejectedValueOnce(problem(409, code));
    setup();
    await pickSlot();
    fireEvent.click(await screen.findByRole("button", { name: /confirm change/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(pattern);
  });
});
