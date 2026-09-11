import { describe, it, expect, vi } from "vitest";
import {
  apiSurfaceFailureSignature,
  apiSurfaceInvariantsDedupeKey,
  POST_DEPLOY_UNVERIFIED_DEDUPE_KEY,
  runCli,
} from "../lib/deploy-check-dedupe.mjs";

/** One JSON-line-per-probe log the way check-api-surface-invariants.mjs emits it. */
function probeLog(probes) {
  return probes.map((p) => JSON.stringify(p)).join("\n");
}

describe("apiSurfaceFailureSignature", () => {
  it("is identical for the same failing probes across two different commits", () => {
    const runOne = probeLog([
      { name: "venue-list:auth-stage", state: "ok" },
      { name: "public-venue-lookup:reachable-at-origin", state: "wrong-service" },
    ]);
    const runTwo = probeLog([
      { name: "venue-list:auth-stage", state: "ok" },
      { name: "public-venue-lookup:reachable-at-origin", state: "wrong-service" },
    ]);

    expect(apiSurfaceFailureSignature(runOne)).toBe(apiSurfaceFailureSignature(runTwo));
  });

  it("is order-independent — probe lines can print in any order", () => {
    const a = probeLog([
      { name: "venue-create:auth-stage", state: "guard-missing" },
      { name: "tables-list:auth-stage", state: "status-mismatch" },
    ]);
    const b = probeLog([
      { name: "tables-list:auth-stage", state: "status-mismatch" },
      { name: "venue-create:auth-stage", state: "guard-missing" },
    ]);

    expect(apiSurfaceFailureSignature(a)).toBe(apiSurfaceFailureSignature(b));
  });

  it("differs when the set of failing probes genuinely differs", () => {
    const guardMissing = probeLog([{ name: "venue-create:auth-stage", state: "guard-missing" }]);
    const unreachable = probeLog([{ name: "venue-create:auth-stage", state: "unreachable" }]);

    expect(apiSurfaceFailureSignature(guardMissing)).not.toBe(
      apiSurfaceFailureSignature(unreachable)
    );
  });

  it("ignores passing (state: ok) probes — only failures identify the signature", () => {
    const onlyFailure = probeLog([{ name: "venue-create:auth-stage", state: "guard-missing" }]);
    const failurePlusNoise = probeLog([
      { name: "venue-list:auth-stage", state: "ok" },
      { name: "tables-list:auth-stage", state: "ok" },
      { name: "venue-create:auth-stage", state: "guard-missing" },
    ]);

    expect(apiSurfaceFailureSignature(failurePlusNoise)).toBe(
      apiSurfaceFailureSignature(onlyFailure)
    );
  });

  it("falls back to a stable constant when the log has no parseable probe lines", () => {
    const garbage = "some crash before any probe printed\nEnoent: no such file";

    expect(apiSurfaceFailureSignature(garbage)).toBe("unparseable-probe-log");
    expect(apiSurfaceFailureSignature("")).toBe("unparseable-probe-log");
  });
});

describe("apiSurfaceInvariantsDedupeKey", () => {
  it("never embeds a commit SHA — same failure, two commits, same key", () => {
    const log = probeLog([{ name: "venue-create:auth-stage", state: "guard-missing" }]);

    const key = apiSurfaceInvariantsDedupeKey(log);

    expect(key).not.toMatch(/[0-9a-f]{7,40}/);
    expect(key).toBe(apiSurfaceInvariantsDedupeKey(log));
  });

  it("is prefixed so it never collides with an unrelated dedupe key family", () => {
    const log = probeLog([{ name: "venue-create:auth-stage", state: "guard-missing" }]);

    expect(apiSurfaceInvariantsDedupeKey(log)).toMatch(/^api-surface-invariants:/);
  });
});

describe("POST_DEPLOY_UNVERIFIED_DEDUPE_KEY", () => {
  it("is a fixed string with no per-run/per-SHA component", () => {
    expect(POST_DEPLOY_UNVERIFIED_DEDUPE_KEY).toBe("post-deploy-check-unverified");
  });
});

describe("runCli", () => {
  it("prints the signature and dedupe key for a probe log path", () => {
    const log = probeLog([{ name: "venue-create:auth-stage", state: "guard-missing" }]);
    const deps = { readFile: () => log };
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    runCli(["api-surface", "/tmp/fake.log"], deps);

    expect(write).toHaveBeenCalledWith(
      JSON.stringify({
        signature: apiSurfaceFailureSignature(log),
        dedupeKey: apiSurfaceInvariantsDedupeKey(log),
      })
    );
    write.mockRestore();
  });

  it("prints the fixed post-deploy-unverified key with no path argument", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    runCli(["post-deploy-unverified-key"], { readFile: () => "" });

    expect(write).toHaveBeenCalledWith(POST_DEPLOY_UNVERIFIED_DEDUPE_KEY);
    write.mockRestore();
  });

  it("throws on an unknown command", () => {
    expect(() => runCli(["bogus"], { readFile: () => "" })).toThrow(/Unknown command/);
  });
});
