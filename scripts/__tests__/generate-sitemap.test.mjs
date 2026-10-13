import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RIALTO_WEB_REGISTRY, createRepoIo } from "../ui-quality/routes.mjs";
import { SITEMAP_PATH, buildSitemap, collectEntries, renderSitemap } from "../generate-sitemap.mjs";
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
      "/hospitality",
      "/rialto/",
      "/rialto/components/b",
      "/weekly",
    ]);
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
    for (const p of ["/status", "/weekly", "/acmm", "/ai-health"]) {
      expect(xml).toContain(`<loc>https://mattbutlerengineering.com${p}</loc>`);
    }
  });

  it("is registered as a regen family", () => {
    expect(FAMILIES.find((f) => f.id === "marketing-sitemap")?.outputs).toEqual([SITEMAP_PATH]);
  });
});
