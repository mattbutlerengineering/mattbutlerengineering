import { describe, it, expect } from "vitest";
import {
  PAGE_REGISTRY,
  buildNavSections,
  buildSitemapPaths,
  type PageEntry,
} from "./page-registry.js";

describe("PageRegistry — structure", () => {
  it("PAGE_REGISTRY is a non-empty array", () => {
    expect(Array.isArray(PAGE_REGISTRY)).toBe(true);
    expect(PAGE_REGISTRY.length).toBeGreaterThan(0);
  });

  it("every entry has id, label, category, and path", () => {
    for (const entry of PAGE_REGISTRY) {
      expect(entry.id, `${entry.id} missing id`).toBeTruthy();
      expect(entry.label, `${entry.id} missing label`).toBeTruthy();
      expect(entry.category, `${entry.id} missing category`).toBeTruthy();
      expect(entry.path, `${entry.id} missing path`).toBeTruthy();
    }
  });

  it("every entry has a load function", () => {
    for (const entry of PAGE_REGISTRY) {
      expect(typeof entry.load, `${entry.id} missing load`).toBe("function");
    }
  });

  it("ids are globally unique", () => {
    const ids = PAGE_REGISTRY.map((e: PageEntry) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("paths start with /components/, /examples/, or /dashboard", () => {
    for (const entry of PAGE_REGISTRY) {
      expect(
        entry.path.startsWith("/components/") ||
          entry.path.startsWith("/examples/") ||
          entry.path === "/dashboard" ||
          entry.path.startsWith("/dashboard/"),
        `${entry.id} has invalid path: ${entry.path}`
      ).toBe(true);
    }
  });
});

describe("PageRegistry — nav derivation", () => {
  it("buildNavSections returns non-empty array", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    expect(sections.length).toBeGreaterThan(0);
  });

  it("every page in registry is listed in nav (by id)", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    const navIds = sections.flatMap((s) => s.items.map((i) => i.id));
    for (const entry of PAGE_REGISTRY) {
      expect(navIds, `${entry.id} not found in nav`).toContain(entry.id);
    }
  });

  it("section labels are unique", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    const labels = sections.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("nav items use /components/{id} path pattern for component pages", () => {
    const sections = buildNavSections(PAGE_REGISTRY);
    const allItems = sections.flatMap((s) => s.items);
    const componentItems = allItems.filter((item) => item.path.startsWith("/components/"));
    for (const item of componentItems) {
      expect(item.path).toBe(`/components/${item.id}`);
    }
  });
});

describe("PageRegistry — sitemap paths", () => {
  it("buildSitemapPaths returns all page paths", () => {
    const paths = buildSitemapPaths(PAGE_REGISTRY);
    expect(paths.length).toBe(PAGE_REGISTRY.length);
    for (const entry of PAGE_REGISTRY) {
      expect(paths, `${entry.path} not in sitemap paths`).toContain(entry.path);
    }
  });
});

describe("PageRegistry — missing metadata guard", () => {
  it("fails loudly when an entry lacks id", () => {
    const badEntry = {
      label: "Test",
      category: "Forms",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow();
  });

  it("fails loudly when an entry lacks label", () => {
    const badEntry = {
      id: "test",
      category: "Forms",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow();
  });

  it("fails loudly when an entry lacks category", () => {
    const badEntry = {
      id: "test",
      label: "Test",
      path: "/components/test",
      load: () => Promise.resolve({}),
    } as unknown as PageEntry;
    expect(() => buildNavSections([badEntry])).toThrow();
  });
});
