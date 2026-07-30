import { describe, it, expect } from "vitest";
import { PROJECTS } from "./projects.js";

describe("PROJECTS", () => {
  it("has the correct number of projects", () => {
    expect(PROJECTS).toHaveLength(2);
  });

  it("each project has required fields", () => {
    for (const project of PROJECTS) {
      expect(project.title).toBeTruthy();
      expect(project.description).toBeTruthy();
      expect(project.stack).toBeInstanceOf(Array);
      expect(project.stack.length).toBeGreaterThan(0);
    }
  });

  it("keeps each inline stack short enough to read as one line", () => {
    for (const project of PROJECTS) {
      expect(project.stack.length).toBeGreaterThanOrEqual(3);
      expect(project.stack.length).toBeLessThanOrEqual(6);
    }
  });

  it("lists no technology twice within a project", () => {
    for (const project of PROJECTS) {
      expect(new Set(project.stack).size).toBe(project.stack.length);
    }
  });

  it("Rialto Design System project has correct data", () => {
    const rialto = PROJECTS.find((p) => p.title === "Rialto Design System");
    expect(rialto).toBeDefined();
    expect(rialto!.stack).toContain("React");
    expect(rialto!.stack).toContain("TypeScript");
    expect(rialto!.href).toBe("/rialto/");
  });

  it("Hospitality Platform project has correct data", () => {
    const hospitality = PROJECTS.find((p) => p.title === "Hospitality Platform");
    expect(hospitality).toBeDefined();
    expect(hospitality!.stack).toContain("Auth0");
    expect(hospitality!.stack).toContain("PWA");
    expect(hospitality!.href).toBe("/hospitality/");
  });
});
