import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RIALTO_WEB_REGISTRY, createRepoIo } from "../ui-quality/routes.mjs";
import {
  SHIPPED_FEATURES_PATH,
  SITEMAP_PATH,
  buildSitemap,
  collectEntries,
  renderSitemap,
} from "../generate-sitemap.mjs";
import { FAMILIES } from "../regen-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const page = (route, extra = []) => ({ route, kind: "page", source_files: extra });

describe("collectEntries", () => {
  it("keeps static pages only, sorts, and prefixes rialto routes", () => {
    const entries = collectEntries(
      [page("weekly"), page("/"), page("x/:id"), { route: "rialto/*", kind: "redirect" }],
      [page("/"), page("components/b", [RIALTO_WEB_REGISTRY]), page("demos/login", ["x.tsx"])]
    );
    expect(entries.map((e) => e.path)).toEqual([
      "/",
      "/gen/",
      "/hospitality",
      "/rialto/",
      "/rialto/components/b",
      "/rialto/demos/",
      "/weekly",
    ]);
  });
});

describe("collectEntries shipped stories", () => {
  it("adds one /shipped/<slug> url per story slug, deterministically ordered", () => {
    const entries = collectEntries(
      [page("shipped"), page("shipped/:slug")],
      [],
      ["b-story", "a-story"]
    );
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/shipped/a-story");
    expect(paths).toContain("/shipped/b-story");
    expect(paths.indexOf("/shipped/a-story")).toBeLessThan(paths.indexOf("/shipped/b-story"));
    expect(paths).not.toContain("/shipped/:slug");
  });
});

describe("renderSitemap", () => {
  it("is deterministic and carries no timestamps", () => {
    const xml = renderSitemap([{ path: "/", priority: "1.0" }]);
    expect(xml).toBe(renderSitemap([{ path: "/", priority: "1.0" }]));
    expect(xml).not.toContain("lastmod");
  });
});

describe("committed sitemap", () => {
  it("matches the generator output", () => {
    expect(readFileSync(resolve(ROOT, SITEMAP_PATH), "utf8")).toBe(
      buildSitemap(createRepoIo(ROOT))
    );
  });

  it("includes marketing routes that were previously missing", () => {
    const xml = readFileSync(resolve(ROOT, SITEMAP_PATH), "utf8");
    for (const p of ["/status", "/acmm", "/ai-health"]) {
      expect(xml).toContain(`<loc>https://mattbutlerengineering.com${p}</loc>`);
    }
  });

  it("lists every shipped story from the committed snapshot", () => {
    const xml = readFileSync(resolve(ROOT, SITEMAP_PATH), "utf8");
    const snapshot = JSON.parse(readFileSync(resolve(ROOT, SHIPPED_FEATURES_PATH), "utf8"));
    expect(snapshot.features.length).toBeGreaterThan(0);
    for (const f of snapshot.features) {
      expect(xml).toContain(`<loc>https://mattbutlerengineering.com/shipped/${f.slug}</loc>`);
    }
  });

  it("is registered as a regen family", () => {
    expect(FAMILIES.find((f) => f.id === "marketing-sitemap")?.outputs).toEqual([SITEMAP_PATH]);
  });

  it("regenerates when the shipped-features snapshot changes", () => {
    const hit = FAMILIES.find((f) => f.id === "marketing-sitemap")?.changedBy(
      SHIPPED_FEATURES_PATH
    );
    expect(hit?.outputs).toEqual([SITEMAP_PATH]);
  });
});
