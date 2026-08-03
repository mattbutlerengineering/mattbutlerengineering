import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fetchDailyDomainMetrics,
  parseDailyMetricsPayload,
  main,
} from "../collect-domain-metrics.mjs";

/** Sample counts-only payload shaped like #3665's route response. */
function samplePayload(overrides = {}) {
  return {
    data: {
      date: "2026-08-03",
      venueId: "venue-1",
      reservations: { pending: 2, confirmed: 5, cancelled: 1, completed: 3, noShow: 0 },
      deposits: { held: 4, applied: 3, refunded: 1, forfeited: 0 },
      ...overrides,
    },
  };
}

/** Builds a fetch stub that always returns `response` regardless of args. */
function stubFetch(response) {
  return async () => response;
}

const okResponse = (payload) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => payload,
});

describe("parseDailyMetricsPayload", () => {
  it("extracts date/venueId/reservations/deposits from a well-formed payload", () => {
    expect(parseDailyMetricsPayload(samplePayload())).toEqual(samplePayload().data);
  });

  it("throws when the payload is not an object", () => {
    expect(() => parseDailyMetricsPayload(null)).toThrow();
    expect(() => parseDailyMetricsPayload("nope")).toThrow();
  });

  it("throws when data.date or data.venueId is missing", () => {
    expect(() => parseDailyMetricsPayload({ data: { reservations: {}, deposits: {} } })).toThrow(
      /date|venueId/i
    );
  });

  it("throws when reservations or deposits counts are missing", () => {
    expect(() => parseDailyMetricsPayload({ data: { date: "2026-08-03", venueId: "v1" } })).toThrow(
      /reservations/i
    );
  });
});

describe("fetchDailyDomainMetrics", () => {
  it("returns ok:true with parsed counts on a 200 response", async () => {
    const result = await fetchDailyDomainMetrics({
      fetchImpl: stubFetch(okResponse(samplePayload())),
      venueId: "venue-1",
    });
    expect(result).toEqual({ ok: true, data: samplePayload().data });
  });

  it("returns ok:false without throwing on a network error", async () => {
    const fetchImpl = async () => {
      throw new Error("fetch failed: getaddrinfo ENOTFOUND");
    };
    const result = await fetchDailyDomainMetrics({ fetchImpl, venueId: "venue-1" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ENOTFOUND/);
  });

  it("returns ok:false without throwing on a non-2xx response", async () => {
    const result = await fetchDailyDomainMetrics({
      fetchImpl: stubFetch({ ok: false, status: 503, statusText: "Service Unavailable" }),
      venueId: "venue-1",
    });
    expect(result).toEqual({ ok: false, reason: "HTTP 503 Service Unavailable" });
  });

  it("returns ok:false without throwing when the 2xx body is malformed", async () => {
    const result = await fetchDailyDomainMetrics({
      fetchImpl: stubFetch(okResponse({ data: { date: "2026-08-03" } })),
      venueId: "venue-1",
    });
    expect(result.ok).toBe(false);
  });
});

describe("main", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "collect-domain-metrics-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const outFile = () => join(root, "metrics", "domain-metrics.jsonl");

  it("appends one row with the day's counts on a successful run", async () => {
    await main(
      { DOMAIN_METRICS_VENUE_ID: "venue-1" },
      {
        fetchImpl: stubFetch(okResponse(samplePayload())),
        root,
        now: () => new Date("2026-08-03T12:00:00.000Z"),
      }
    );

    const rows = readFileSync(outFile(), "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      collected_at: "2026-08-03T12:00:00.000Z",
      ...samplePayload().data,
    });
  });

  it("does not throw and writes no row when the API is unreachable", async () => {
    const fetchImpl = async () => {
      throw new Error("fetch failed: connection refused");
    };
    await expect(
      main({ DOMAIN_METRICS_VENUE_ID: "venue-1" }, { fetchImpl, root })
    ).resolves.not.toThrow();
    expect(existsSync(outFile())).toBe(false);
  });

  it("does not throw and writes no row on a non-2xx response", async () => {
    await expect(
      main(
        { DOMAIN_METRICS_VENUE_ID: "venue-1" },
        { fetchImpl: stubFetch({ ok: false, status: 401, statusText: "Unauthorized" }), root }
      )
    ).resolves.not.toThrow();
    expect(existsSync(outFile())).toBe(false);
  });

  it("skips without making a network call when DOMAIN_METRICS_VENUE_ID is unset", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return okResponse(samplePayload());
    };
    await main({}, { fetchImpl, root });
    expect(called).toBe(false);
    expect(existsSync(outFile())).toBe(false);
  });
});
