import { describe, it, expect, vi } from "vitest";
import { createGhProbe } from "./gh-probe.js";

describe("createGhProbe", () => {
  it("returns true and caches when probeExec succeeds", () => {
    const probeExec = vi.fn();
    const probe = createGhProbe(probeExec);

    expect(probe()).toBe(true);
    expect(probe()).toBe(true);
    expect(probeExec).toHaveBeenCalledTimes(1);
  });

  it("returns false and caches when probeExec throws", () => {
    const probeExec = vi.fn().mockImplementation(() => {
      throw new Error("spawn gh ENOENT");
    });
    const probe = createGhProbe(probeExec);

    expect(probe()).toBe(false);
    expect(probe()).toBe(false);
    expect(probeExec).toHaveBeenCalledTimes(1);
  });

  it("gives independent probers independent caches", () => {
    const probeA = createGhProbe(() => {});
    const probeB = createGhProbe(() => {
      throw new Error("nope");
    });

    expect(probeA()).toBe(true);
    expect(probeB()).toBe(false);
  });
});
