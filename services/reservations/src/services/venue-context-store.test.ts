import { describe, it, expect } from "vitest";
import { enterVenueContext, getCurrentVenueId } from "./venue-context-store.js";

describe("venue-context-store", () => {
  it("returns null when no context has been entered", async () => {
    // Fresh async context (no prior enterVenueContext in this call chain).
    await Promise.resolve();
    expect(getCurrentVenueId()).toBeNull();
  });

  it("returns the venue id entered via enterVenueContext, within the same async chain", async () => {
    await new Promise<void>((resolve) => {
      enterVenueContext("venue-1");
      // Propagates through subsequent async continuations (microtasks, timers)
      // chained from the point enterWith was called — this is what a Fastify
      // preHandler's continuation into later hooks/the handler relies on.
      setImmediate(() => {
        expect(getCurrentVenueId()).toBe("venue-1");
        resolve();
      });
    });
  });

  it("isolates concurrent async chains from each other (no cross-request bleed)", async () => {
    const runWithVenue = (venueId: string): Promise<string | null> =>
      new Promise((resolve) => {
        enterVenueContext(venueId);
        setImmediate(() => resolve(getCurrentVenueId()));
      });

    const [a, b] = await Promise.all([runWithVenue("venue-A"), runWithVenue("venue-B")]);
    expect(a).toBe("venue-A");
    expect(b).toBe("venue-B");
  });

  it("returns null when null is explicitly entered (default-deny, ADR-026 §4)", async () => {
    await new Promise<void>((resolve) => {
      enterVenueContext(null);
      setImmediate(() => {
        expect(getCurrentVenueId()).toBeNull();
        resolve();
      });
    });
  });
});
