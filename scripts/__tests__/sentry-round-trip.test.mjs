import { describe, it, expect } from "vitest";
import {
  buildRoundTripMarker,
  eventMatchesMarker,
  roundTripExitCode,
  shouldKeepPolling,
  nextPollDelayMs,
} from "../sentry-round-trip.mjs";

describe("buildRoundTripMarker", () => {
  it("is recognisable as this check's own traffic", () => {
    // An operator reading Sentry or a rate-limit log has to be able to tell
    // this apart from a real incident at a glance.
    expect(buildRoundTripMarker("2026-09-02T07:00:00.000Z", "abc123")).toMatch(/^mbe-round-trip-/);
  });

  it("is unique per run so a stale event can never satisfy a later check", () => {
    const a = buildRoundTripMarker("2026-09-02T07:00:00.000Z", "abc123");
    const b = buildRoundTripMarker("2026-09-02T07:00:00.000Z", "def456");
    expect(a).not.toBe(b);
  });

  it("is safe to put in a URL and an HTTP header", () => {
    const marker = buildRoundTripMarker("2026-09-02T07:00:00.000Z", "abc123");
    expect(marker).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(encodeURIComponent(marker)).toBe(marker);
  });
});

describe("eventMatchesMarker", () => {
  const marker = "mbe-round-trip-20260902T070000000Z-abc123";

  it("matches on the requestId tag the Sentry plugin sets", () => {
    const event = { tags: [{ key: "requestId", value: marker }] };
    expect(eventMatchesMarker(event, marker)).toBe(true);
  });

  it("matches on the url tag as an independent second marker", () => {
    // If x-request-id propagation ever regresses, the URL still carries it.
    const event = { tags: [{ key: "url", value: `/api/v1/users/health?rt=${marker}` }] };
    expect(eventMatchesMarker(event, marker)).toBe(true);
  });

  it("does not match another run's event", () => {
    const event = { tags: [{ key: "requestId", value: "mbe-round-trip-other-run" }] };
    expect(eventMatchesMarker(event, marker)).toBe(false);
  });

  it("does not match a real incident that happens to be in the window", () => {
    const event = {
      tags: [
        { key: "requestId", value: "7f3a" },
        { key: "url", value: "/api/v1/venues" },
      ],
    };
    expect(eventMatchesMarker(event, marker)).toBe(false);
  });

  it("tolerates an event with no tags at all", () => {
    expect(eventMatchesMarker({}, marker)).toBe(false);
    expect(eventMatchesMarker({ tags: [] }, marker)).toBe(false);
  });
});

describe("roundTripExitCode", () => {
  it("exits 0 only when the event actually came back", () => {
    expect(roundTripExitCode("confirmed")).toBe(0);
  });

  it("exits non-zero when nothing came back — the no-DSN case", () => {
    // A service with no DSN captures nothing, so the poll simply times out.
    // That must not be reported as success.
    expect(roundTripExitCode("not-found")).not.toBe(0);
  });

  it("exits non-zero when the check itself failed", () => {
    expect(roundTripExitCode("error")).not.toBe(0);
  });

  it("treats an unrecognised outcome as failure, never as success", () => {
    expect(roundTripExitCode("something-new")).not.toBe(0);
    expect(roundTripExitCode(undefined)).not.toBe(0);
  });
});

describe("shouldKeepPolling", () => {
  it("keeps polling inside the window", () => {
    expect(shouldKeepPolling({ elapsedMs: 5_000, timeoutMs: 60_000 })).toBe(true);
  });

  it("stops once the window is spent", () => {
    expect(shouldKeepPolling({ elapsedMs: 60_000, timeoutMs: 60_000 })).toBe(false);
    expect(shouldKeepPolling({ elapsedMs: 61_000, timeoutMs: 60_000 })).toBe(false);
  });
});

describe("nextPollDelayMs", () => {
  it("backs off rather than hammering the Sentry API", () => {
    expect(nextPollDelayMs(1)).toBeLessThan(nextPollDelayMs(3));
  });

  it("caps the delay so a long window still polls regularly", () => {
    expect(nextPollDelayMs(50)).toBeLessThanOrEqual(10_000);
  });
});
