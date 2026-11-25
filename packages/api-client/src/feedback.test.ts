import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiClientError } from "./client.js";
import { FeedbackClient } from "./feedback.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const REQUEST = {
  type: "idea" as const,
  message: "Let me pin a table to a server.",
  context: { app: "hospitality", route: "/timeline", viewport: "1280x800", version: "abc1234" },
};

function makeClient() {
  return new FeedbackClient(new ApiClient({ baseUrl: "http://api.test", maxRetries: 0 }));
}

describe("FeedbackClient", () => {
  beforeEach(() => mockFetch.mockReset());

  it("submit posts to /api/gen/feedback and unwraps the issue", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { success: true, data: { issueNumber: 9, url: "https://github.com/o/r/issues/9" } },
        201
      )
    );

    const result = await makeClient().submit(REQUEST);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/gen/feedback");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual(REQUEST);
    expect(result).toEqual({ issueNumber: 9, url: "https://github.com/o/r/issues/9" });
  });

  it("submit surfaces the problem detail of a failure", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { type: "about:blank", title: "Bad Request", status: 400, detail: "Too short." },
        400
      )
    );

    const err = await makeClient()
      .submit(REQUEST)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).problemDetails?.detail).toBe("Too short.");
  });

  it("isAvailable reads the status probe", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { available: true } }));

    expect(await makeClient().isAvailable()).toBe(true);
    expect(mockFetch.mock.calls[0]![0]).toBe("http://api.test/api/gen/feedback/status");
  });
});
