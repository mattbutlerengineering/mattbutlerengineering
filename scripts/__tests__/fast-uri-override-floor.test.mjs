import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");

const isAtLeast = (version, floor) => {
  const a = version.split(".").map(Number);
  const b = floor.split(".").map(Number);
  const diff = a.map((n, i) => n - b[i]).find((d) => d !== 0);
  return diff === undefined || diff > 0;
};

const lockedVersions = (major) =>
  [...lock.matchAll(/^ {2}fast-uri@(\d+\.\d+\.\d+):/gm)]
    .map((m) => m[1])
    .filter((v) => v.startsWith(`${major}.`));

describe("fast-uri CVE override floor (#7668)", () => {
  it("floors the 3.x line at 3.1.9", () => {
    expect(pkg.pnpm.overrides["fast-uri@<3.1.9"]).toBe(">=3.1.9 <4");
    expect(pkg.pnpm.overrides["fast-uri@<3.1.8"]).toBeUndefined();
  });

  it("floors the 4.x line at 4.2.3", () => {
    expect(pkg.pnpm.overrides["fast-uri@>=4.0.0 <4.2.3"]).toBe(">=4.2.3 <5");
    expect(pkg.pnpm.overrides["fast-uri@>=4.0.0 <4.1.1"]).toBeUndefined();
  });

  it("resolves no fast-uri 3.x below 3.1.9 in the lockfile", () => {
    const versions = lockedVersions(3);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.filter((v) => !isAtLeast(v, "3.1.9"))).toEqual([]);
  });

  it("resolves no fast-uri 4.x below 4.2.3 in the lockfile", () => {
    expect(lockedVersions(4).filter((v) => !isAtLeast(v, "4.2.3"))).toEqual([]);
  });
});
