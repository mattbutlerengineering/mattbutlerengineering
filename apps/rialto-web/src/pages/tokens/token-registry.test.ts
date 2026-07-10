import { describe, expect, it, vi } from "vitest";
import { PAGE_REGISTRY } from "../../data/page-registry.js";

// Mock the real token-page modules so the load-factory assertions below verify
// wiring (path + default-export shape) without a real, rialto-heavy dynamic
// import that pushes the 5s test timeout under coverage instrumentation. The
// pages' real rendering is covered by their own *.test.tsx files.
vi.mock("./ColorPage.js", () => ({ ColorPage: () => null }));
vi.mock("./TypographyPage.js", () => ({ TypographyPage: () => null }));
vi.mock("./SurfacesPage.js", () => ({ SurfacesPage: () => null }));

/**
 * Guards the flip from stub token pages to real documentation pages.
 * Color, Typography, and Surfaces must be real (content-complete) pages, while
 * the remaining five token stubs stay untouched as comingSoon placeholders.
 */

const REAL_TOKEN_IDS = ["color", "typography", "surfaces"] as const;
const STUB_TOKEN_IDS = ["motion", "spacing", "radius", "shadows", "icon-vocabulary"] as const;

describe("token documentation pages — registry wiring", () => {
  it.each(REAL_TOKEN_IDS)("%s is a real page (not comingSoon)", (id) => {
    const entry = PAGE_REGISTRY.find((e) => e.id === id);
    expect(entry, `${id} entry missing`).toBeDefined();
    expect(entry!.comingSoon ?? false).toBe(false);
  });

  it.each(REAL_TOKEN_IDS)("%s load() resolves to a component with a default export", async (id) => {
    const entry = PAGE_REGISTRY.find((e) => e.id === id)!;
    const mod = (await entry.load()) as Record<string, unknown>;
    expect("default" in mod, `${id} load() missing default`).toBe(true);
    expect(typeof mod.default).toBe("function");
  });

  it.each(STUB_TOKEN_IDS)("%s remains an untouched comingSoon stub", async (id) => {
    const entry = PAGE_REGISTRY.find((e) => e.id === id);
    expect(entry, `${id} entry missing`).toBeDefined();
    expect(entry!.comingSoon).toBe(true);
    await expect(entry!.load()).resolves.toEqual({});
  });

  it("keeps all eight token entries in the Tokens category", () => {
    const tokenEntries = PAGE_REGISTRY.filter((e) => e.category === "Tokens");
    expect(tokenEntries).toHaveLength(8);
  });
});
