import { describe, it, expect } from "vitest";
import { weeklyResources } from "./weekly-intake.js";

describe("weeklyResources", () => {
  it("has 5 resources", () => {
    expect(weeklyResources).toHaveLength(5);
  });

  it("each resource has required fields", () => {
    for (const resource of weeklyResources) {
      expect(resource.id).toBeTruthy();
      expect(resource.title).toBeTruthy();
      expect(resource.url).toMatch(/^https?:\/\//);
      expect(resource.description).toBeTruthy();
      expect(resource.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(resource.tags.length).toBeGreaterThan(0);
    }
  });

  it("each resource has a valid source", () => {
    const validSources = ["js-weekly", "react-weekly", "ai-weekly", "other"];
    for (const resource of weeklyResources) {
      expect(validSources).toContain(resource.source);
    }
  });

  it("has a React resource", () => {
    const react = weeklyResources.find((r) => r.source === "react-weekly");
    expect(react).toBeDefined();
    expect(react!.title).toBe("React Status");
  });

  it("has an AI resource", () => {
    const ai = weeklyResources.find((r) => r.source === "ai-weekly");
    expect(ai).toBeDefined();
    expect(ai!.title).toBe("AI Breakfast");
  });
});
