import { describe, it, expect } from "vitest";
import { TECH_STACK } from "./tech-stack.js";

describe("TECH_STACK", () => {
  it("has 4 categories", () => {
    expect(TECH_STACK).toHaveLength(4);
  });

  it("each category has required fields", () => {
    for (const category of TECH_STACK) {
      expect(category.title).toBeTruthy();
      expect(category.items).toBeInstanceOf(Array);
      expect(category.items.length).toBeGreaterThan(0);
    }
  });

  it("contains Frontend category with React", () => {
    const frontend = TECH_STACK.find((c) => c.title === "Frontend");
    expect(frontend).toBeDefined();
    expect(frontend!.items).toContain("React");
    expect(frontend!.items).toContain("TypeScript");
  });

  it("contains Backend category with Fastify and Prisma", () => {
    const backend = TECH_STACK.find((c) => c.title === "Backend");
    expect(backend).toBeDefined();
    expect(backend!.items).toContain("Fastify");
    expect(backend!.items).toContain("Prisma");
  });

  it("contains Infrastructure category with Cloudflare Workers", () => {
    const infra = TECH_STACK.find((c) => c.title === "Infrastructure");
    expect(infra).toBeDefined();
    expect(infra!.items).toContain("Cloudflare Workers");
    expect(infra!.items).toContain("Pulumi");
  });

  it("contains Auth & DevOps category with Auth0", () => {
    const devops = TECH_STACK.find((c) => c.title === "Auth & DevOps");
    expect(devops).toBeDefined();
    expect(devops!.items).toContain("Auth0");
    expect(devops!.items).toContain("GitHub Actions");
  });
});
