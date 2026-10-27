import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  RIALTO_MANIFEST_PATH,
  countManifestComponents,
  readRialtoComponentCount,
  surfaceGuardMode,
} from "../rialto-component-count.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const manifestBuilt = existsSync(resolve(ROOT, RIALTO_MANIFEST_PATH));
const guardMode = surfaceGuardMode({ manifestBuilt, ci: Boolean(process.env.CI) });

describe("surfaceGuardMode", () => {
  it("runs when the manifest is built", () => {
    expect(surfaceGuardMode({ manifestBuilt: true, ci: true })).toBe("run");
    expect(surfaceGuardMode({ manifestBuilt: true, ci: false })).toBe("run");
  });

  it("skips locally but fails in CI when the manifest is missing", () => {
    expect(surfaceGuardMode({ manifestBuilt: false, ci: false })).toBe("skip");
    expect(surfaceGuardMode({ manifestBuilt: false, ci: true })).toBe("fail");
  });
});

it("has a built Rialto manifest whenever CI runs the surface guard", () => {
  expect(
    guardMode,
    `${RIALTO_MANIFEST_PATH} is missing in CI — the component-count surface guard cannot run. ` +
      "Build packages/rialto before this suite (pnpm --dir packages/rialto build)."
  ).not.toBe("fail");
});

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
describe.skipIf(guardMode !== "run")("advertised Rialto component count surfaces", () => {
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

  // Read as text: scripts/ may not import from apps/ (dependency-cruiser
  // `apps-not-imported`). rialto-web's own test pins its helper's behavior.
  it("rialto-web overview counts the same manifest's entries", () => {
    const config = read("apps/rialto-web/component-count.config.ts");
    expect(config).toContain("@mattbutlerengineering/rialto/manifest");
    expect(config).toContain("countRialtoComponents(manifest)");
    expect(read("apps/rialto-web/src/data/rialto-components.ts")).toContain(
      "manifest.components.length"
    );
    expect(read("apps/rialto-web/src/pages/OverviewPage.tsx")).toContain(
      "__RIALTO_COMPONENT_COUNT__"
    );
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
