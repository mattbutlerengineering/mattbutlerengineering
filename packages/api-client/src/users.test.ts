import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { UsersClient } from "./users.js";

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
  return new UsersClient(apiClient);
}

const fakeUser = {
  id: "u1",
  email: "alice@example.com",
  name: "Alice",
  role: "ADMIN",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("UsersClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests the correct URL with default pagination", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeUser], total: 1, page: 1, limit: 10 })
      );

      const client = makeClient();
      await client.list();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users?page=1&limit=10");
    });

    it("passes custom page and limit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 2, limit: 5 })
      );

      await makeClient().list(2, 5);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users?page=2&limit=5");
    });

    it("returns the paginated response", async () => {
      const body = { data: [fakeUser], total: 1, page: 1, limit: 10 };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const result = await makeClient().list();
      expect(result).toEqual(body);
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/users/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeUser }));

      await makeClient().get("u1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users/u1");
      expect(options?.method ?? "GET").toBe("GET");
    });

    it("unwraps data from ApiResponse", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeUser }));

      const result = await makeClient().get("u1");
      expect(result).toEqual(fakeUser);
    });
  });

  describe("me", () => {
    it("requests GET /api/v1/users/me", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeUser }));

      await makeClient().me();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users/me");
    });

    it("returns the current user", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeUser }));

      const result = await makeClient().me();
      expect(result).toEqual(fakeUser);
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/users with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeUser }));

      await makeClient().create({ email: "alice@example.com", name: "Alice" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toMatchObject({
        email: "alice@example.com",
        name: "Alice",
      });
    });

    it("returns the created user", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeUser }));

      const result = await makeClient().create({ email: "alice@example.com", name: "Alice" });
      expect(result).toEqual(fakeUser);
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/users/:id with body", async () => {
      const updated = { ...fakeUser, name: "Alicia" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().update("u1", { name: "Alicia" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users/u1");
      expect(options?.method).toBe("PATCH");
      expect(JSON.parse(options?.body as string)).toMatchObject({ name: "Alicia" });
    });
  });

  describe("delete", () => {
    it("sends DELETE /api/v1/users/:id", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await makeClient().delete("u1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users/u1");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("updatePreferences", () => {
    it("sends PATCH /api/v1/users/me/preferences with body", async () => {
      const updated = { ...fakeUser };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().updatePreferences({ theme: "dark" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/users/me/preferences");
      expect(options?.method).toBe("PATCH");
      expect(JSON.parse(options?.body as string)).toMatchObject({ theme: "dark" });
    });
  });

  describe("error handling", () => {
    it("propagates 404 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "User not found", statusCode: 404 }, 404)
      );

      await expect(makeClient().get("bad-id")).rejects.toThrow();
    });

    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(makeClient().list()).rejects.toThrow(TypeError);
    });
  });
});
