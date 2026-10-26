import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");

describe("fast-uri CVE override floor (#7668)", () => {
  it("floors the 3.x line at 3.1.9", () => {
    expect(pkg.pnpm.overrides["fast-uri@<3.1.9"]).toBe(">=3.1.9 <4");
    expect(pkg.pnpm.overrides["fast-uri@<3.1.8"]).toBeUndefined();
  });

  it("resolves no fast-uri 3.x below 3.1.9 in the lockfile", () => {
    const versions = [...lock.matchAll(/^ {2}fast-uri@(3\.\d+\.\d+):/gm)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.filter((v) => v !== "3.1.9" && !/^3\.1\.(9|[1-9]\d)$/.test(v))).toEqual([]);
  });
});
