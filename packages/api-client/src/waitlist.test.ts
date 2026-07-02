import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiValidationError } from "./client.js";
import { WaitlistClient } from "./waitlist.js";

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
  return new WaitlistClient(apiClient);
}

const joinPayload = {
  venueId: "v1",
  partySize: 4,
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
};

describe("WaitlistClient.join", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends POST /public/v1/venues/:slug/waitlist with the payload", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { position: 3, estimatedWaitMinutes: 45 } })
    );

    await makeClient().join("the-oak-table", joinPayload);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/public/v1/venues/the-oak-table/waitlist");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual(joinPayload);
  });

  it("unwraps and returns the validated waitlist join result", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { position: 3, estimatedWaitMinutes: 45 } })
    );

    const result = await makeClient().join("the-oak-table", joinPayload);
    expect(result).toEqual({ position: 3, estimatedWaitMinutes: 45 });
  });

  it("throws ApiValidationError when the response is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { position: 3 } }));

    await expect(makeClient().join("the-oak-table", joinPayload)).rejects.toBeInstanceOf(
      ApiValidationError
    );
  });

  it("propagates errors from the server", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Bad Request", message: "Invalid payload", statusCode: 400 }, 400)
    );

    await expect(makeClient().join("the-oak-table", joinPayload)).rejects.toThrow();
  });
});
