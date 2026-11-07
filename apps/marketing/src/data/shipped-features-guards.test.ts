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

  it("is non-empty, so an automated refresh cannot silently wipe the homepage section (#7348)", () => {
    expect(SHIPPED_FEATURES.length).toBeGreaterThan(0);
    const newest = Math.max(...SHIPPED_FEATURES.map((f) => Date.parse(f.lastMergedAt)));
    expect(Number.isNaN(newest)).toBe(false);
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

const APPS = join(SRC, "..", "..");
const readApp = (relative: string) => readFileSync(join(APPS, relative), "utf-8");

/** Real hospitality routes, from the router the collector's mapping targets. */
const hospitalityRoutes = new Set(
  [...readApp("hospitality/src/main.tsx").matchAll(/path: "([^"]+)"/g)].map((m) => m[1])
);
/** Real rialto showcase component ids, from the page registry the collector reads. */
const rialtoComponentIds = new Set(
  [...readApp("rialto-web/src/data/page-registry.ts").matchAll(/\{\s*id:\s*"([^"]+)"[^}]*\}/g)]
    .filter((m) => !/category:\s*"Examples"/.test(m[0]) && !/comingSoon/.test(m[0]))
    .map((m) => m[1])
);

/** An app root, or a deep link to a route/page that really exists in its app. */
function isResolvableLiveUrl(url: string): boolean {
  if (url === "/" || url === "/hospitality/" || url === "/rialto/") return true;
  const hospitality = /^\/hospitality\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)$/.exec(url);
  if (hospitality) return hospitalityRoutes.has(hospitality[1]!);
  const rialto = /^\/rialto\/components\/([a-z0-9-]+)$/.exec(url);
  if (rialto) return rialtoComponentIds.has(rialto[1]!);
  return false;
}

describe("isResolvableLiveUrl", () => {
  it("accepts app roots and real deep links", () => {
    for (const url of [
      "/",
      "/hospitality/",
      "/rialto/",
      "/hospitality/dashboard",
      "/rialto/components/button",
    ]) {
      expect(isResolvableLiveUrl(url), url).toBe(true);
    }
  });

  it("rejects guessed or off-site routes", () => {
    for (const url of [
      "/hospitality/no-such-page",
      "/rialto/components/no-such-component",
      "/gen/",
      "https://example.com/",
      "/hospitality/dashboard/",
    ]) {
      expect(isResolvableLiveUrl(url), url).toBe(false);
    }
  });
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

  it("every liveUrl is null, an app root, or a deep link to a real route", () => {
    for (const feature of SHIPPED_FEATURES) {
      if (feature.liveUrl === null) continue;
      expect(
        isResolvableLiveUrl(feature.liveUrl),
        `${feature.slug} liveUrl ${feature.liveUrl} is off-site, unrouted, or a guessed route`
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
