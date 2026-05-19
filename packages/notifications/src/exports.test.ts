import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("package.json exports", () => {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf-8"));

  it("has production condition pointing to .js for all entry points", () => {
    for (const [_entrypoint, value] of Object.entries(pkg.exports)) {
      const config = value as Record<string, string>;
      expect(config).toHaveProperty("production");
      expect(config.production).toMatch(/\.js$/);
      expect(config.production).toContain("dist/");
    }
  });

  it("has a build script", () => {
    expect(pkg.scripts).toHaveProperty("build");
  });
});
