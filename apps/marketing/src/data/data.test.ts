import { describe, it, expect } from "vitest";
import { PROJECTS, type Project } from "./projects.js";
import { TECH_STACK, type TechCategory } from "./tech-stack.js";
import { weeklyResources, type WeeklyResource } from "./weekly-intake.js";

describe("projects data", () => {
  it("exports a non-empty array of projects", () => {
    expect(PROJECTS.length).toBeGreaterThan(0);
  });

  it("each project has required fields", () => {
    for (const project of PROJECTS) {
      expect(project.title).toBeTruthy();
      expect(project.description).toBeTruthy();
      expect(project.tags.length).toBeGreaterThan(0);
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

describe("tech-stack data", () => {
  it("exports a non-empty array of categories", () => {
    expect(TECH_STACK.length).toBeGreaterThan(0);
  });

  it("each category has a title and non-empty items", () => {
    for (const category of TECH_STACK) {
      expect(category.title).toBeTruthy();
      expect(category.items.length).toBeGreaterThan(0);
    }
  });

  it("category titles are unique", () => {
    const titles = TECH_STACK.map((c: TechCategory) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("no duplicate items within a single category", () => {
    for (const category of TECH_STACK) {
      expect(new Set(category.items).size).toBe(category.items.length);
    }
  });
});

describe("weekly-intake data", () => {
  it("exports a non-empty array of resources", () => {
    expect(weeklyResources.length).toBeGreaterThan(0);
  });

  it("each resource has required fields", () => {
    for (const resource of weeklyResources) {
      expect(resource.id).toBeTruthy();
      expect(resource.title).toBeTruthy();
      expect(resource.url).toMatch(/^https?:\/\//);
      expect(resource.source).toBeTruthy();
      expect(resource.description).toBeTruthy();
      expect(resource.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(resource.tags.length).toBeGreaterThan(0);
    }
  });

  it("resource IDs are unique", () => {
    const ids = weeklyResources.map((r: WeeklyResource) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("source values are from allowed set", () => {
    const allowedSources = new Set(["js-weekly", "react-weekly", "ai-weekly", "other"]);
    for (const resource of weeklyResources) {
      expect(allowedSources.has(resource.source)).toBe(true);
    }
  });
});
