import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiClientError } from "./client.js";
import { AvailabilityClient } from "./availability.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const client = () =>
  new AvailabilityClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));

const DECISION = {
  serviceDate: "2026-11-26",
  decision: "open_as_usual",
  createdAt: "2026-11-08T10:00:00.000Z",
};
const BASE = "https://api.test.com/api/v1/venues/v1/availability/holiday-decisions";

describe("AvailabilityClient holiday decisions", () => {
  beforeEach(() => mockFetch.mockReset());

  it("listHolidayDecisions reads the range", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [DECISION] }));

    const rows = await client().listHolidayDecisions("v1", {
      from: "2026-11-08",
      to: "2027-11-08",
    });

    expect(rows).toEqual([DECISION]);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(`${BASE}?from=2026-11-08&to=2027-11-08`);
  });

  it("setHolidayDecision PUTs the decision to the date", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: DECISION }));

    expect(await client().setHolidayDecision("v1", "2026-11-26", "open_as_usual")).toEqual(
      DECISION
    );

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE}/2026-11-26`);
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ decision: "open_as_usual" });
  });

  it("clearHolidayDecision DELETEs the date and returns nothing", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    expect(await client().clearHolidayDecision("v1", "2026-11-26")).toBeUndefined();

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE}/2026-11-26`);
    expect(init?.method).toBe("DELETE");
  });

  it("rejects a decision the bundled schema does not know", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ ...DECISION, decision: "something_new" }] })
    );

    await expect(
      client().listHolidayDecisions("v1", { from: "2026-11-08", to: "2026-11-09" })
    ).rejects.toThrow();
  });

  it("surfaces a 404 from a server without the routes", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ type: "about:blank", title: "Not Found", status: 404 }, 404)
    );

    await expect(
      client().setHolidayDecision("v1", "2026-11-26", "open_as_usual")
    ).rejects.toBeInstanceOf(ApiClientError);
  });
});
