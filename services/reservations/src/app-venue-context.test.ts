import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { DomainServices } from "./services/domain-services.js";

/**
 * ADR-026 part 6/7: the venue-context middleware (built in #5252) is wired
 * into the app bootstrap as a global preHandler so `app.venue_id` is set for
 * the RLS policies enabled by parts 2-4 before any route's query runs.
 */

const tableService = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  delete: vi.fn(),
} as unknown as DomainServices["tableService"];

const { executeRawMock } = vi.hoisted(() => ({ executeRawMock: vi.fn().mockResolvedValue(0) }));

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({ prisma: { $executeRaw: executeRawMock } });
});

describe("venue-context middleware wiring", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    executeRawMock.mockClear();
    app = await buildApp({ logger: false, services: { tableService } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("sets app.venue_id via set_config() before an authenticated venue-scoped route's query runs", async () => {
    vi.mocked(tableService.list).mockResolvedValueOnce({
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tables?venueId=venue-42",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(200);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    const values = executeRawMock.mock.calls[0]?.slice(1);
    expect(values).toEqual(["venue-42"]);
  });

  it("does not set app.venue_id when no venue id is resolvable (default-deny, ADR-026 §4)", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(executeRawMock).not.toHaveBeenCalled();
  });
});
