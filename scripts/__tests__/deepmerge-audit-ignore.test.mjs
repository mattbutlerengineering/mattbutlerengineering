import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * GHSA-gcqx-w48m-w2h4 (deepmerge prototype poisoning). `pnpm audit --json`
 * reports patched_versions `<0.0.0`: no fixed release exists, so an override
 * cannot clear it. Dev-tooling-only path (vite-plugin-pwa > workbox-build).
 */
describe("deepmerge advisory ignore (#8123)", () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));

  it("ignores GHSA-gcqx-w48m-w2h4 and keeps the other ignores", () => {
    const ignored = pkg.pnpm.auditConfig?.ignoreGhsas ?? [];
    expect(ignored).toContain("GHSA-gcqx-w48m-w2h4");
    expect(ignored).toContain("GHSA-mrhx-c7xc-m3w5");
  });
});
