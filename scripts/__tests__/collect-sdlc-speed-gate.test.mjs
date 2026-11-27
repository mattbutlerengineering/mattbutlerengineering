import { describe, it, expect } from "vitest";
import {
  pushToGate,
  summarizeSdlcSpeed,
  CI_PUSH_TO_GATE_P90_MAX_MIN,
} from "../collect-sdlc-speed.mjs";

// ADR-036: push -> CI Gate, queue included, p90 over a rolling window.
describe("pushToGate (ADR-036)", () => {
  const created = "2026-11-27T10:00:00Z";
  const job = (name, s, c, conclusion = "success") => ({
    name,
    conclusion,
    started_at: s,
    completed_at: c,
  });

  it("measures CI Gate completed_at minus run created_at, queue included", () => {
    const m = pushToGate({ created_at: created }, [
      job("Lint", "2026-11-27T10:20:00Z", "2026-11-27T10:22:00Z"),
      job("CI Gate", "2026-11-27T10:38:00Z", "2026-11-27T10:40:00Z"),
    ]);
    expect(m.gateMin).toBe(40);
    // first job started 20 min after creation, of 40 total
    expect(m.queueShare).toBe(0.5);
  });

  it("is null when CI Gate never completed (cancelled run)", () => {
    expect(
      pushToGate({ created_at: created }, [
        job("Lint", "2026-11-27T10:01:00Z", "2026-11-27T10:02:00Z"),
        job("CI Gate", null, null, "cancelled"),
      ])
    ).toBeNull();
    expect(pushToGate({ created_at: created }, [])).toBeNull();
  });
});

describe("summarizeSdlcSpeed push-to-gate aggregate (ADR-036)", () => {
  const gate = (gateMin, queueShare = 0) => ({ gateMin, queueShare });
  const input = (gateRuns) => ({ prs: [], ciRuns: [], protection: null, gateRuns });

  it("exports the 15 minute ceiling", () => {
    expect(CI_PUSH_TO_GATE_P90_MAX_MIN).toBe(15);
  });

  it("reports p50/p90, queue share and skipped count; flags a queue-heavy breach", () => {
    const s = summarizeSdlcSpeed(
      input([gate(40, 0.6), gate(44, 0.7), gate(8, 0.1), null, gate(38, 0.5)])
    );
    expect(s.pushToGate).toMatchObject({ runs: 4, skipped: 1, p90: 44 });
    expect(s.pushToGate.queueShare).toBeCloseTo(0.475, 3);
    expect(s.absoluteBreach).toBe(true);
  });

  it("does not breach at exactly 15.0 min, breaches just above", () => {
    expect(summarizeSdlcSpeed(input([gate(15.0)])).absoluteBreach).toBe(false);
    expect(summarizeSdlcSpeed(input([gate(15.1)])).absoluteBreach).toBe(true);
  });

  it("never breaches on an empty or all-skipped window", () => {
    expect(summarizeSdlcSpeed(input([])).absoluteBreach).toBe(false);
    const s = summarizeSdlcSpeed(input([null, null]));
    expect(s.absoluteBreach).toBe(false);
    expect(s.pushToGate).toMatchObject({ runs: 0, skipped: 2, p50: 0, p90: 0 });
  });

  it("lists the slowest jobs by median for the issue body", () => {
    const s = summarizeSdlcSpeed({
      prs: [],
      protection: null,
      gateRuns: [gate(10)],
      ciRuns: [
        {
          wallMin: 1,
          touchedLockfile: null,
          jobs: [
            { name: "A", durationMin: 3 },
            { name: "B", durationMin: 9 },
            { name: "C", durationMin: 5 },
            { name: "D", durationMin: 1 },
          ],
        },
      ],
    });
    expect(s.pushToGate.slowestJobs.map((j) => j.name)).toEqual(["B", "C", "A"]);
  });
});
