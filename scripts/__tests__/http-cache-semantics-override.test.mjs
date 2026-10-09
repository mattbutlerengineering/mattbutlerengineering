import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * GHSA-ch52-4w7c-c8xp. npm view on 2026-10-08 listed 4.3.0 as the lowest
 * published http-cache-semantics version greater than 4.2.0. The override
 * stays scoped to `<=4.2.0` so a later major is not pulled in.
 */
describe("http-cache-semantics override (#5995)", () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  const lockfile = readFileSync(resolve(ROOT, "pnpm-lock.yaml"), "utf8");

  it("pins <=4.2.0 to ^4.3.0 and drops the advisory ignore", () => {
    expect(pkg.pnpm.overrides["http-cache-semantics@<=4.2.0"]).toBe("^4.3.0");
    expect(String(pkg.pnpm.overrides["http-cache-semantics@<=4.2.0"])).not.toMatch(/^>=/);
    expect(pkg.pnpm.auditConfig?.ignoreGhsas ?? []).not.toContain("GHSA-ch52-4w7c-c8xp");
  });

  it("does not resolve http-cache-semantics@4.2.0", () => {
    const resolved = [...lockfile.matchAll(/^ {2}http-cache-semantics@(\S+):$/gm)].map(
      (match) => match[1]
    );
    expect(resolved).not.toContain("4.2.0");
    expect(resolved.some((version) => version.startsWith("4.3."))).toBe(true);
  });
});
