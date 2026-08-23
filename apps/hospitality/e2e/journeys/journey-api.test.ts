import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  deleteVenue,
  readTokenPermissions,
  resolveNonAdminAuthEnv,
  sweepSyntheticVenues,
  SYNTHETIC_VENUE_PREFIX,
} from "./journey-api.js";

// Unit tests for the venue-delete status-surfacing fix (#4152). Run by
// vitest, not Playwright — same reasoning as journey-recorder.test.ts: the
// PR-time config testIgnores the whole journeys directory and the journey
// config only matches *.spec.ts, so this file is in neither suite.

function mockFetchOnce(status: number, body: unknown = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })
  );
}

describe("deleteVenue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports ok: true and the 204 status on success", async () => {
    mockFetchOnce(204);

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: true, status: 204 });
  });

  it("reports ok: true and the 404 status when already gone", async () => {
    mockFetchOnce(404);

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: true, status: 404 });
  });

  it("reports ok: false and the real 409 status instead of discarding it", async () => {
    // A 409 now triggers one cleanup-and-retry (see the dedicated tests below);
    // stub the full sequence so this test still isolates status surfacing.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) })
        .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) })
    );

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: false, status: 409 });
  });

  it("reports ok: false and the real 500 status instead of discarding it", async () => {
    mockFetchOnce(500);

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: false, status: 500 });
  });

  it("on 409, deletes the venue's floor plans (the onboarding-created blocker) and retries once", async () => {
    const floorPlan = { id: "floor-plan-1" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // 1. initial delete -> blocked by dependents
        .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) })
        // 2. list floor plans for the venue
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [floorPlan] }),
        })
        // 3. delete that floor plan (cascades its tables server-side)
        .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })
        // 4. retry the venue delete -> succeeds now that the blocker is gone
        .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })
    );

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: true, status: 204 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/v1/floor-plans?venueId=venue-1"),
      expect.objectContaining({ method: "GET" })
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/api/v1/floor-plans/floor-plan-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("does not send a Content-Type header on the bodyless DELETE (#4153)", async () => {
    // Fastify's content-type parser rejects a DELETE that declares
    // application/json with a zero-length body (FST_ERR_CTP_EMPTY_JSON_BODY,
    // HTTP 400) before the route handler ever runs. No call site here sends
    // a body, so the header must not be set.
    mockFetchOnce(204);

    await deleteVenue("token", "venue-1");

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Content-Type");
  });

  it("on 409, retries only once and reports the final status when dependents remain (e.g. real guest/reservation data)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) })
        .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) })
    );

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: false, status: 409 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });
});

describe("sweepSyntheticVenues", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes the real HTTP status in the leftover report, not just the name", async () => {
    const venue = { id: "venue-1", name: `${SYNTHETIC_VENUE_PREFIX}stale` };
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [venue] }),
      } as never)
      .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) } as never)
      // cleanup-and-retry: floor-plan list comes back empty, retried delete still 409
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as never)
      .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) } as never);

    const undeleted = await sweepSyntheticVenues("token");

    expect(undeleted).toHaveLength(1);
    expect(undeleted[0]).toContain(venue.name);
    expect(undeleted[0]).toContain("409");
  });
});

describe("resolveNonAdminAuthEnv", () => {
  it("overrides only the credentials, keeping tenant/client/audience shared", () => {
    const resolved = resolveNonAdminAuthEnv({
      E2E_AUTH0_DOMAIN: "tenant.us.auth0.com",
      E2E_AUTH0_CLIENT_ID: "client-1",
      E2E_AUTH0_AUDIENCE: "https://api.example.com",
      E2E_AUTH_EMAIL: "admin@example.com",
      E2E_AUTH_PASSWORD: "admin-secret",
      E2E_NONADMIN_AUTH_EMAIL: "operator@example.com",
      E2E_NONADMIN_AUTH_PASSWORD: "operator-secret",
    });

    expect(resolved["E2E_AUTH_EMAIL"]).toBe("operator@example.com");
    expect(resolved["E2E_AUTH_PASSWORD"]).toBe("operator-secret");
    expect(resolved["E2E_AUTH0_DOMAIN"]).toBe("tenant.us.auth0.com");
    expect(resolved["E2E_AUTH0_CLIENT_ID"]).toBe("client-1");
  });

  it("throws rather than silently falling back to the ADMIN credentials", () => {
    // Falling back would run the bootstrap case as an admin, which takes the
    // guard's skip-the-lookup branch — the journey would pass while proving
    // nothing about the feature it exists to exercise.
    expect(() =>
      resolveNonAdminAuthEnv({
        E2E_AUTH0_DOMAIN: "tenant.us.auth0.com",
        E2E_AUTH0_CLIENT_ID: "client-1",
        E2E_AUTH0_AUDIENCE: "https://api.example.com",
        E2E_AUTH_EMAIL: "admin@example.com",
        E2E_AUTH_PASSWORD: "admin-secret",
      })
    ).toThrow(/E2E_NONADMIN_AUTH_EMAIL/);
  });

  it("names every missing variable at once", () => {
    expect(() =>
      resolveNonAdminAuthEnv({ E2E_NONADMIN_AUTH_EMAIL: "operator@example.com" })
    ).toThrow(/E2E_NONADMIN_AUTH_PASSWORD/);
  });
});

describe("readTokenPermissions", () => {
  const encode = (payload: unknown) =>
    `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

  it("reads the permissions claim from an access token", () => {
    expect(readTokenPermissions(encode({ sub: "auth0|x", permissions: ["read:venues"] }))).toEqual([
      "read:venues",
    ]);
  });

  it("returns an empty list when the claim is absent", () => {
    expect(readTokenPermissions(encode({ sub: "auth0|x" }))).toEqual([]);
  });

  it("throws on a malformed token rather than reporting no permissions", () => {
    // Returning [] here would read as "not an admin" and let the journey
    // assert its identity against a token it never actually parsed.
    expect(() => readTokenPermissions("not-a-jwt")).toThrow();
  });
});
