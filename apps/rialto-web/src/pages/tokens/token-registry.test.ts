import { describe, expect, it, vi } from "vitest";
import { PAGE_REGISTRY } from "../../data/page-registry.js";

// Mock the real token-page modules so the load-factory assertions below verify
// wiring (path + default-export shape) without a real, rialto-heavy dynamic
// import that pushes the 5s test timeout under coverage instrumentation. The
// pages' real rendering is covered by their own *.test.tsx files.
vi.mock("./ColorPage.js", () => ({ ColorPage: () => null }));
vi.mock("./TypographyPage.js", () => ({ TypographyPage: () => null }));
vi.mock("./SurfacesPage.js", () => ({ SurfacesPage: () => null }));
vi.mock("./MotionPage.js", () => ({ MotionPage: () => null }));
vi.mock("./SpacingPage.js", () => ({ SpacingPage: () => null }));
vi.mock("./RadiusPage.js", () => ({ RadiusPage: () => null }));
vi.mock("./ShadowsPage.js", () => ({ ShadowsPage: () => null }));
vi.mock("./IconVocabularyPage.js", () => ({ IconVocabularyPage: () => null }));

/**
 * Guards the token documentation tier. All eight token entries are now
 * content-complete pages (Color/Typography/Surfaces from #3293; Motion, Spacing,
 * Radius, Shadows, and Icon Vocabulary from #3325) — none remains a comingSoon
 * stub.
 */

const REAL_TOKEN_IDS = [
  "color",
  "typography",
  "surfaces",
  "motion",
  "spacing",
  "radius",
  "shadows",
  "icon-vocabulary",
] as const;

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

  it("leaves no comingSoon stubs in the Tokens category", () => {
    const stubs = PAGE_REGISTRY.filter((e) => e.category === "Tokens" && e.comingSoon);
    expect(stubs).toHaveLength(0);
  });

  it("keeps all eight token entries in the Tokens category", () => {
    const tokenEntries = PAGE_REGISTRY.filter((e) => e.category === "Tokens");
    expect(tokenEntries).toHaveLength(8);
  });
});
