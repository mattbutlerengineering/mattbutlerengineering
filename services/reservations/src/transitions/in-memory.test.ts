import { describe, it, expect } from "vitest";
import type { Reservation } from "@mbe/types";
import { createInMemoryEvents, createInMemoryJobs, createInMemoryMessaging } from "./in-memory.js";
import { allOutboundLive } from "./venue-policy.js";

const reservation = { id: "res-1", venueId: "venue-1" } as Reservation;

describe("in-memory transition adapters", () => {
  it("messaging records sends and fails exactly once on a scripted kind", async () => {
    const messaging = createInMemoryMessaging();
    messaging.failNext("booking-modified");
    await expect(
      messaging.send({ kind: "booking-modified", reservation, manageToken: "t" })
    ).rejects.toThrow("scripted booking-modified failure");
    await messaging.send({ kind: "booking-modified", reservation, manageToken: "t" });
    await messaging.send({ kind: "post-visit-thank-you", reservation });
    expect(messaging.sent.map((m) => m.kind)).toEqual(["booking-modified", "post-visit-thank-you"]);
  });

  it("jobs is a map whose cancel reports whether the job existed", async () => {
    const jobs = createInMemoryJobs();
    const payload = { reservationId: "res-1", venueId: "venue-1" };
    await jobs.schedule("booking-reminder", payload, 5, "booking-reminder:res-1");
    expect(jobs.jobs.get("booking-reminder:res-1")).toEqual({
      jobType: "booking-reminder",
      delayMs: 5,
      payload,
    });
    expect(await jobs.cancel("booking-reminder:res-1")).toBe(true);
    expect(await jobs.cancel("booking-reminder:res-1")).toBe(false);
    expect(jobs.jobs.size).toBe(0);
  });

  it("events records what was published", () => {
    const events = createInMemoryEvents();
    events.publish({ type: "reservation:updated", venueId: "venue-1", data: reservation });
    expect(events.published).toEqual([
      { type: "reservation:updated", venueId: "venue-1", data: reservation },
    ]);
  });

  it("the production policy source is live for every venue", async () => {
    expect(await allOutboundLive("venue-1")).toEqual({ outbound: "live" });
    expect(await allOutboundLive("")).toEqual({ outbound: "live" });
  });
});
