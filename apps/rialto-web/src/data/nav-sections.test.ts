import { describe, it, expect } from "vitest";
import {
  NAV_SECTIONS,
  COMPONENT_COUNT,
  DEMO_PAGES,
  type NavSection,
  type NavItem,
} from "./nav-sections.js";

describe("nav-sections data", () => {
  it("exports non-empty NAV_SECTIONS array", () => {
    expect(NAV_SECTIONS.length).toBeGreaterThan(0);
  });

  it("each section has a label and non-empty items", () => {
    for (const section of NAV_SECTIONS) {
      expect(section.label).toBeTruthy();
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("section labels are unique", () => {
    const labels = NAV_SECTIONS.map((s: NavSection) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("each nav item has id, label, and path", () => {
    const allItems = NAV_SECTIONS.flatMap((s: NavSection) => s.items);
    for (const item of allItems) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.path).toMatch(/^\//);
    }
  });

  it("nav item IDs are globally unique", () => {
    const allIds = NAV_SECTIONS.flatMap((s: NavSection) => s.items.map((i: NavItem) => i.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("nav item paths follow /components/{id} pattern", () => {
    const allItems = NAV_SECTIONS.flatMap((s: NavSection) => s.items);
    const componentItems = allItems.filter(
      (item: NavItem) => item.path.startsWith("/components/")
    );
    for (const item of componentItems) {
      expect(item.path).toBe(`/components/${item.id}`);
    }
  });

  it("COMPONENT_COUNT matches total items across all sections", () => {
    const total = NAV_SECTIONS.reduce(
      (acc: number, section: NavSection) => acc + section.items.length,
      0
    );
    expect(COMPONENT_COUNT).toBe(total);
  });

  it("COMPONENT_COUNT is a reasonable number", () => {
    expect(COMPONENT_COUNT).toBeGreaterThan(30);
    expect(COMPONENT_COUNT).toBeLessThan(200);
  });

  it("comingSoon items exist only in Tokens section", () => {
    for (const section of NAV_SECTIONS) {
      const comingSoonItems = section.items.filter((i: NavItem) => i.comingSoon);
      if (section.label === "Tokens") {
        expect(comingSoonItems.length).toBeGreaterThan(0);
      } else {
        expect(comingSoonItems.length).toBe(0);
      }
    }
  });
});

describe("DEMO_PAGES", () => {
  it("exports non-empty array of demo pages", () => {
    expect(DEMO_PAGES.length).toBeGreaterThan(0);
  });

  it("each demo page has id, label, and path", () => {
    for (const page of DEMO_PAGES) {
      expect(page.id).toBeTruthy();
      expect(page.label).toBeTruthy();
      expect(page.path).toMatch(/^\/demos\//);
    }
  });

  it("demo page IDs are unique", () => {
    const ids = DEMO_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
