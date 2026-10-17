import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isShippedFeaturesSnapshot, SHIPPED_FEATURES } from "./shipped-features";

const SRC = join(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(join(SRC, relative), "utf-8");

const SNAPSHOT_PATH = "data/shipped-features.json";
const snapshotText = read(SNAPSHOT_PATH);
const snapshot: unknown = JSON.parse(snapshotText);

describe("shipped features snapshot", () => {
  it("passes the runtime schema guard", () => {
    expect(isShippedFeaturesSnapshot(snapshot)).toBe(true);
  });

  it("has unique slugs", () => {
    const slugs = SHIPPED_FEATURES.map((feature) => feature.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("is byte-identical to its canonical serialization (no hand edits or formatter drift)", () => {
    expect(snapshotText).toBe(JSON.stringify(snapshot, null, 2) + "\n");
  });
});

describe("shipped pages stay static", () => {
  const FILES = [
    "pages/ShippedIndexPage.tsx",
    "pages/ShippedStoryPage.tsx",
    "data/shipped-features.ts",
    "components/factory/FactorySection.tsx",
  ];
  const FORBIDDEN = [/fetch\(/, /useQuery/, /api\.github\.com/, /import\.meta\.env/];

  for (const file of FILES) {
    it(`${file} makes no runtime fetch or GitHub token reference`, () => {
      const source = read(file);
      for (const pattern of FORBIDDEN) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});

describe("shipped links resolve", () => {
  const appSource = read("App.tsx");
  const KNOWN_SURFACES = ["/", "/hospitality/", "/rialto/"];

  it("routes /shipped and /shipped/:slug in App.tsx", () => {
    expect(appSource).toContain('path="/shipped"');
    expect(appSource).toContain('path="/shipped/:slug"');
  });

  it("redirects every non-root liveUrl surface in App.tsx", () => {
    for (const surface of KNOWN_SURFACES.filter((s) => s !== "/")) {
      expect(appSource, `${surface} has no route or redirect`).toContain(`to="${surface}"`);
    }
  });

  it("every liveUrl is null or a known surface", () => {
    for (const feature of SHIPPED_FEATURES) {
      if (feature.liveUrl === null) continue;
      expect(
        KNOWN_SURFACES.includes(feature.liveUrl),
        `${feature.slug} liveUrl ${feature.liveUrl} is off-site or unrouted`
      ).toBe(true);
    }
  });

  it("every slug the homepage block renders maps to a snapshot entry", () => {
    const slugs = new Set(SHIPPED_FEATURES.map((feature) => feature.slug));
    for (const feature of SHIPPED_FEATURES.slice(0, 3)) {
      expect(slugs.has(feature.slug)).toBe(true);
    }
    expect(read("components/factory/FactorySection.tsx")).toContain("SHIPPED_FEATURES.slice(0, 3)");
  });
});
