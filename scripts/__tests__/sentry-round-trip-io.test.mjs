import { describe, it, expect, vi } from "vitest";
import { provokeCapturedError, findMarkedEvent } from "../sentry-round-trip.mjs";

const MARKER = "mbe-round-trip-20261001T000000000Z-abc";
const target = { url: "https://api.example.test/api/v1/users/health" };

/** A fake fetch answering with the given statuses in order, then the last forever. */
function fetchWithStatuses(statuses, body = []) {
  let call = 0;
  return vi.fn(async () => {
    const httpStatus = statuses[Math.min(call, statuses.length - 1)];
    call += 1;
    return {
      ok: httpStatus >= 200 && httpStatus < 300,
      status: httpStatus,
      statusText: `status ${httpStatus}`,
      json: async () => body,
    };
  });
}

describe("provokeCapturedError", () => {
  it("reports triggered once a 429 arrives within the request budget, carrying the marker", async () => {
    const fetchImpl = fetchWithStatuses([200, 200, 429]);
    const result = await provokeCapturedError(target, MARKER, fetchImpl);
    expect(result).toEqual({ triggered: true, sent: 3 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${target.url}?rt=${MARKER}`);
    expect(init.headers["x-request-id"]).toBe(MARKER);
  });

  it("reports not triggered, with a reason, when 150 requests never provoke a 429 (SC-5)", async () => {
    const fetchImpl = fetchWithStatuses([200]);
    const result = await provokeCapturedError(target, MARKER, fetchImpl);
    expect(result.triggered).toBe(false);
    expect(result.reason).toMatch(/150/);
    expect(fetchImpl).toHaveBeenCalledTimes(150);
  });
});

describe("findMarkedEvent", () => {
  it("throws on a non-2xx Sentry response instead of reporting nothing found", async () => {
    await expect(
      findMarkedEvent("org", "users-api", MARKER, "token", fetchWithStatuses([500]))
    ).rejects.toThrow(/500/);
  });

  it("returns undefined for an empty result", async () => {
    expect(
      await findMarkedEvent("org", "users-api", MARKER, "token", fetchWithStatuses([200], []))
    ).toBeUndefined();
  });

  it("returns the first event the matcher accepts, querying the project by marker with a timeout", async () => {
    const hit = { id: "e1", tags: [{ key: "requestId", value: MARKER }] };
    const fetchImpl = fetchWithStatuses([200], [{ id: "e0", tags: [] }, hit]);
    expect(await findMarkedEvent("org", "users-api", MARKER, "token", fetchImpl)).toBe(hit);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      `https://sentry.io/api/0/projects/org/users-api/events/?query=${encodeURIComponent(MARKER)}`
    );
    expect(init.headers.Authorization).toBe("Bearer token");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a caller-supplied matcher", async () => {
    const event = { id: "b1", title: `Error: ${MARKER}` };
    const fetchImpl = fetchWithStatuses([200], [event]);
    const matcher = (candidate) => candidate.title.includes(MARKER);
    expect(await findMarkedEvent("org", "hospitality", MARKER, "token", fetchImpl, matcher)).toBe(
      event
    );
  });
});
