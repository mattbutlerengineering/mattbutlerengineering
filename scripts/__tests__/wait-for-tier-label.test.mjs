import { describe, it, expect, vi } from "vitest";
import { hasTierLabel, pollForTierLabel } from "../wait-for-tier-label.mjs";

describe("hasTierLabel", () => {
  it("is true when a tier:* label is present", () => {
    expect(hasTierLabel(["auto-merge", "tier:standard"])).toBe(true);
  });

  it("is false when no tier:* label is present", () => {
    expect(hasTierLabel(["auto-merge", "ready"])).toBe(false);
  });

  it("is false for an empty/undefined list", () => {
    expect(hasTierLabel([])).toBe(false);
    expect(hasTierLabel()).toBe(false);
  });
});

describe("pollForTierLabel", () => {
  it("returns immediately when the label is already present on the first fetch", async () => {
    const fetchLabels = vi.fn().mockResolvedValue(["auto-merge", "tier:trivial"]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollForTierLabel({
      fetchLabels,
      sleep,
      timeoutMs: 10_000,
      intervalMs: 1_000,
    });

    expect(result).toEqual({ landed: true, labelNames: ["auto-merge", "tier:trivial"] });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("polls until the label lands, sleeping between attempts", async () => {
    const fetchLabels = vi
      .fn()
      .mockResolvedValueOnce(["auto-merge"])
      .mockResolvedValueOnce(["auto-merge"])
      .mockResolvedValueOnce(["auto-merge", "tier:standard"]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    let elapsed = 0;
    const now = () => elapsed;
    sleep.mockImplementation((ms) => {
      elapsed += ms;
      return Promise.resolve();
    });

    const result = await pollForTierLabel({
      fetchLabels,
      sleep,
      now,
      timeoutMs: 10_000,
      intervalMs: 1_000,
    });

    expect(result).toEqual({ landed: true, labelNames: ["auto-merge", "tier:standard"] });
    expect(fetchLabels).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up and reports landed:false once the timeout elapses", async () => {
    const fetchLabels = vi.fn().mockResolvedValue(["auto-merge"]);
    let elapsed = 0;
    const now = () => elapsed;
    const sleep = vi.fn().mockImplementation((ms) => {
      elapsed += ms;
      return Promise.resolve();
    });

    const result = await pollForTierLabel({
      fetchLabels,
      sleep,
      now,
      timeoutMs: 3_000,
      intervalMs: 1_000,
    });

    expect(result).toEqual({ landed: false, labelNames: ["auto-merge"] });
  });
});
