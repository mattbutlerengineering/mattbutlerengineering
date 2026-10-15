import { describe, it, expect } from "vitest";
import { getCurrentVenueId, runWithVenueContext } from "./venue-context-store.js";

describe("venue-context-store", () => {
  it("returns null when no context has been entered", async () => {
    await Promise.resolve();
    expect(getCurrentVenueId()).toBeNull();
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
    await runWithVenueContext("venue-outer", async () => {
      await runWithVenueContext("venue-inner", async () => {
        expect(getCurrentVenueId()).toBe("venue-inner");
      });

      expect(getCurrentVenueId()).toBe("venue-outer");
    });
  });

  it("propagates a rejection and still restores the surrounding context", async () => {
    await runWithVenueContext("venue-outer", async () => {
      await expect(
        runWithVenueContext("venue-inner", async () => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      expect(getCurrentVenueId()).toBe("venue-outer");
    });
  });
});
