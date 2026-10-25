import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiValidationError } from "./client.js";
import { VenueTeamClient } from "./venue-team.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient() {
  return new VenueTeamClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));
}

const team = {
  members: [{ userSub: "auth0|a", role: "manager", isViewer: true }],
  hostEmergencyClose: false,
  viewerRole: "manager",
};

describe("VenueTeamClient", () => {
  beforeEach(() => mockFetch.mockReset());

  it("gets the team for a venue", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: team }));

    expect(await makeClient().get("v 1")).toEqual(team);
    expect(mockFetch.mock.calls[0]![0]).toBe("https://api.test.com/api/v1/venues/v%201/team");
  });

  it("rejects a team response with an unknown role", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { ...team, viewerRole: "owner" } }));

    await expect(makeClient().get("v1")).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("PATCHes a member's role, encoding the Auth0 sub", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { userSub: "auth0|b", role: "host" } }));

    const member = await makeClient().setRole("v1", "auth0|b", "host");

    expect(member).toEqual({ userSub: "auth0|b", role: "host" });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/team/members/auth0%7Cb");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ role: "host" }));
  });

  it("PATCHes the Host emergency-close grant", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { hostEmergencyClose: true } }));

    expect(await makeClient().setHostEmergencyClose("v1", true)).toBe(true);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/venues/v1/team");
    expect(init?.body).toBe(JSON.stringify({ hostEmergencyClose: true }));
  });
});
