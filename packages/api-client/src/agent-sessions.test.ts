import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSessionClient } from "./agent-sessions.js";
import { ApiClientError } from "./client.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

const baseSession = {
  id: "sess-1",
  status: "running",
  taskDescription: "Fix the bug",
  branchName: "fix/bug",
  prUrl: null,
  costUsd: null,
  errors: [],
};

describe("AgentSessionClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("createSession", () => {
    it("calls POST /v1/sessions and returns SessionSummary from envelope", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: baseSession }));

      const client = new AgentSessionClient({ baseUrl: "http://localhost:3003", maxRetries: 0 });
      const result = await client.createSession({ taskDescription: "Fix the bug" });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("http://localhost:3003/v1/sessions");
      expect(options?.method).toBe("POST");
      expect(result).toEqual(baseSession);
    });

    it("sends body as JSON", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: baseSession }));

      const client = new AgentSessionClient({ baseUrl: "http://localhost:3003", maxRetries: 0 });
      await client.createSession({
        taskDescription: "Do work",
        model: "claude-sonnet-4-6",
        maxBudgetUsd: 1.5,
      });

      const [, options] = mockFetch.mock.calls[0]!;
      const body = JSON.parse(options?.body as string);
      expect(body).toMatchObject({ taskDescription: "Do work", model: "claude-sonnet-4-6", maxBudgetUsd: 1.5 });
    });
  });

  describe("getSession", () => {
    it("calls GET /v1/sessions/:id and returns SessionSummary", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: baseSession }));

      const client = new AgentSessionClient({ baseUrl: "http://localhost:3003", maxRetries: 0 });
      const result = await client.getSession("sess-1");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("http://localhost:3003/v1/sessions/sess-1");
      expect(options?.method).toBe("GET");
      expect(result).toEqual(baseSession);
    });

    it("throws ApiClientError on 404", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Session not found", statusCode: 404 }, 404)
      );

      const client = new AgentSessionClient({ baseUrl: "http://localhost:3003", maxRetries: 0 });

      await expect(client.getSession("no-such-session")).rejects.toThrow(ApiClientError);
    });
  });

  describe("listSessions", () => {
    it("calls GET /v1/sessions and returns PaginatedSessions", async () => {
      const paginatedResponse = {
        data: [baseSession],
        pagination: { page: 1, total: 1, totalPages: 1 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(paginatedResponse));

      const client = new AgentSessionClient({ baseUrl: "http://localhost:3003", maxRetries: 0 });
      const result = await client.listSessions();

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0]!;
      expect(String(url)).toMatch(/^http:\/\/localhost:3003\/v1\/sessions/);
      expect(result).toEqual(paginatedResponse);
    });

    it("appends query params when provided", async () => {
      const paginatedResponse = {
        data: [],
        pagination: { page: 2, total: 0, totalPages: 0 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(paginatedResponse));

      const client = new AgentSessionClient({ baseUrl: "http://localhost:3003", maxRetries: 0 });
      await client.listSessions({ status: "running", page: 2, limit: 10 });

      const [url] = mockFetch.mock.calls[0]!;
      const urlStr = String(url);
      expect(urlStr).toContain("status=running");
      expect(urlStr).toContain("page=2");
      expect(urlStr).toContain("limit=10");
    });
  });

  describe("cancelSession", () => {
    it("calls POST /v1/sessions/:id/cancel and returns SessionSummary", async () => {
      const cancelled = { ...baseSession, status: "cancelled" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: cancelled }));

      const client = new AgentSessionClient({ baseUrl: "http://localhost:3003", maxRetries: 0 });
      const result = await client.cancelSession("sess-1");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("http://localhost:3003/v1/sessions/sess-1/cancel");
      expect(options?.method).toBe("POST");
      expect(result.status).toBe("cancelled");
    });
  });
});
