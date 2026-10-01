import { describe, it, expect, vi } from "vitest";
import { runHeartbeat } from "../sentry-heartbeat.mjs";
import { TARGETS } from "../sentry-heartbeat-targets.mjs";

/** A fake clock whose sleep advances time instantly. */
function fakeClock(startMs = Date.parse("2026-10-01T13:23:00Z")) {
  let current = startMs;
  return {
    now: () => current,
    sleep: async (ms) => {
      current += ms;
    },
  };
}

const okTrigger = async () => ({ triggered: true });

/** An event that eventMatchesTarget will accept for this target and marker. */
function matchingEvent(target, marker, platform) {
  return target.kind === "browser"
    ? {
        id: `ev-${target.id}`,
        title: `Error: ${marker} sentry heartbeat`,
        platform: platform ?? "javascript",
        tags: [{ key: "app", value: target.app }],
      }
    : {
        id: `ev-${target.id}`,
        platform: platform ?? "node",
        tags: [
          { key: "url", value: `/health?rt=${marker}` },
          { key: "server_name", value: target.id },
        ],
      };
}

/** A lookup that finds each target's event in `where(target)` (default: its own project). */
function lookupFinding({ where = (target) => target.project, platformFor } = {}) {
  return vi.fn(async (project, marker, target) =>
    where(target) === project ? matchingEvent(target, marker, platformFor?.(target)) : undefined
  );
}

describe("runHeartbeat", () => {
  it("uses six distinct markers, one per target, and confirms every target found where expected", async () => {
    const clock = fakeClock();
    const trigger = vi.fn(okTrigger);
    const outcomes = await runHeartbeat({
      registry: TARGETS,
      trigger,
      lookup: lookupFinding(),
      ...clock,
      timeoutMs: 60_000,
    });
    const markers = trigger.mock.calls.map(([, marker]) => marker);
    expect(new Set(markers).size).toBe(6);
    expect(markers.every((marker) => marker.startsWith("mbe-round-trip-"))).toBe(true);
    expect(outcomes.map((outcome) => outcome.outcome)).toEqual(Array(6).fill("confirmed"));
    expect(outcomes.find((outcome) => outcome.targetId === "marketing")).toMatchObject({
      platform: "javascript",
      evidence: "app:marketing",
      eventId: "ev-marketing",
    });
    expect(outcomes.find((outcome) => outcome.targetId === "users-api")).toMatchObject({
      platform: "node",
      evidence: "server_name:users-api",
    });
  });

  it("classifies a target found only in another project as misrouted", async () => {
    const outcomes = await runHeartbeat({
      registry: TARGETS,
      trigger: okTrigger,
      lookup: lookupFinding({
        where: (target) =>
          target.project === "mattbutlerengineering" ? "hospitality" : target.project,
      }),
      ...fakeClock(),
      timeoutMs: 30_000,
    });
    expect(outcomes.find((outcome) => outcome.targetId === "marketing")).toMatchObject({
      outcome: "misrouted",
      foundInProject: "hospitality",
    });
    expect(outcomes.find((outcome) => outcome.targetId === "hospitality").outcome).toBe(
      "confirmed"
    );
  });

  it("reports error, not not-found, when the lookup throws — and skips the sweep for it", async () => {
    const lookup = vi.fn(async (project, marker, target) => {
      if (target.id === "agent-api") throw new Error("Sentry API returned 500");
      return project === target.project ? matchingEvent(target, marker) : undefined;
    });
    const outcomes = await runHeartbeat({
      registry: TARGETS,
      trigger: okTrigger,
      lookup,
      ...fakeClock(),
      timeoutMs: 30_000,
    });
    const agent = outcomes.find((outcome) => outcome.targetId === "agent-api");
    expect(agent.outcome).toBe("error");
    expect(agent.detail).toMatch(/500/);
    const agentLookups = lookup.mock.calls.filter(([, , target]) => target.id === "agent-api");
    expect(agentLookups).toHaveLength(1);
  });

  it("does not confirm a browser match whose event platform is node (SC-4 origin evidence)", async () => {
    const outcomes = await runHeartbeat({
      registry: TARGETS,
      trigger: okTrigger,
      lookup: lookupFinding({
        platformFor: (target) => (target.id === "rialto-web" ? "node" : undefined),
      }),
      ...fakeClock(),
      timeoutMs: 30_000,
    });
    const rialto = outcomes.find((outcome) => outcome.targetId === "rialto-web");
    expect(rialto.outcome).not.toBe("confirmed");
    expect(rialto.detail).toMatch(/platform/);
  });

  it("is provoke-failed when the trigger does not fire, or throws", async () => {
    const trigger = vi.fn(async (target) => {
      if (target.id === "users-api") return { triggered: false, reason: "no 429 in 150 requests" };
      if (target.id === "hospitality") throw new Error("browser crashed");
      return { triggered: true };
    });
    const lookup = lookupFinding();
    const outcomes = await runHeartbeat({
      registry: TARGETS,
      trigger,
      lookup,
      ...fakeClock(),
      timeoutMs: 30_000,
    });
    expect(outcomes.find((outcome) => outcome.targetId === "users-api")).toMatchObject({
      outcome: "provoke-failed",
      detail: expect.stringMatching(/150/),
    });
    expect(outcomes.find((outcome) => outcome.targetId === "hospitality")).toMatchObject({
      outcome: "provoke-failed",
      detail: expect.stringMatching(/crashed/),
    });
    expect(lookup.mock.calls.some(([, , target]) => target.id === "users-api")).toBe(false);
  });

  it("gives up at the timeout with not-found, after one sweep, without real waiting", async () => {
    const clock = fakeClock();
    const startedAt = clock.now();
    const lookup = vi.fn(async () => undefined);
    const outcomes = await runHeartbeat({
      registry: TARGETS.slice(0, 1),
      trigger: okTrigger,
      lookup,
      ...clock,
      timeoutMs: 20_000,
    });
    expect(outcomes).toEqual([
      expect.objectContaining({ targetId: "users-api", outcome: "not-found" }),
    ]);
    expect(clock.now() - startedAt).toBeLessThanOrEqual(20_000 + 10_000);
    // a one-target registry has no other project to sweep
    expect(lookup.mock.calls.every(([project]) => project === "users-api")).toBe(true);
  });

  it("sweeps every other in-scope project once on a miss", async () => {
    const lookup = vi.fn(async () => undefined);
    await runHeartbeat({
      registry: TARGETS,
      trigger: async (target) =>
        target.id === "users-api" ? { triggered: true } : { triggered: false, reason: "skip" },
      lookup,
      ...fakeClock(),
      timeoutMs: 5_000,
    });
    const swept = lookup.mock.calls
      .map(([project]) => project)
      .filter((project) => project !== "users-api");
    expect(swept.sort()).toEqual([
      "agent-api",
      "hospitality",
      "mattbutlerengineering",
      "reservations-api",
    ]);
  });
});
