import { describe, it, expect } from "vitest";
import { iconVocabulary, iconCategories, getIcon, getIconsByCategory } from "./icons";

describe("iconVocabulary", () => {
  it("exports a non-empty array of icon entries", () => {
    expect(iconVocabulary.length).toBeGreaterThan(0);
  });

  it("every entry has required fields", () => {
    for (const entry of iconVocabulary) {
      expect(entry.concept).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.icon).toBeDefined();
      expect(iconCategories).toContain(entry.category);
    }
  });

  it("has unique concept names", () => {
    const concepts = iconVocabulary.map((e) => e.concept);
    expect(new Set(concepts).size).toBe(concepts.length);
  });
});

describe("getIcon", () => {
  it("returns icon for known concept", () => {
    expect(getIcon("home")).toBeDefined();
    expect(getIcon("save")).toBeDefined();
  });

  it("returns undefined for unknown concept", () => {
    expect(getIcon("nonexistent-icon-xyz")).toBeUndefined();
  });
});

describe("getIconsByCategory", () => {
  it("returns entries for each category", () => {
    for (const cat of iconCategories) {
      const entries = getIconsByCategory(cat);
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.category).toBe(cat);
      }
    }
  });

  it("returns empty array for non-matching category", () => {
    // @ts-expect-error - testing invalid category
    expect(getIconsByCategory("nonexistent")).toEqual([]);
  });
});
