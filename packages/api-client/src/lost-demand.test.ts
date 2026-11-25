import { describe, it, expect, vi, beforeEach } from "vitest";
import { lostDemandEndpoints } from "@mbe/types";
import { ApiClient } from "./client.js";
import { ReservationsClient } from "./reservations.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const report = {
  venueId: "v1",
  from: "2026-06-01",
  to: "2026-06-28",
  total: 5,
  cells: [{ weekday: 5, hour: 19, searches: 3 }],
  anyTime: [{ weekday: 6, searches: 2 }],
};

function makeClient(): ReservationsClient {
  return new ReservationsClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));
}

function sentRequest(): { pathname: string; query: Record<string, string> } {
  const [url] = mockFetch.mock.calls[0]!;
  const parsed = new URL(url as string);
  return { pathname: parsed.pathname, query: Object.fromEntries(parsed.searchParams) };
}

describe("ReservationsClient.getLostDemandWhatIf", () => {
  const estimate = {
    venueId: "v1",
    from: "2026-10-28",
    to: "2026-11-24",
    weekday: 2,
    minute: 1290,
    outcome: "estimated",
    searches: 7,
    windowStart: 1260,
    windowEnd: 1320,
    minParty: null,
    maxParty: null,
    anyTimeSearches: 3,
  };

  it("sends the candidate seating and unwraps the envelope", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: estimate }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await makeClient().getLostDemandWhatIf({
      venueId: "v1",
      weekday: 2,
      time: "21:30",
      minParty: 2,
    });

    expect(result).toEqual(estimate);
    expect(sentRequest()).toEqual({
      pathname: lostDemandEndpoints.whatIf.path,
      query: { venueId: "v1", weekday: "2", time: "21:30", minParty: "2" },
    });
  });
});

describe("ReservationsClient.getLostDemand", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: report }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("sends venueId and the window and unwraps the envelope", async () => {
    const result = await makeClient().getLostDemand({
      venueId: "v1",
      from: "2026-06-01",
      to: "2026-06-28",
    });

    expect(result).toEqual(report);
    expect(sentRequest()).toEqual({
      pathname: lostDemandEndpoints.get.path,
      query: { venueId: "v1", from: "2026-06-01", to: "2026-06-28" },
    });
  });

  it("omits the window when the caller does, leaving the default to the server", async () => {
    await makeClient().getLostDemand({ venueId: "v1" });

    expect(sentRequest().query).toEqual({ venueId: "v1" });
  });
});
