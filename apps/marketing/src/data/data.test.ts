import { describe, it, expect } from "vitest";
import { PROJECTS, type Project } from "./projects.js";

describe("projects data", () => {
  it("exports a non-empty array of projects", () => {
    expect(PROJECTS.length).toBeGreaterThan(0);
  });

  it("each project has required fields", () => {
    for (const project of PROJECTS) {
      expect(project.title).toBeTruthy();
      expect(project.description).toBeTruthy();
      expect(project.stack.length).toBeGreaterThan(0);
    }
  });

  it("project titles are unique", () => {
    const titles = PROJECTS.map((p: Project) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("href values start with / when present", () => {
    const withHref = PROJECTS.filter((p: Project) => p.href);
    for (const project of withHref) {
      expect(project.href).toMatch(/^\//);
    }
  });
});
