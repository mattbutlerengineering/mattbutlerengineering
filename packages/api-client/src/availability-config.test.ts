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
});
