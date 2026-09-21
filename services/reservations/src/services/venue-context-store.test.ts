import { describe, it, expect } from "vitest";
import {
  enterVenueContext,
  getCurrentVenueId,
  runWithVenueContext,
} from "./venue-context-store.js";

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

describe("runWithVenueContext", () => {
  it("makes the venue id visible ACROSS awaits inside the callback", async () => {
    const observed = await runWithVenueContext("venue-1", async () => {
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      return getCurrentVenueId();
    });

    expect(observed).toBe("venue-1");
  });

  it("returns the callback's value", async () => {
    await expect(runWithVenueContext("venue-1", async () => "result")).resolves.toBe("result");
  });

  it("restores the surrounding context after the callback settles", async () => {
    enterVenueContext("venue-outer");

    await runWithVenueContext("venue-inner", async () => {
      expect(getCurrentVenueId()).toBe("venue-inner");
    });

    expect(getCurrentVenueId()).toBe("venue-outer");
  });

  it("shadows an already-entered null context (the global preHandler's default-deny)", async () => {
    enterVenueContext(null);

    const observed = await runWithVenueContext("venue-1", async () => {
      await Promise.resolve();
      return getCurrentVenueId();
    });

    expect(observed).toBe("venue-1");
  });

  it("propagates a rejection and still restores the surrounding context", async () => {
    enterVenueContext("venue-outer");

    await expect(
      runWithVenueContext("venue-inner", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(getCurrentVenueId()).toBe("venue-outer");
  });
});
