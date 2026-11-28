import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// The MCP route's own 503 check (below) only needs `venues.list` to reject; a
// real unreachable-host call rejects just as fast, but api-client's default
// retry (3 attempts, exponential backoff) adds ~7s of real sleeps between
// attempts first.
vi.mock("@mbe/api-client", () => ({
  createApiClient: () => ({
    venues: { list: vi.fn().mockRejectedValue(new TypeError("fetch failed")) },
  }),
}));

import { buildApp } from "./app.js";
import { db } from "./services/database.js";

describe("App factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("builds and starts the app", async () => {
    const app = await buildApp({ logger: false });
    expect(app).toBeDefined();
    await app.close();
  });

  it("shuts the database down when the app closes (#6373)", async () => {
    vi.mocked(db.shutdown).mockClear();
    const app = await buildApp({ logger: false });
    await app.ready();
    expect(db.shutdown).not.toHaveBeenCalled();

    await app.close();

    expect(db.shutdown).toHaveBeenCalledTimes(1);
  });

  it("lets a personal access token reach /api/gen/mcp past the global JWT hook", async () => {
    process.env.AUTH_AUTHORITY = "https://auth.example.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.API_BASE_URL = "http://127.0.0.1:1";
    const app = await buildApp({ logger: false });
    const headers = { authorization: "Bearer mbe_pat_not_a_jwt" };
    // A non-excluded route: the global hook rejects a non-JWT bearer.
    const hook = await app.inject({ method: "POST", url: "/api/gen/agent", headers, payload: {} });
    expect(hook.statusCode).toBe(401);
    // /api/gen/mcp: the route's own check answers (the API is unreachable, so 503, not the hook's 401).
    const mcp = await app.inject({ method: "POST", url: "/api/gen/mcp", headers, payload: {} });
    expect(mcp.statusCode).not.toBe(401);
    await app.close();
  });
});
