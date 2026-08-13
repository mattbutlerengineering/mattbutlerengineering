import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deleteVenue, sweepSyntheticVenues, SYNTHETIC_VENUE_PREFIX } from "./journey-api.js";

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
    mockFetchOnce(409);

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: false, status: 409 });
  });

  it("reports ok: false and the real 500 status instead of discarding it", async () => {
    mockFetchOnce(500);

    const result = await deleteVenue("token", "venue-1");

    expect(result).toEqual({ ok: false, status: 500 });
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
      .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) } as never);

    const undeleted = await sweepSyntheticVenues("token");

    expect(undeleted).toHaveLength(1);
    expect(undeleted[0]).toContain(venue.name);
    expect(undeleted[0]).toContain("409");
  });
});
