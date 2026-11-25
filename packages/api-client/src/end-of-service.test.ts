import { describe, it, expect, vi, beforeEach } from "vitest";
import { endOfServiceEndpoints } from "@mbe/types";
import { ApiClient } from "./client.js";
import { ReservationsClient } from "./reservations.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const summary = {
  date: "2026-06-19",
  venueId: "v1",
  covers: 9,
  tableTurns: 3,
  noShows: 1,
  turnedAway: null,
};

function makeClient(): ReservationsClient {
  return new ReservationsClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));
}

function sentRequest(): { pathname: string; query: Record<string, string> } {
  const [url] = mockFetch.mock.calls[0]!;
  const parsed = new URL(url as string);
  return { pathname: parsed.pathname, query: Object.fromEntries(parsed.searchParams) };
}

describe("ReservationsClient.getEndOfServiceSummary", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: summary }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("sends venueId and date and unwraps the envelope", async () => {
    const result = await makeClient().getEndOfServiceSummary({ venueId: "v1", date: "2026-06-19" });

    expect(result).toEqual(summary);
    expect(sentRequest()).toEqual({
      pathname: endOfServiceEndpoints.get.path,
      query: { venueId: "v1", date: "2026-06-19" },
    });
  });

  it("omits date when the caller does, leaving the venue's today to the server", async () => {
    await makeClient().getEndOfServiceSummary({ venueId: "v1" });

    expect(sentRequest().query).toEqual({ venueId: "v1" });
  });
});
