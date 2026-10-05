import { describe, it, expect, vi } from "vitest";
import type { Reservation } from "@mbe/types";
import { runEffects } from "./run.js";
import { createInMemoryEvents, createInMemoryJobs, createInMemoryMessaging } from "./in-memory.js";
import type { EffectPorts, PlannedEffect } from "./ports.js";

const reservation = { id: "res-1", venueId: "venue-1" } as Reservation;
const payload = { reservationId: "res-1", venueId: "venue-1" };

function setup() {
  const messaging = createInMemoryMessaging();
  const jobs = createInMemoryJobs();
  const events = createInMemoryEvents();
  const ports: EffectPorts = { messaging, jobs, events };
  const logger = { error: vi.fn() };
  return { messaging, jobs, events, ports, logger };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

const evt: PlannedEffect = {
  effect: {
    port: "events",
    event: { type: "reservation:updated", venueId: "venue-1", data: reservation },
  },
  timing: "await",
  onFailure: "log",
};
const modified = (
  timing: "await" | "background",
  onFailure: "log" | "propagate"
): PlannedEffect => ({
  effect: {
    port: "messaging",
    message: { kind: "booking-modified", reservation, manageToken: "t" },
  },
  timing,
  onFailure,
});
const schedule = (
  timing: "await" | "background",
  onFailure: "log" | "propagate"
): PlannedEffect => ({
  effect: {
    port: "jobs",
    op: {
      op: "schedule",
      jobType: "booking-reminder",
      jobId: "booking-reminder:res-1",
      delayMs: 7,
      payload,
    },
  },
  timing,
  onFailure,
});
const replace: PlannedEffect = {
  effect: {
    port: "jobs",
    op: {
      op: "replace-if-present",
      jobType: "booking-reminder",
      jobId: "booking-reminder:res-1",
      delayMs: 9,
      payload,
    },
  },
  timing: "await",
  onFailure: "log",
};

describe("runEffects — executor", () => {
  it("runs awaited effects in sequence before resolving", async () => {
    const { ports, logger, messaging, events, jobs } = setup();
    await runEffects([modified("await", "log"), schedule("await", "log"), evt], ports, logger);
    expect(messaging.sent).toHaveLength(1);
    expect(jobs.jobs.has("booking-reminder:res-1")).toBe(true);
    expect(events.published).toHaveLength(1);
  });

  it("an awaited `propagate` failure reaches the caller and stops later awaited effects", async () => {
    const { ports, logger, messaging, events } = setup();
    messaging.failNext("booking-modified");
    await expect(runEffects([modified("await", "propagate"), evt], ports, logger)).rejects.toThrow(
      "scripted booking-modified failure"
    );
    expect(events.published).toHaveLength(0);
  });

  it("an awaited `log` failure is logged and the next effect still runs", async () => {
    const { ports, logger, messaging, events } = setup();
    messaging.failNext("booking-modified");
    await runEffects([modified("await", "log"), evt], ports, logger);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(events.published).toHaveLength(1);
  });

  it("background effects are detached: the caller resolves before they settle", async () => {
    const { ports, logger, messaging } = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const send = messaging.send.bind(messaging);
    ports.messaging = { send: async (m) => (await gate, send(m)) };
    await runEffects([modified("background", "log")], ports, logger);
    expect(messaging.sent).toHaveLength(0);
    release();
    await flush();
    expect(messaging.sent).toHaveLength(1);
  });

  it("a background `propagate` failure stops the chain and is logged once", async () => {
    const { ports, logger, messaging, jobs } = setup();
    messaging.failNext("booking-modified");
    await runEffects(
      [modified("background", "propagate"), schedule("background", "propagate")],
      ports,
      logger
    );
    await flush();
    expect(jobs.jobs.size).toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("a background `log` failure is logged and the chain continues", async () => {
    const { ports, logger, messaging, jobs } = setup();
    messaging.failNext("booking-modified");
    await runEffects(
      [modified("background", "log"), schedule("background", "propagate")],
      ports,
      logger
    );
    await flush();
    expect(jobs.jobs.size).toBe(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("replace-if-present schedules only when cancel removed an existing job", async () => {
    const { ports, logger, jobs } = setup();
    await runEffects([replace], ports, logger);
    expect(jobs.jobs.size).toBe(0);

    await jobs.schedule("booking-reminder", payload, 1, "booking-reminder:res-1");
    await runEffects([replace], ports, logger);
    expect(jobs.jobs.get("booking-reminder:res-1")?.delayMs).toBe(9);
  });
});
