import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiClientError } from "./client.js";
import { AvailabilityClient } from "./availability.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = () =>
  new AvailabilityClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));

const CONFIG = {
  schedules: [{ id: "sch-1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

const PREVIEW_RESULT = {
  version: 2,
  days: [{ serviceDate: "2026-11-01", added: [1050], removed: [] }],
  focusDay: {
    serviceDate: "2026-11-01",
    label: "Regular",
    scheduleId: "sch-1",
    serviceCount: 0,
    closures: [],
    bookingOpen: { online: true, phone: true, waitlist: true },
    services: [],
  },
  stranded: { total: 0, offset: 0, items: [] },
};

describe("AvailabilityClient config API", () => {
  beforeEach(() => mockFetch.mockReset());

  it("getConfig reads /api/v1/venues/:id/availability/config", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { config: CONFIG, version: 2, source: "rows" } })
    );

    const state = await client().getConfig("v1");

    expect(state).toEqual({ config: CONFIG, version: 2, source: "rows" });
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://api.test.com/api/v1/venues/v1/availability/config"
    );
  });

  it("saveConfig PUTs the body and returns the new version", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { version: 3, changeId: "chg-1" } }));
    const body = { expectedVersion: 2, changes: { upsert: { schedules: CONFIG.schedules } } };

    const result = await client().saveConfig("v1", body as never);

    expect(result).toEqual({ version: 3, changeId: "chg-1" });
    const [, init] = mockFetch.mock.calls[0]!;
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("saveConfig surfaces a version conflict's winning change", async () => {
    const winningChange = {
      id: "chg-9",
      actorId: "auth0|ana",
      at: "2026-10-25T18:42:00.000Z",
      kind: "config",
      summary: "Availability updated",
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "Availability changed since you loaded it.",
          code: "version-conflict",
          winningChange,
        },
        409
      )
    );

    const error = await client()
      .saveConfig("v1", { expectedVersion: 1, changes: {} } as never)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).problemDetails).toMatchObject({
      code: "version-conflict",
      winningChange,
    });
  });

  it("listDays reads the range from the days endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await client().listDays("v1", { from: "2026-11-01", to: "2026-11-30" });

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://api.test.com/api/v1/venues/v1/availability/days?from=2026-11-01&to=2026-11-30"
    );
  });

  it("listChanges reads a filtered page of the history endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { total: 0, offset: 0, items: [] } }));

    const page = await client().listChanges("v1", { kind: "config", limit: 10, offset: 20 });

    expect(page).toEqual({ total: 0, offset: 0, items: [] });
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://api.test.com/api/v1/venues/v1/availability/changes?kind=config&limit=10&offset=20"
    );
  });

  it("revertChange POSTs the expected version and surfaces guests-notified", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { version: 5, changeId: "chg-2" } }));

    const saved = await client().revertChange("v1", "chg-1", 4);

    expect(saved).toEqual({ version: 5, changeId: "chg-2" });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/availability/changes/chg-1/revert");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 4 });

    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "x",
          code: "guests-notified",
        },
        409
      )
    );
    const error = await client()
      .revertChange("v1", "chg-1", 5)
      .catch((e: unknown) => e);
    expect((error as ApiClientError).problemDetails).toMatchObject({ code: "guests-notified" });
  });

  it("getClosureImpact POSTs the draft rule to /closures/impact", async () => {
    const impact = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: impact }));
    const rule = {
      id: "dr-new",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    } as const;

    const result = await client().getClosureImpact("v1", rule);

    expect(result).toEqual(impact);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/closures/impact");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ rule });
  });

  it("createClosure POSTs the body with the Idempotency-Key header", async () => {
    const result = {
      ruleId: "dr-new",
      version: 5,
      changeId: "chg-1",
      outcomes: { cancel: 1, move: 0, keep_notify: 0, keep_silent: 0 },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: result }));
    const body = {
      expectedVersion: 4,
      rule: {
        id: "dr-new",
        kind: "closure" as const,
        targetKind: "venue" as const,
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
      },
      decisions: [{ groupKey: "2026-12-24:closed", action: "cancel" as const }],
    };

    expect(await client().createClosure("v1", body, "key-1")).toEqual(result);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/closures");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("key-1");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("reopenClosure DELETEs the rule with tellCancelledGuests", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { version: 6, changeId: "chg-2" } }));

    expect(await client().reopenClosure("v1", "dr-new", true)).toEqual({
      version: 6,
      changeId: "chg-2",
    });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/closures/dr-new");
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ tellCancelledGuests: true });
  });

  it("setTonight POSTs the change to /tonight", async () => {
    const result = {
      ruleId: "t-1",
      version: 5,
      changeId: "chg-1",
      serviceDate: "2026-10-25",
      expiresAt: "2026-10-26T11:00:00.000Z",
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: result }));
    const body = {
      expectedVersion: 4,
      ruleId: "t-1",
      change: { type: "pause_online" as const },
    };

    expect(await client().setTonight("v1", body)).toEqual(result);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/tonight");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("endTonight DELETEs /tonight/:ruleId", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { version: 6, changeId: "chg-2" } }));

    expect(await client().endTonight("v1", "t-1")).toEqual({ version: 6, changeId: "chg-2" });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/tonight/t-1");
    expect(init?.method).toBe("DELETE");
  });

  it("checkBooking posts the phone booking to the check endpoint and returns the verdict", async () => {
    const verdict = { kind: "soft", limits: ["pacing"], message: "This booking is over." };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: verdict }));
    const body = {
      start: "2026-11-06T19:00:00.000Z",
      end: "2026-11-06T20:30:00.000Z",
      partySize: 4,
      channel: "phone",
    } as const;

    const result = await client().checkBooking("v1", body);

    expect(result).toEqual(verdict);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://api.test.com/api/v1/venues/v1/availability/check"
    );
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(body),
    });
  });

  it("previewConfig POSTs the draft and returns the preview", async () => {
    const result = PREVIEW_RESULT;
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: result }));
    const body = {
      draft: { changes: { upsert: {}, remove: {} } },
      scope: { from: "2026-11-01" },
      focusDate: "2026-11-01",
    };

    const preview = await client().previewConfig("v1", body as never);

    expect(preview).toEqual(result);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://api.test.com/api/v1/venues/v1/availability/preview"
    );
    expect(mockFetch.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("previewConfig retries a gateway failure, since a preview writes nothing", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ title: "Bad Gateway", status: 502 }, 502))
      .mockResolvedValueOnce(jsonResponse({ data: PREVIEW_RESULT }));
    const retrying = new AvailabilityClient(
      new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 1 })
    );

    await retrying.previewConfig("v1", {} as never);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
