import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  RIALTO_MANIFEST_PATH,
  countManifestComponents,
  readRialtoComponentCount,
} from "../rialto-component-count.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const manifestBuilt = existsSync(resolve(ROOT, RIALTO_MANIFEST_PATH));

describe("countManifestComponents", () => {
  it("counts every entry in the compiled manifest", () => {
    expect(countManifestComponents({ components: [{}, {}, {}] })).toBe(3);
  });

  it("rejects a manifest without a components array", () => {
    expect(() => countManifestComponents({})).toThrow(/components/);
    expect(() => countManifestComponents(null)).toThrow(/components/);
  });
});

/**
 * One definition of "component": an entry in Rialto's compiled manifest
 * (`@mattbutlerengineering/rialto/manifest`). Every advertised count must
 * agree with it. Needs `pnpm --dir packages/rialto build` (CI builds it).
 */
describe.skipIf(!manifestBuilt)("advertised Rialto component count surfaces", () => {
  const count = manifestBuilt ? readRialtoComponentCount(ROOT) : 0;

  it("reads a non-zero count from the manifest", () => {
    expect(count).toBeGreaterThan(0);
  });

  it("marketing committed fallback equals the manifest count", () => {
    const fallback = JSON.parse(
      read("apps/marketing/src/data/rialto-component-count.fallback.json")
    );
    expect(fallback.rialtoComponents).toBe(count);
  });

  it("rialto-web overview define equals the manifest count", async () => {
    const { resolveRialtoComponentCount } =
      await import("../../apps/rialto-web/component-count.config.ts");
    expect(resolveRialtoComponentCount()).toBe(count);
  });

  it("marketing project card carries no hardcoded component count", () => {
    expect(read("apps/marketing/src/data/projects.ts")).not.toMatch(/\d+\+?\s+components/);
  });

  it("proof strip and factory read the shared REPO_STATS value", () => {
    expect(read("apps/marketing/src/components/ProofStrip.tsx")).toContain(
      "REPO_STATS.rialtoComponents"
    );
  });
});
