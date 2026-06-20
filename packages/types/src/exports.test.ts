import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("package.json exports", () => {
  it("has production condition pointing to dist .js for all entry points", () => {
    for (const [_entrypoint, value] of Object.entries(pkg.exports)) {
      const config = value as Record<string, string>;
      expect(config).toHaveProperty("production");
      expect(config.production).toMatch(/\.js$/);
      expect(config.production).toContain("dist/");
    }
  });

  it("has default condition pointing to dist .js for all entry points (Node.js binary compat)", () => {
    for (const [_entrypoint, value] of Object.entries(pkg.exports)) {
      const config = value as Record<string, string>;
      expect(config).toHaveProperty("default");
      expect(config.default).toMatch(/\.js$/);
      expect(config.default).toContain("dist/");
    }
  });
});
