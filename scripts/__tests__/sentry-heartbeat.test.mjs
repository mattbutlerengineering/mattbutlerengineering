import { describe, it, expect } from "vitest";
import { eventMatchesTarget, classifyTargetOutcome } from "../sentry-heartbeat.mjs";

const MARKER = "mbe-round-trip-20261001T041130897Z-abc123";
const backend = Object.freeze({
  id: "users-api",
  kind: "backend",
  project: "users-api",
  url: "https://api.example.test/api/v1/users/health",
});
const marketing = Object.freeze({
  id: "marketing",
  kind: "browser",
  project: "mattbutlerengineering",
  url: "https://example.test/",
  app: "marketing",
});

describe("eventMatchesTarget", () => {
  it("matches a backend event on the url tag, reusing eventMatchesMarker", () => {
    const event = { tags: [{ key: "url", value: `/api/v1/users/health?rt=${MARKER}` }] };
    expect(eventMatchesTarget(event, backend, MARKER)).toBe(true);
  });

  it("does not match a backend event that lacks the marker", () => {
    const event = { title: `HTTP 429 ${MARKER}`, tags: [{ key: "url", value: "/health" }] };
    expect(eventMatchesTarget(event, backend, MARKER)).toBe(false);
  });

  it("matches a browser event whose marker is only in the title (measured live: url tag drops the query)", () => {
    const event = {
      title: `Error: ${MARKER} sentry heartbeat`,
      tags: [
        { key: "app", value: "marketing" },
        { key: "url", value: "https://example.test/" },
      ],
    };
    expect(eventMatchesTarget(event, marketing, MARKER)).toBe(true);
  });

  it("matches a browser event on the message or url tag too", () => {
    const tags = [{ key: "app", value: "marketing" }];
    expect(
      eventMatchesTarget({ message: `${MARKER} sentry heartbeat`, tags }, marketing, MARKER)
    ).toBe(true);
    expect(
      eventMatchesTarget(
        { tags: [...tags, { key: "url", value: `https://example.test/?mbe-heartbeat=${MARKER}` }] },
        marketing,
        MARKER
      )
    ).toBe(true);
  });

  it("does not match a browser event with the right marker but the wrong app tag", () => {
    const event = {
      title: `Error: ${MARKER} sentry heartbeat`,
      tags: [{ key: "app", value: "hospitality" }],
    };
    expect(eventMatchesTarget(event, marketing, MARKER)).toBe(false);
  });

  it("does not match a browser event with no app tag at all", () => {
    expect(eventMatchesTarget({ title: `Error: ${MARKER}` }, marketing, MARKER)).toBe(false);
  });

  it("tolerates malformed events", () => {
    expect(eventMatchesTarget(undefined, marketing, MARKER)).toBe(false);
    expect(eventMatchesTarget({ tags: "nope" }, backend, MARKER)).toBe(false);
  });
});

describe("classifyTargetOutcome", () => {
  const triggered = { triggered: true };

  it("is confirmed when the event was found in the expected project", () => {
    expect(classifyTargetOutcome({ triggerResult: triggered, found: { id: "e1" } })).toMatchObject({
      outcome: "confirmed",
    });
  });

  it("is error when the lookup failed — never not-found", () => {
    expect(
      classifyTargetOutcome({ triggerResult: triggered, lookupError: new Error("Sentry 500") })
    ).toMatchObject({ outcome: "error" });
  });

  it("is misrouted, naming the project, when a miss is found by the sweep elsewhere", () => {
    expect(
      classifyTargetOutcome({
        triggerResult: triggered,
        found: undefined,
        sweepHit: { project: "hospitality", event: { id: "e2" } },
      })
    ).toEqual({ outcome: "misrouted", foundInProject: "hospitality" });
  });

  it("is not-found when nothing turned up anywhere", () => {
    expect(classifyTargetOutcome({ triggerResult: triggered })).toEqual({ outcome: "not-found" });
  });

  it("is provoke-failed when the trigger never fired (SC-5)", () => {
    expect(
      classifyTargetOutcome({ triggerResult: { triggered: false, reason: "no 429" } })
    ).toEqual({ outcome: "provoke-failed" });
  });

  it("treats a missing trigger result as provoke-failed, failing closed", () => {
    expect(classifyTargetOutcome({})).toEqual({ outcome: "provoke-failed" });
  });
});
