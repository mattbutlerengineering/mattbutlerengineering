import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COVERAGE_FLOOR_BYTES,
  UNBUDGETED_CHUNK_ALLOWLIST,
  findCoverageGaps,
} from "./check-chunk-coverage.mjs";

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** A sizeOf stub backed by a plain object; absent keys throw like a failed stat. */
function sizeOfFrom(sizes) {
  return (file) => {
    if (!(file in sizes)) throw new Error(`stat failed for ${file}`);
    return sizes[file];
  };
}

const BUDGETED_PATHS = ["dist/assets/index-*.js", "dist/assets/canvas-vendor-*.js"];

describe("findCoverageGaps", () => {
  it("reports an unbudgeted app chunk at or above the floor (the #7261 gap)", () => {
    const { uncovered, unreadable } = findCoverageGaps({
      files: ["floor-plan-CingpbpO.js"],
      sizeOf: sizeOfFrom({ "floor-plan-CingpbpO.js": 13522 }),
      sizeLimitPaths: BUDGETED_PATHS,
      allowlist: [],
      floorBytes: 5 * 1024,
    });
    expect(uncovered).toEqual(["floor-plan-CingpbpO.js"]);
    expect(unreadable).toEqual([]);
  });

  it("still reports an unbudgeted vendor chunk (the original #4594 behavior)", () => {
    const { uncovered } = findCoverageGaps({
      files: ["three-vendor-Ab12Cd34.js"],
      sizeOf: sizeOfFrom({ "three-vendor-Ab12Cd34.js": 200_000 }),
      sizeLimitPaths: BUDGETED_PATHS,
      allowlist: [],
      floorBytes: 5 * 1024,
    });
    expect(uncovered).toEqual(["three-vendor-Ab12Cd34.js"]);
  });

  it("exempts chunks below the floor", () => {
    const { uncovered } = findCoverageGaps({
      files: ["tiny-chunk-Zz9.js"],
      sizeOf: sizeOfFrom({ "tiny-chunk-Zz9.js": 5 * 1024 - 1 }),
      sizeLimitPaths: BUDGETED_PATHS,
      allowlist: [],
      floorBytes: 5 * 1024,
    });
    expect(uncovered).toEqual([]);
  });

  it("treats a chunk matched by a size-limit glob as covered", () => {
    const { uncovered } = findCoverageGaps({
      files: ["index-DPQ_fIkb.js", "canvas-vendor-BmwYE7j7.js"],
      sizeOf: sizeOfFrom({
        "index-DPQ_fIkb.js": 45_388,
        "canvas-vendor-BmwYE7j7.js": 312_066,
      }),
      sizeLimitPaths: BUDGETED_PATHS,
      allowlist: [],
      floorBytes: 5 * 1024,
    });
    expect(uncovered).toEqual([]);
  });

  it("treats a chunk matched by an allowlist glob as covered", () => {
    const { uncovered } = findCoverageGaps({
      files: ["DashboardLayout-DoW6HOta.js"],
      sizeOf: sizeOfFrom({ "DashboardLayout-DoW6HOta.js": 41_385 }),
      sizeLimitPaths: BUDGETED_PATHS,
      allowlist: ["dist/assets/DashboardLayout-*.js"],
      floorBytes: 5 * 1024,
    });
    expect(uncovered).toEqual([]);
  });

  it("does NOT let an allowlist glob cover a differently named new chunk", () => {
    const { uncovered } = findCoverageGaps({
      files: ["DashboardLayoutV2-Ab12Cd34.js"],
      sizeOf: sizeOfFrom({ "DashboardLayoutV2-Ab12Cd34.js": 41_385 }),
      sizeLimitPaths: BUDGETED_PATHS,
      allowlist: ["dist/assets/DashboardLayout-*.js"],
      floorBytes: 5 * 1024,
    });
    expect(uncovered).toEqual(["DashboardLayoutV2-Ab12Cd34.js"]);
  });

  it("fails closed: a chunk whose size cannot be read is reported, never skipped", () => {
    const { uncovered, unreadable } = findCoverageGaps({
      files: ["ghost-chunk-Qq1.js"],
      sizeOf: sizeOfFrom({}),
      sizeLimitPaths: BUDGETED_PATHS,
      allowlist: ["dist/assets/ghost-chunk-*.js"],
      floorBytes: 5 * 1024,
    });
    expect(uncovered).toEqual([]);
    expect(unreadable).toEqual(["ghost-chunk-Qq1.js"]);
  });
});

describe("real configuration", () => {
  const pkg = JSON.parse(readFileSync(path.join(APP_DIR, "package.json"), "utf8"));
  const sizeLimitPaths = pkg["size-limit"].map((entry) => entry.path);

  it("budgets the floor-plan chunks (#7261)", () => {
    // One glob covers floor-plan-*.js AND floor-plan-geometry-*.js; two separate
    // entries would double-count the geometry chunk inside the broader glob.
    expect(sizeLimitPaths).toContain("dist/assets/floor-plan-*.js");
  });

  it("keeps the allowlist disjoint from budgeted globs — an entry in both is drift", () => {
    for (const allowGlob of UNBUDGETED_CHUNK_ALLOWLIST) {
      expect(sizeLimitPaths).not.toContain(allowGlob);
    }
  });

  it("exposes a floor no higher than the original 5 KiB", () => {
    expect(COVERAGE_FLOOR_BYTES).toBeLessThanOrEqual(5 * 1024);
  });
});
