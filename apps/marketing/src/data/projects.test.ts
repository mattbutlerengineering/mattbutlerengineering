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
      expect(project.tags).toBeInstanceOf(Array);
      expect(project.tags.length).toBeGreaterThan(0);
    }
  });

  it("Rialto Design System project has correct data", () => {
    const rialto = PROJECTS.find((p) => p.title === "Rialto Design System");
    expect(rialto).toBeDefined();
    expect(rialto!.tags).toContain("React");
    expect(rialto!.tags).toContain("TypeScript");
    expect(rialto!.href).toBe("/rialto/");
  });

  it("Hospitality Platform project has correct data", () => {
    const hospitality = PROJECTS.find((p) => p.title === "Hospitality Platform");
    expect(hospitality).toBeDefined();
    expect(hospitality!.tags).toContain("Auth0");
    expect(hospitality!.tags).toContain("PWA");
    expect(hospitality!.href).toBe("/hospitality/");
  });
});
