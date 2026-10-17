import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";
import { useChangeBooking } from "./useChangeBooking.js";

/* ── Mocks ──────────────────────────────────────────── */

const mockCreateForVenue = vi.fn();
const mockReleaseForVenue = vi.fn();
const mockGetSessionId = vi.fn();
const mockModifyManaged = vi.fn();

vi.mock("@mbe/sentry/react", () => ({ reportApiError: vi.fn() }));
vi.mock("./usePublicApiClient.js", () => ({
  usePublicApiClient: () => api,
}));

const api = {
  holds: {
    createForVenue: mockCreateForVenue,
    releaseForVenue: mockReleaseForVenue,
    getSessionId: mockGetSessionId,
  },
  reservations: { modifyManaged: mockModifyManaged },
};

const slotA = { date: "2026-06-16", startTime: "19:00", endTime: "21:00", partySize: 4 };
const slotB = { date: "2026-06-16", startTime: "20:00", endTime: "22:00", partySize: 4 };

function holdFor(id: string) {
  return { hold: { id }, sessionId: "sess_1" };
}

function problem(status: number, code: string) {
  return new ApiClientError({
    type: "about:blank",
    title: "Err",
    status,
    detail: "nope",
    code,
  });
}

function setup() {
  return renderHook(() => useChangeBooking({ token: "tok", venueSlug: "oak" }));
}

describe("useChangeBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionId.mockReturnValue("sess_1");
    mockReleaseForVenue.mockResolvedValue(undefined);
    mockModifyManaged.mockResolvedValue({ id: "res_1" });
  });

  it("selectSlot creates a hold for the venue with date, start time and party size", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1"));
    const { result } = setup();

    await act(() => result.current.selectSlot(slotA));

    expect(mockCreateForVenue).toHaveBeenCalledWith("oak", {
      date: slotA.date,
      startTime: slotA.startTime,
      partySize: 4,
    });
    expect(result.current.status).toBe("held");
  });

  it("selecting a second slot releases the first hold before creating the next", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1")).mockResolvedValueOnce(holdFor("h2"));
    const { result } = setup();

    await act(() => result.current.selectSlot(slotA));
    await act(() => result.current.selectSlot(slotB));

    expect(mockReleaseForVenue).toHaveBeenCalledWith("oak", "h1");
    expect(mockReleaseForVenue.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateForVenue.mock.invocationCallOrder[1]!
    );
  });

  it("confirm modifies the reservation with the active hold and session", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1"));
    const { result } = setup();
    await act(() => result.current.selectSlot(slotA));

    await act(() => result.current.confirm());

    expect(mockModifyManaged).toHaveBeenCalledWith("tok", slotA, {
      holdId: "h1",
      sessionId: "sess_1",
    });
    expect(result.current.status).toBe("done");
    expect(result.current.error).toBeNull();
  });

  it("a 409 from confirm surfaces SLOT_UNAVAILABLE without throwing", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1"));
    mockModifyManaged.mockRejectedValueOnce(problem(409, "SLOT_UNAVAILABLE"));
    const { result } = setup();
    await act(() => result.current.selectSlot(slotA));

    await act(() => result.current.confirm());

    expect(result.current.error).toBe("SLOT_UNAVAILABLE");
    expect(result.current.status).toBe("error");
  });

  it("a 410 from confirm surfaces HOLD_EXPIRED", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1"));
    mockModifyManaged.mockRejectedValueOnce(problem(410, "HOLD_EXPIRED"));
    const { result } = setup();
    await act(() => result.current.selectSlot(slotA));

    await act(() => result.current.confirm());

    expect(result.current.error).toBe("HOLD_EXPIRED");
  });

  it("surfaces the problem code when creating a hold fails", async () => {
    mockCreateForVenue.mockRejectedValueOnce(problem(409, "SLOT_UNAVAILABLE"));
    const { result } = setup();

    await act(() => result.current.selectSlot(slotA));

    expect(result.current.error).toBe("SLOT_UNAVAILABLE");
  });

  it("abandon releases the active hold", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1"));
    const { result } = setup();
    await act(() => result.current.selectSlot(slotA));

    await act(() => result.current.abandon());

    expect(mockReleaseForVenue).toHaveBeenCalledWith("oak", "h1");
    expect(result.current.status).toBe("idle");
  });

  it("unmount releases the active hold", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1"));
    const { result, unmount } = setup();
    await act(() => result.current.selectSlot(slotA));

    unmount();

    expect(mockReleaseForVenue).toHaveBeenCalledWith("oak", "h1");
  });

  it("does not release after a successful confirm (the hold was consumed)", async () => {
    mockCreateForVenue.mockResolvedValueOnce(holdFor("h1"));
    const { result, unmount } = setup();
    await act(() => result.current.selectSlot(slotA));
    await act(() => result.current.confirm());

    unmount();

    expect(mockReleaseForVenue).not.toHaveBeenCalled();
  });
});
