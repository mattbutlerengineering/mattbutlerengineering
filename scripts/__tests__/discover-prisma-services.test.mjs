import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPrismaServices } from "../discover-prisma-services.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

describe("discoverPrismaServices", () => {
  it("returns an array of service names", () => {
    const services = discoverPrismaServices();
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThan(0);
  });

  it("includes the known three services", () => {
    const services = discoverPrismaServices();
    expect(services).toContain("users");
    expect(services).toContain("reservations");
    expect(services).toContain("agent");
  });

  it("returns only service directory names (not full paths)", () => {
    const services = discoverPrismaServices();
    for (const s of services) {
      expect(s, `"${s}" should be a simple name, not a path`).not.toContain("/");
      expect(s, `"${s}" should not end in .prisma`).not.toMatch(/\.prisma$/);
    }
  });

  it("each returned service has a schema.prisma file on disk", () => {
    const services = discoverPrismaServices();
    for (const s of services) {
      const schemaPath = resolve(ROOT, "services", s, "prisma", "schema.prisma");
      expect(existsSync(schemaPath), `Expected schema at ${schemaPath}`).toBe(true);
    }
  });

  it("does not include services/*/src/generated schema paths", () => {
    const services = discoverPrismaServices();
    // The generated schemas live at services/*/src/generated/prisma/schema.prisma
    // They should NOT be included — only the canonical services/*/prisma/schema.prisma
    for (const s of services) {
      expect(s, `"${s}" looks like a generated path segment`).not.toContain("generated");
    }
  });

  it("returns a sorted list", () => {
    const services = discoverPrismaServices();
    const sorted = [...services].sort();
    expect(services).toEqual(sorted);
  });
});
