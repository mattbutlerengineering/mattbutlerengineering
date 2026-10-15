import { describe, expect, it } from "vitest";
import sitemapXml from "../../../marketing/public/sitemap.xml?raw";
import { REGISTRY_SITEMAP_PATHS } from "./page-registry";

const ORIGIN = "https://mattbutlerengineering.com/rialto";

describe("published sitemap vs PAGE_REGISTRY", () => {
  it("lists every registry path (sitemap ⊇ registry)", () => {
    const locs = new Set([...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    const missing = REGISTRY_SITEMAP_PATHS.filter((p) => !locs.has(`${ORIGIN}${p}`));
    expect(missing).toEqual([]);
  });
});
