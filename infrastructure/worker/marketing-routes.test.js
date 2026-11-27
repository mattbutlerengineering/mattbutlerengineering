import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isKnownMarketingPath } from "./marketing-routes.js";
import edgeRouter from "./edge-router.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const ORIGIN = "https://mattbutlerengineering.com";

function sitemapMarketingPaths() {
  const xml = readFileSync(resolve(ROOT, "apps/marketing/public/sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => !/^\/(rialto|gen|hospitality)(\/|$)/.test(p));
}

describe("isKnownMarketingPath", () => {
  it("knows every marketing sitemap URL", () => {
    const paths = sitemapMarketingPaths();
    expect(paths).toContain("/");
    expect(paths.some((p) => p.startsWith("/shipped/"))).toBe(true);
    for (const p of paths) expect(isKnownMarketingPath(p), p).toBe(true);
  });

  it("knows every static route in the marketing route meta", () => {
    const src = readFileSync(resolve(ROOT, "apps/marketing/src/utils/route-meta-data.ts"), "utf8");
    const patterns = [...src.matchAll(/pattern: "([^"]+)"/g)].map((m) => m[1]);
    for (const p of patterns.filter((x) => x !== "*" && !x.includes(":"))) {
      expect(isKnownMarketingPath(p), p).toBe(true);
    }
  });

  it("tolerates a trailing slash and a shipped story", () => {
    expect(isKnownMarketingPath("/status/")).toBe(true);
    expect(isKnownMarketingPath("/shipped/some-story")).toBe(true);
    expect(isKnownMarketingPath("/weekly")).toBe(true);
  });

  it("rejects unknown paths", () => {
    for (const p of ["/no-such-page", "/shipped/a/b", "/statuses", "/about"]) {
      expect(isKnownMarketingPath(p), p).toBe(false);
    }
  });
});

// Cloudflare-only API; a passthrough is enough to observe status and body.
class PassthroughHTMLRewriter {
  on() {
    return this;
  }
  transform(response) {
    return response;
  }
}

describe("edge router marketing status", () => {
  vi.stubGlobal("HTMLRewriter", PassthroughHTMLRewriter);

  const html = (body) =>
    new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
  const envWith = (response) => ({
    MARKETING: { fetch: vi.fn(async () => response) },
    HOSPITALITY: { fetch: vi.fn(async () => html("<html>h</html>")) },
  });
  const get = (path, env) => edgeRouter.fetch(new Request(`${ORIGIN}${path}`), env);

  it("answers an unknown page with 404 and the SPA HTML", async () => {
    const res = await get("/no-such-page", envWith(html("<html>SPA</html>")));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("SPA");
  });

  it("keeps 200 for known routes and shipped stories", async () => {
    for (const p of ["/", "/metrics", "/shipped", "/shipped/x"]) {
      const res = await get(p, envWith(html("<html>SPA</html>")));
      expect(res.status, p).toBe(200);
    }
  });

  it("does not turn non-HTML assets into 404", async () => {
    const asset = new Response("<xml/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    const res = await get("/anything.xml", envWith(asset));
    expect(res.status).toBe(200);
  });

  it("leaves other apps alone", async () => {
    const env = envWith(html("<html>SPA</html>"));
    const res = await get("/hospitality/anything", env);
    expect(res.status).toBe(200);
  });
});
