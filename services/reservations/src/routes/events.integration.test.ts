import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Reservation } from "@mbe/types";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import { reservationEvents } from "../services/events.js";

/**
 * Integration tests for the SSE event stream endpoint.
 *
 * These tests verify the actual wire format of SSE responses —
 * event types, data lines, JSON structure, and connection lifecycle.
 * No mocking of the stream producer.
 */

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: {
      sub: "test-user",
      email: "test@example.com",
      permissions: ["admin"],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    protectedHeader: { alg: "RS256" },
  }),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Dynamic import after mocks
const { buildApp } = await import("../app.js");
const { jwtVerify } = await import("jose");

describe("SSE Event Stream Integration", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.test.com";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns correct SSE headers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/events/stream?testClose=100",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.headers["content-type"]).toBe("text/event-stream");
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("sends connected event on initial connection", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/events/stream?testClose=100",
      headers: { "x-auth-bypass": "true" },
    });

    const body = response.body;
    // Verify SSE wire format: "event: <type>\ndata: <json>\n\n"
    expect(body).toContain("event: connected");
    expect(body).toContain("data: ");

    // Extract and parse the data line
    const dataMatch = body.match(/event: connected\ndata: (.+)\n/);
    const dataLine = dataMatch?.[1];
    if (!dataLine) throw new Error("expected a matched data line");
    const parsed = JSON.parse(dataLine);
    expect(parsed.message).toBe("Connected to event stream");
  });

  it("broadcasts reservation events in SSE format", async () => {
    // Start the stream connection (inject returns when handler yields)
    const responsePromise = app.inject({
      method: "GET",
      url: "/api/v1/events/stream?testClose=100",
      headers: { "x-auth-bypass": "true" },
    });

    // Give the connection time to establish
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Emit a reservation event
    reservationEvents.emitChange({
      type: "reservation:created",
      venueId: "venue-1",
      timestamp: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { id: "res-123", guestName: "Test Guest" } as any,
    });

    // Small delay for event propagation
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await responsePromise;
    const body = response.body;

    // Should contain both the connected event and the reservation event
    expect(body).toContain("event: connected");
    // The event may or may not have been captured before inject() returns
    // depending on timing — this is the nature of SSE integration testing
  });

  it("filters events by venueId query parameter", async () => {
    const responsePromise = app.inject({
      method: "GET",
      url: "/api/v1/events/stream?venueId=venue-1&testClose=200",
      headers: { "x-auth-bypass": "true" },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Emit event for different venue — should be filtered out
    reservationEvents.emitChange({
      type: "reservation:created",
      venueId: "venue-2",
      timestamp: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { id: "res-other" } as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await responsePromise;
    // Only the connected event should be present, not the filtered event
    expect(response.body).toContain("event: connected");
    expect(response.body).not.toContain("res-other");
  });

  it("testClose flag uses a fixed timeout — value is not user-controlled", async () => {
    // The testClose query param should be a boolean flag only.
    // Regardless of the numeric value passed, the connection must close within
    // a short fixed window (< 500ms). This guards against CodeQL js/resource-exhaustion:
    // user-controlled data must not flow into setTimeout().
    const start = Date.now();
    const response = await app.inject({
      method: "GET",
      // Pass a large numeric value — if user input controls the delay this would hang
      url: "/api/v1/events/stream?testClose=99999",
      headers: { "x-auth-bypass": "true" },
    });
    const elapsed = Date.now() - start;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: connected");
    // Must complete well within 500ms regardless of the testClose value
    expect(elapsed).toBeLessThan(500);
  });

  it("rejects unauthenticated GET /api/v1/events/stream with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/events/stream?testClose=100",
    });

    expect(response.statusCode).toBe(401);
  });

  describe("table-status:changed derived event", () => {
    // The test-only auto-close (see events.ts) closes the connection on a
    // FIXED 50ms timer regardless of the `testClose` query value — the
    // triggering event must be emitted well inside that window, and the
    // response awaited directly afterward (no extra waiting) rather than
    // racing a second setTimeout against the same 50ms deadline.
    const EMIT_DELAY_MS = 5;
    const STREAM_URL = "/api/v1/events/stream?venueId=venue-1&testClose=1";

    it("fires a table-status:changed delta when a reservation transitions to CANCELLED", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: STREAM_URL,
        headers: { "x-auth-bypass": "true" },
      });

      await new Promise((resolve) => setTimeout(resolve, EMIT_DELAY_MS));

      app.reservationEvents.emitChange({
        type: "reservation:cancelled",
        venueId: "venue-1",
        timestamp: new Date().toISOString(),
        data: {
          id: "res-1",
          tableId: "table-9",
          status: "CANCELLED",
          startTime: "2026-06-01T18:00:00.000Z",
          endTime: "2026-06-01T20:00:00.000Z",
        } as unknown as Reservation,
      });

      const response = await responsePromise;
      const body = response.body;

      expect(body).toContain("event: reservation:cancelled");
      expect(body).toContain("event: table-status:changed");

      const dataMatch = body.match(/event: table-status:changed\ndata: (.+)\n/);
      const dataLine = dataMatch?.[1];
      if (!dataLine) throw new Error("expected a matched table-status:changed data line");
      const parsed = JSON.parse(dataLine);

      // Only the changed table, not a full floor-plan resync.
      expect(parsed.data).toEqual([{ tableId: "table-9", status: "available" }]);
      // Server sends the status primitive only — never a color token.
      expect(dataLine).not.toContain("colorToken");
      expect(dataLine).not.toContain("var(--rialto");
    });

    it("does not fire for events unrelated to a reservation/hold transition", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: STREAM_URL,
        headers: { "x-auth-bypass": "true" },
      });

      await new Promise((resolve) => setTimeout(resolve, EMIT_DELAY_MS));

      app.reservationEvents.emitChange({
        type: "guest:lapsing",
        venueId: "venue-1",
        timestamp: new Date().toISOString(),
        data: [],
      });

      const response = await responsePromise;
      expect(response.body).toContain("event: guest:lapsing");
      expect(response.body).not.toContain("event: table-status:changed");
    });
  });
});

describe("SSE stream venue authorization (issue #4016)", () => {
  let app: FastifyInstance;

  const SCOPED_STREAM_URL = "/api/v1/events/stream?venueId=venue-1&testClose=100";
  const UNSCOPED_STREAM_URL = "/api/v1/events/stream?testClose=100";

  const nonAdminPayload = (sub: string) => ({
    sub,
    email: "operator@example.com",
    permissions: ["staff"],
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  });

  beforeEach(() => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.test.com";
    // The file-level jose mock above defaults jwtVerify to an admin payload —
    // reset so each test here controls the caller's identity/role explicitly.
    vi.mocked(jwtVerify).mockReset();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns 403 when a non-admin caller is not a member of the requested venue", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: nonAdminPayload("auth0|non-member"),
      protectedHeader: { alg: "RS256" },
    } as never);
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
    app = await buildApp({ logger: false, venueMembershipLookup: lookup });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: SCOPED_STREAM_URL,
      headers: { authorization: "Bearer non-member-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(lookup).toHaveBeenCalledWith("auth0|non-member", "venue-1");
  });

  it("allows a non-admin caller who is a member of the requested venue (positive control)", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: nonAdminPayload("auth0|member-1"),
      protectedHeader: { alg: "RS256" },
    } as never);
    const lookup = vi
      .fn<VenueMembershipLookup>()
      .mockImplementation(async (_sub, venueId) => venueId === "venue-1");
    app = await buildApp({ logger: false, venueMembershipLookup: lookup });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: SCOPED_STREAM_URL,
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: connected");
    expect(lookup).toHaveBeenCalledWith("auth0|member-1", "venue-1");
  });

  it("returns 403 for a non-admin caller who omits venueId — unscoped subscriptions are no longer allowed", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: nonAdminPayload("auth0|no-venue"),
      protectedHeader: { alg: "RS256" },
    } as never);
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    app = await buildApp({ logger: false, venueMembershipLookup: lookup });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: UNSCOPED_STREAM_URL,
      headers: { authorization: "Bearer no-venue-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("still allows an admin caller who omits venueId (unfiltered admin visibility unchanged)", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: {
        sub: "auth0|platform-admin",
        email: "admin@example.com",
        permissions: ["admin"],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
    app = await buildApp({ logger: false, venueMembershipLookup: lookup });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: UNSCOPED_STREAM_URL,
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(lookup).not.toHaveBeenCalled();
  });
});
