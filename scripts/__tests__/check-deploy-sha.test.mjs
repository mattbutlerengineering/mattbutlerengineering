import { describe, it, expect, vi } from "vitest";
import { extractBuildId, isBuildConfirmed, pollForDeploy } from "../check-deploy-sha.mjs";

describe("extractBuildId", () => {
  it("extracts the build-id from a meta tag", () => {
    const html = '<html><head><meta name="build-id" content="4364b7b"></head></html>';
    expect(extractBuildId(html)).toBe("4364b7b");
  });

  it("returns null when the meta tag is absent", () => {
    expect(extractBuildId("<html><head></head></html>")).toBeNull();
  });
});

describe("isBuildConfirmed", () => {
  it("matches on the first 7 characters of both ids", () => {
    expect(isBuildConfirmed({ expectedShortSha: "4364b7b", liveBuildId: "4364b7b" })).toBe(true);
    expect(isBuildConfirmed({ expectedShortSha: "4364b7bce1a2", liveBuildId: "4364b7b" })).toBe(
      true
    );
  });

  it("does not match a different build id", () => {
    expect(isBuildConfirmed({ expectedShortSha: "4364b7b", liveBuildId: "9ac05df" })).toBe(false);
  });

  it("does not match when liveBuildId is null (unreachable or no meta tag)", () => {
    expect(isBuildConfirmed({ expectedShortSha: "4364b7b", liveBuildId: null })).toBe(false);
  });

  it("does not match when expectedShortSha is falsy", () => {
    expect(isBuildConfirmed({ expectedShortSha: null, liveBuildId: "4364b7b" })).toBe(false);
  });
});

describe("pollForDeploy", () => {
  it("returns 'skipped' immediately, without calling fetch, when there is no expected SHA", async () => {
    const fetchFn = vi.fn();
    const sleepFn = vi.fn();
    const result = await pollForDeploy({
      url: "https://mattbutlerengineering.com/",
      expectedShortSha: null,
      fetchFn,
      sleepFn,
    });
    expect(result).toEqual({ confirmed: "skipped", liveBuildId: null, attempts: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 'confirmed' on the first attempt when the build id already matches", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      text: () =>
        Promise.resolve('<html><head><meta name="build-id" content="4364b7b"></head></html>'),
    });
    const sleepFn = vi.fn();
    const result = await pollForDeploy({
      url: "https://mattbutlerengineering.com/",
      expectedShortSha: "4364b7b",
      maxAttempts: 5,
      sleepSecs: 15,
      fetchFn,
      sleepFn,
    });
    expect(result).toEqual({ confirmed: "confirmed", liveBuildId: "4364b7b", attempts: 1 });
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("retries on a stale build id, then confirms once it flips -- and sleeps between attempts, not after the last one", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        text: () =>
          Promise.resolve('<html><head><meta name="build-id" content="stale01"></head></html>'),
      })
      .mockResolvedValueOnce({
        text: () =>
          Promise.resolve('<html><head><meta name="build-id" content="4364b7b"></head></html>'),
      });
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const result = await pollForDeploy({
      url: "https://mattbutlerengineering.com/",
      expectedShortSha: "4364b7b",
      maxAttempts: 5,
      sleepSecs: 15,
      fetchFn,
      sleepFn,
    });
    expect(result).toEqual({ confirmed: "confirmed", liveBuildId: "4364b7b", attempts: 2 });
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(15000);
  });

  it("returns 'timeout' -- not 'confirmed' -- once the attempt budget is exhausted (#5006)", async () => {
    // This is the exact regression the issue describes: the deploy never
    // propagates, and the old workflow warned then fell through as if
    // healthy. pollForDeploy must report a distinct terminal state so a
    // caller can gate on it.
    const fetchFn = vi.fn().mockResolvedValue({
      text: () =>
        Promise.resolve('<html><head><meta name="build-id" content="stale01"></head></html>'),
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const result = await pollForDeploy({
      url: "https://mattbutlerengineering.com/",
      expectedShortSha: "4364b7b",
      maxAttempts: 3,
      sleepSecs: 15,
      fetchFn,
      sleepFn,
    });
    expect(result).toEqual({ confirmed: "timeout", liveBuildId: "stale01", attempts: 3 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    // 3 attempts sleep only between them, never after the last.
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it("treats a fetch rejection (DNS failure, connection refused) as a null build id and keeps polling", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({
        text: () =>
          Promise.resolve('<html><head><meta name="build-id" content="4364b7b"></head></html>'),
      });
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const result = await pollForDeploy({
      url: "https://mattbutlerengineering.com/",
      expectedShortSha: "4364b7b",
      maxAttempts: 5,
      sleepSecs: 15,
      fetchFn,
      sleepFn,
    });
    expect(result).toEqual({ confirmed: "confirmed", liveBuildId: "4364b7b", attempts: 2 });
  });
});
