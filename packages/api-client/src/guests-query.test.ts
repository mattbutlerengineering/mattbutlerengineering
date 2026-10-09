import { describe, it, expect, vi, beforeEach } from "vitest";
import { guestsEndpoints } from "@mbe/types";
import { ApiClient } from "./client.js";
import { GuestsClient } from "./guests.js";

/**
 * The one facade behaviour route-contract cannot see: which caller params
 * land in the query string. Parity compares the definition's query SCHEMA to
 * the route's; every list/search query key is optional, so a facade that
 * dropped or swapped one would still typecheck and pass parity
 * (review.md, reviewer finding on 98dbf5862).
 */
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const emptyPage = {
  data: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
};

function makeClient(): GuestsClient {
  return new GuestsClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));
}

function sentQuery(): { pathname: string; query: Record<string, string> } {
  const [url] = mockFetch.mock.calls[0]!;
  const parsed = new URL(url as string);
  return { pathname: parsed.pathname, query: Object.fromEntries(parsed.searchParams) };
}

describe("GuestsClient query mapping", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(emptyPage), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("list sends venueId, page and limit as given", async () => {
    await makeClient().list({ venueId: "v1", page: 2, limit: 50 });
    expect(sentQuery()).toEqual({
      pathname: guestsEndpoints.list.path,
      query: { venueId: "v1", page: "2", limit: "50" },
    });
  });

  it("list omits page and limit when the caller does", async () => {
    await makeClient().list({ venueId: "v1" });
    expect(sentQuery().query).toEqual({ venueId: "v1" });
  });

  it("search sends venueId, query and hasNotVisitedInDays as given", async () => {
    await makeClient().search({ venueId: "v1", query: "Bob", hasNotVisitedInDays: 30 });
    expect(sentQuery()).toEqual({
      pathname: guestsEndpoints.search.path,
      query: { venueId: "v1", query: "Bob", hasNotVisitedInDays: "30" },
    });
  });
});
