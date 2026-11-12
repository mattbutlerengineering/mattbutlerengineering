import { describe, expect, it } from "vitest";
import { canSignal, MAX_ARRIVED_SIGNALS, MAX_LATE_SIGNALS } from "./can-signal.js";

const TZ = "America/New_York";
// 2026-07-10 18:00 EDT == 22:00Z
const START = "2026-07-10T22:00:00.000Z";
const base = {
  status: "CONFIRMED",
  startTime: START,
  timezone: TZ,
  priorSignals: { late: 0, arrived: 0 },
} as const;

const at = (iso: string) => new Date(iso);

describe("canSignal", () => {
  it("allows a signal inside the T-3h..T+45m window", () => {
    expect(canSignal({ ...base, kind: "arrived", now: at("2026-07-10T19:00:00Z") }).ok).toBe(true);
    expect(canSignal({ ...base, kind: "running-late", now: at("2026-07-10T22:45:00Z") }).ok).toBe(
      true
    );
  });

  it("rejects before T-3h and after T+45m", () => {
    const early = canSignal({ ...base, kind: "arrived", now: at("2026-07-10T18:59:59Z") });
    expect(early).toEqual({ ok: false, reason: "outside-window" });
    const late = canSignal({ ...base, kind: "arrived", now: at("2026-07-10T22:45:01Z") });
    expect(late).toEqual({ ok: false, reason: "outside-window" });
  });

  it("only allows confirmed reservations", () => {
    for (const status of ["PENDING", "CANCELLED", "COMPLETED", "NO_SHOW", "SEATED"]) {
      const r = canSignal({ ...base, status, kind: "arrived", now: at("2026-07-10T21:00:00Z") });
      expect(r).toEqual({ ok: false, reason: "not-confirmed" });
    }
  });

  it("requires the venue-local date to match the reservation date", () => {
    // 00:30 local on the 11th is within T+45m of a 23:50-local booking on the 10th
    // but is a different venue-local day, so the signal is refused.
    const lateNight = canSignal({
      ...base,
      startTime: "2026-07-11T03:50:00.000Z", // 23:50 EDT on the 10th
      kind: "running-late",
      now: at("2026-07-11T04:30:00Z"), // 00:30 EDT on the 11th
    });
    expect(lateNight).toEqual({ ok: false, reason: "outside-window" });
  });

  it("caps late signals and arrived signals", () => {
    const now = at("2026-07-10T21:00:00Z");
    expect(
      canSignal({
        ...base,
        kind: "running-late",
        now,
        priorSignals: { late: MAX_LATE_SIGNALS, arrived: 0 },
      })
    ).toEqual({ ok: false, reason: "cap-reached" });
    expect(
      canSignal({
        ...base,
        kind: "arrived",
        now,
        priorSignals: { late: 0, arrived: MAX_ARRIVED_SIGNALS },
      })
    ).toEqual({ ok: false, reason: "cap-reached" });
    // A late-cap does not block arriving.
    expect(
      canSignal({
        ...base,
        kind: "arrived",
        now,
        priorSignals: { late: MAX_LATE_SIGNALS, arrived: 0 },
      }).ok
    ).toBe(true);
  });

  it("handles the DST spring-forward day in the venue timezone", () => {
    // 2026-03-08 US spring forward; 19:00 EDT == 23:00Z
    const r = canSignal({
      ...base,
      startTime: "2026-03-08T23:00:00.000Z",
      kind: "arrived",
      now: at("2026-03-08T20:00:00Z"),
    });
    expect(r.ok).toBe(true);
  });
});
