import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiValidationError } from "./client.js";
import { ReservationsClient } from "./reservations.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient() {
  const apiClient = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
  return new ReservationsClient(apiClient);
}

const fakePagination = {
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
  hasNext: false,
  hasPrev: false,
};

const fakeReservation = {
  id: "r1",
  venueId: "v1",
  guestId: "g1",
  tableId: "t1",
  partySize: 2,
  status: "CONFIRMED",
  date: "2026-06-01",
  startTime: "19:00",
  endTime: "20:30",
  durationMinutes: 90,
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  occasion: null,
  seatingPreference: null,
  guestName: null,
  guestEmail: null,
  guestPhone: null,
  userId: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("ReservationsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests /api/v1/reservations with no params when called with defaults", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeReservation], pagination: { ...fakePagination, total: 1 } })
      );

      await makeClient().list();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations");
    });

    it("appends filter query params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], pagination: { ...fakePagination, total: 0 } })
      );

      await makeClient().list({ venueId: "v1", date: "2026-06-01", status: "CONFIRMED" });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.get("date")).toBe("2026-06-01");
      expect(parsed.searchParams.get("status")).toBe("CONFIRMED");
    });

    it("returns the nested paginated response", async () => {
      const body = { data: [fakeReservation], pagination: { ...fakePagination, total: 1 } };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const result = await makeClient().list();
      expect(result).toEqual(body);
    });

    it("throws ApiValidationError when response is missing pagination object", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeReservation], total: 1, page: 1, limit: 10 })
      );

      await expect(makeClient().list()).rejects.toThrow(ApiValidationError);
    });

    it("throws ApiValidationError when data is not an array", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: fakeReservation, pagination: fakePagination })
      );

      await expect(makeClient().list()).rejects.toThrow(ApiValidationError);
    });
  });

  describe("me", () => {
    it("requests /api/v1/reservations/me with pagination", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], pagination: { ...fakePagination, total: 0 } })
      );

      await makeClient().me();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/me?page=1&limit=10");
    });

    it("passes custom page and limit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          data: [],
          pagination: { page: 3, limit: 5, total: 0, totalPages: 0, hasNext: false, hasPrev: true },
        })
      );

      await makeClient().me(3, 5);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/me?page=3&limit=5");
    });

    it("throws ApiValidationError when pagination object is absent", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 1, limit: 10 }));

      await expect(makeClient().me()).rejects.toThrow(ApiValidationError);
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/reservations/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().get("r1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
    });

    it("unwraps data from ApiResponse", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      const result = await makeClient().get("r1");
      expect(result).toEqual(fakeReservation);
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/reservations with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().create({
        venueId: "v1",
        guestId: "g1",
        tableId: "t1",
        partySize: 2,
        date: "2026-06-01",
        startTime: "19:00",
        endTime: "21:00",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations");
      expect(options?.method).toBe("POST");
    });

    it("returns the created reservation", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      const result = await makeClient().create({
        venueId: "v1",
        guestId: "g1",
        tableId: "t1",
        partySize: 2,
        date: "2026-06-01",
        startTime: "19:00",
        endTime: "21:00",
      });
      expect(result).toEqual(fakeReservation);
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/reservations/:id", async () => {
      const updated = { ...fakeReservation, partySize: 4 };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().update("r1", { partySize: 4 });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
      expect(options?.method).toBe("PATCH");
      expect(JSON.parse(options?.body as string)).toMatchObject({ partySize: 4 });
    });
  });

  describe("markNoShow", () => {
    it("sends PATCH with status NO_SHOW and returns both the reservation and an optional warning (#5719 M2)", async () => {
      const noShow = { ...fakeReservation, status: "NO_SHOW" };
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          data: noShow,
          warning: "Deposit authorization is still pending — no charge was made.",
        })
      );

      const result = await makeClient().markNoShow("r1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
      expect(options?.method).toBe("PATCH");
      expect(JSON.parse(options?.body as string)).toEqual({ status: "NO_SHOW" });
      expect(result.reservation).toEqual(noShow);
      expect(result.warning).toMatch(/pending/i);
    });

    it("omits warning when the response doesn't carry one", async () => {
      const noShow = { ...fakeReservation, status: "NO_SHOW" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: noShow }));

      const result = await makeClient().markNoShow("r1");

      expect(result.reservation).toEqual(noShow);
      expect(result.warning).toBeUndefined();
    });
  });

  describe("cancel", () => {
    it("sends DELETE /api/v1/reservations/:id", async () => {
      const cancelled = { ...fakeReservation, status: "CANCELLED" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: cancelled }));

      await makeClient().cancel("r1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("cancelWithReason", () => {
    it("delegates to update with CANCELLED status", async () => {
      const cancelled = { ...fakeReservation, status: "CANCELLED" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: cancelled }));

      await makeClient().cancelWithReason("r1", {
        cancellationReason: "guest_request",
        cancellationNote: "Changed plans",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
      expect(options?.method).toBe("PATCH");
      const body = JSON.parse(options?.body as string);
      expect(body.status).toBe("CANCELLED");
      expect(body.cancellationReason).toBe("guest_request");
    });

    it("throws ApiValidationError when response is malformed", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1" } }));

      await expect(
        makeClient().cancelWithReason("r1", {
          cancellationReason: "guest_request",
        })
      ).rejects.toBeInstanceOf(ApiValidationError);
    });
  });

  describe("walkIn", () => {
    it("sends POST /api/v1/reservations/walk-in", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().walkIn({ partySize: 2, tableId: "t1", venueId: "v1" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/walk-in");
      expect(options?.method).toBe("POST");
    });

    it("passes guestId through in the POST body when supplied (booking-guest-reuse M1.2)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().walkIn({ partySize: 2, tableId: "t1", venueId: "v1", guestId: "gst_1" });

      const [, options] = mockFetch.mock.calls[0]!;
      const body = JSON.parse(options?.body as string) as Record<string, unknown>;
      expect(body.guestId).toBe("gst_1");
    });

    it("sends no guestId key at all when it is omitted (never defaults to null)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().walkIn({ partySize: 2, tableId: "t1", venueId: "v1" });

      const [, options] = mockFetch.mock.calls[0]!;
      const body = JSON.parse(options?.body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty("guestId");
    });
  });

  describe("error handling", () => {
    it("propagates 404 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Not found", statusCode: 404 }, 404)
      );

      await expect(makeClient().get("bad")).rejects.toThrow();
    });

    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(makeClient().list()).rejects.toThrow(TypeError);
    });
  });

  describe("schema validation", () => {
    it("throws ApiValidationError when get() receives a malformed reservation", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1", status: "CONFIRMED" } }));

      await expect(makeClient().get("r1")).rejects.toBeInstanceOf(ApiValidationError);
    });

    it("invokes onError callback with ApiValidationError when get() receives a malformed response", async () => {
      const onError = vi.fn();
      const apiClient = new ApiClient({
        baseUrl: "https://api.test.com",
        maxRetries: 0,
        onError,
      });
      const client = new ReservationsClient(apiClient);

      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1", status: "CONFIRMED" } }));

      await expect(client.get("r1")).rejects.toBeInstanceOf(ApiValidationError);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0]![0]).toBeInstanceOf(ApiValidationError);
    });

    it("throws ApiValidationError when list() receives a non-array data field", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: "not-an-array", total: 0, page: 1, limit: 10 })
      );

      await expect(makeClient().list()).rejects.toBeInstanceOf(ApiValidationError);
    });

    it("throws ApiValidationError when create() receives a malformed response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1" } }));

      await expect(
        makeClient().create({
          venueId: "v1",
          guestId: "g1",
          tableId: "t1",
          partySize: 2,
          date: "2026-06-01",
          startTime: "19:00",
          endTime: "21:00",
        })
      ).rejects.toBeInstanceOf(ApiValidationError);
    });

    it("throws ApiValidationError when update() receives a malformed response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1" } }));

      await expect(makeClient().update("r1", { partySize: 4 })).rejects.toBeInstanceOf(
        ApiValidationError
      );
    });

    it("throws ApiValidationError when cancel() receives a malformed response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1" } }));

      await expect(makeClient().cancel("r1")).rejects.toBeInstanceOf(ApiValidationError);
    });

    it("throws ApiValidationError when cancelWithReason() receives a malformed response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1" } }));

      await expect(
        makeClient().cancelWithReason("r1", { cancellationReason: "guest_request" })
      ).rejects.toBeInstanceOf(ApiValidationError);
    });

    it("throws ApiValidationError when walkIn() receives a malformed response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "r1" } }));

      await expect(
        makeClient().walkIn({ partySize: 2, tableId: "t1", venueId: "v1" })
      ).rejects.toBeInstanceOf(ApiValidationError);
    });
  });
});

describe("ReservationsClient.manageReservation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const managedPayload = {
    reservation: {
      id: "res_1",
      date: "2026-06-15",
      startTime: "19:00",
      endTime: "21:00",
      partySize: 4,
      guestName: "Jane Doe",
      guestEmail: "jane@example.com",
      status: "PENDING",
      notes: null,
    },
    venue: {
      id: "venue_1",
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/Los_Angeles",
    },
  };

  it("GETs /public/v1/reservations/manage with the URL-encoded token and unwraps data", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: managedPayload }));

    const result = await makeClient().manageReservation("tok/with+special");

    const [url, options] = mockFetch.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/public/v1/reservations/manage");
    expect(parsed.searchParams.get("token")).toBe("tok/with+special");
    expect(options?.method ?? "GET").toBe("GET");
    expect(result).toEqual(managedPayload);
  });

  it("carries the venue cancellation (refund status and rebook offers) through", async () => {
    const venueCancellation = {
      refundStatus: "done",
      closureDate: "2026-11-05",
      closureMessage: "Closed for a private event",
      offers: [
        {
          id: "2026-11-05T01:30:00.000Z",
          date: "2026-11-04",
          startTime: "2026-11-05T01:30:00.000Z",
        },
      ],
      rebooked: null,
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { ...managedPayload, venueCancellation } })
    );

    const result = await makeClient().manageReservation("tok");
    expect(result.venueCancellation).toEqual(venueCancellation);
  });

  it("carries the rebooked state (new start and manage token) through", async () => {
    const venueCancellation = {
      refundStatus: "done",
      closureDate: "2026-11-05",
      closureMessage: "Closed for a private event",
      offers: [],
      rebooked: { startTime: "2026-11-08T02:00:00.000Z", manageToken: "tok-new" },
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { ...managedPayload, venueCancellation } })
    );

    const result = await makeClient().manageReservation("tok");
    expect(result.venueCancellation).toEqual(venueCancellation);
  });

  it("defaults the closure fields to null when an older API omits them", async () => {
    const venueCancellation = { refundStatus: "done", offers: [], rebooked: null };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { ...managedPayload, venueCancellation } })
    );

    const result = await makeClient().manageReservation("tok");
    expect(result.venueCancellation).toEqual({
      ...venueCancellation,
      closureDate: null,
      closureMessage: null,
    });
  });

  it("rejects an unknown refund status", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: { ...managedPayload, venueCancellation: { refundStatus: "weird", offers: [] } },
      })
    );

    await expect(makeClient().manageReservation("tok")).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("accepts a null venue", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { ...managedPayload, venue: null } }));

    const result = await makeClient().manageReservation("tok");
    expect(result.venue).toBeNull();
  });

  it("throws ApiValidationError on a malformed reservation status", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...managedPayload,
          reservation: { ...managedPayload.reservation, status: "BOGUS" },
        },
      })
    );

    await expect(makeClient().manageReservation("tok")).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("carries an optional venue.phone through", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...managedPayload,
          venue: { ...managedPayload.venue, phone: "+15035551234" },
        },
      })
    );

    const result = await makeClient().manageReservation("tok");
    expect(result.venue?.phone).toBe("+15035551234");
  });
});

describe("ReservationsClient.cancelManaged", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("DELETEs /public/v1/reservations/manage with the token as a Bearer header and unwraps data", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { status: "CANCELLED" } }));

    const result = await makeClient().cancelManaged("tok-abc");

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe("/public/v1/reservations/manage");
    expect(options?.method).toBe("DELETE");
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer tok-abc");
    expect(result).toEqual({ status: "CANCELLED" });
  });

  it("sends cancellationReason/cancellationNote as the JSON body when provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { status: "CANCELLED" } }));

    await makeClient().cancelManaged("tok-abc", {
      cancellationReason: "guest_cancelled",
      cancellationNote: "Change of plans",
    });

    const [, options] = mockFetch.mock.calls[0]!;
    expect(JSON.parse(options?.body as string)).toEqual({
      cancellationReason: "guest_cancelled",
      cancellationNote: "Change of plans",
    });
  });
});

describe("ReservationsClient.rebookManaged", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("POSTs the offer id with the token as a Bearer header and returns the new manage token", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          data: { reservationId: "res_2", startTime: "2026-11-06T02:00:00.000Z" },
          manageToken: "tok-new",
        },
        201
      )
    );

    const result = await makeClient().rebookManaged("tok-abc", "2026-11-06T02:00:00.000Z");

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe("/public/v1/reservations/manage/rebook");
    expect(options?.method).toBe("POST");
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer tok-abc");
    expect(JSON.parse(options?.body as string)).toEqual({ offerId: "2026-11-06T02:00:00.000Z" });
    expect(result).toEqual({
      reservationId: "res_2",
      startTime: "2026-11-06T02:00:00.000Z",
      manageToken: "tok-new",
    });
  });

  it("rejects a response without a manage token", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { reservationId: "res_2", startTime: "2026-11-06T02:00:00.000Z" } }, 201)
    );

    await expect(makeClient().rebookManaged("tok", "x")).rejects.toBeInstanceOf(ApiValidationError);
  });
});

describe("ReservationsClient.modifyManaged", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const modified = {
    id: "res_1",
    date: "2026-06-16",
    startTime: "20:00",
    endTime: "22:00",
    partySize: 4,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    status: "CONFIRMED",
    notes: null,
  };

  it("PATCHes /public/v1/reservations/manage with Bearer token, x-session-id and holdId", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { reservation: modified } }));

    const result = await makeClient().modifyManaged(
      "tok-abc",
      { partySize: 4 },
      { holdId: "hold_1", sessionId: "sess_1" }
    );

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe("/public/v1/reservations/manage");
    expect(options?.method).toBe("PATCH");
    const headers = options?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-abc");
    expect(headers["x-session-id"]).toBe("sess_1");
    expect(JSON.parse(options?.body as string)).toEqual({ partySize: 4, holdId: "hold_1" });
    expect(result).toEqual(modified);
  });

  it("omits x-session-id and holdId when no hold is passed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { reservation: modified } }));

    await makeClient().modifyManaged("tok-abc", { specialRequests: "window seat" });

    const [, options] = mockFetch.mock.calls[0]!;
    expect((options?.headers as Record<string, string>)["x-session-id"]).toBeUndefined();
    expect(JSON.parse(options?.body as string)).toEqual({ specialRequests: "window seat" });
  });
});

describe("ReservationsClient.manageReservation modification limits", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const base = {
    reservation: {
      id: "res_1",
      date: "2026-06-15",
      startTime: "19:00",
      endTime: "21:00",
      partySize: 4,
      guestName: null,
      guestEmail: null,
      status: "CONFIRMED",
      notes: null,
    },
    venue: { id: "v", name: "V", slug: "v", ianaTimezone: "UTC" },
  };

  it("accepts the nullable modification fields on the venue", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...base,
          venue: { ...base.venue, modificationCutoffHours: 4, maxPartySizeChange: null },
        },
      })
    );

    const result = await makeClient().manageReservation("tok");
    expect(result.venue?.modificationCutoffHours).toBe(4);
    expect(result.venue?.maxPartySizeChange).toBeNull();
  });

  it("still accepts a venue without the modification fields", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: base }));

    await expect(makeClient().manageReservation("tok")).resolves.toEqual(base);
  });
});
