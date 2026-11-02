import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");

const lockedVersions = (name) =>
  [...lock.matchAll(new RegExp(`^ {2}${name}@(\\d+)\\.(\\d+)\\.(\\d+):`, "gm"))].map((m) => [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
  ]);

describe("minimatch / glob CVE override floors (#8122)", () => {
  it("floors the minimatch 10.x line at 11.0.1 (GHSA-g3hv-75wg-m249)", () => {
    expect(pkg.pnpm.overrides["minimatch@>=10.0.0 <11.0.1"]).toBe("^11.0.1");
    expect(pkg.pnpm.overrides["minimatch@>=10.0.0 <10.2.3"]).toBeUndefined();
  });

  it("floors glob 9-14.0.1 at 14.0.2 (GHSA-3g3m-2fjr-6pw4)", () => {
    expect(pkg.pnpm.overrides["glob@>=9.0.0 <14.0.2"]).toBe("^14.0.2");
  });

  it("resolves no minimatch 10.x and no glob 9-14.0.1 in the lockfile", () => {
    expect(lockedVersions("minimatch").filter(([maj]) => maj === 10)).toEqual([]);
    const bad = lockedVersions("glob").filter(
      ([maj, min, pat]) => maj >= 9 && (maj < 14 || (maj === 14 && min === 0 && pat < 2))
    );
    expect(bad).toEqual([]);
  });
});
