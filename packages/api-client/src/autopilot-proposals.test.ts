import { describe, it, expect, vi, beforeEach } from "vitest";
import { autopilotProposalsEndpoints } from "@mbe/types";
import { ApiClient } from "./client.js";
import { ReservationsClient } from "./reservations.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const proposals = { date: "2026-06-19", venueId: "v1", moves: [] };

describe("ReservationsClient.getAutopilotProposals", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: proposals }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("sends venueId and unwraps the envelope", async () => {
    const client = new ReservationsClient(
      new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 })
    );

    const result = await client.getAutopilotProposals({ venueId: "v1" });

    expect(result).toEqual(proposals);
    const [url] = mockFetch.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe(autopilotProposalsEndpoints.get.path);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ venueId: "v1" });
  });

  it("sends the service date the caller is showing", async () => {
    const client = new ReservationsClient(
      new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 })
    );

    await client.getAutopilotProposals({ venueId: "v1", date: "2026-06-19" });

    const [url] = mockFetch.mock.calls[0]!;
    expect(Object.fromEntries(new URL(url as string).searchParams)).toEqual({
      venueId: "v1",
      date: "2026-06-19",
    });
  });
});
