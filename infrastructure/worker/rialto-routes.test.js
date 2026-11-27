import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isKnownRialtoPath } from "./rialto-routes.js";
import edgeRouter from "./edge-router.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const ORIGIN = "https://mattbutlerengineering.com";

function sitemapRialtoPaths() {
  const xml = readFileSync(resolve(ROOT, "apps/marketing/public/sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => /^\/rialto(\/|$)/.test(p));
}

describe("isKnownRialtoPath", () => {
  it("knows every /rialto/ sitemap URL", () => {
    const paths = sitemapRialtoPaths();
    expect(paths).toContain("/rialto/");
    expect(paths.length).toBeGreaterThan(50);
    for (const p of paths) expect(isKnownRialtoPath(p), p).toBe(true);
  });

  it("knows the bare mount, trailing slashes and dynamic demo routes", () => {
    expect(isKnownRialtoPath("/rialto")).toBe(true);
    expect(isKnownRialtoPath("/rialto/components/button/")).toBe(true);
    expect(isKnownRialtoPath("/rialto/demos/drivers/42")).toBe(true);
    expect(isKnownRialtoPath("/rialto/demos/drivers/42/edit")).toBe(true);
    expect(isKnownRialtoPath("/rialto/privacy")).toBe(true);
  });

  it("rejects unknown paths", () => {
    for (const p of [
      "/rialto/no-such-page",
      "/rialto/components/no-such",
      "/rialto/demos/drivers/1/2/3",
    ]) {
      expect(isKnownRialtoPath(p), p).toBe(false);
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

describe("edge router rialto status", () => {
  vi.stubGlobal("HTMLRewriter", PassthroughHTMLRewriter);

  const html = (body) =>
    new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
  const envWith = (response) => ({
    RIALTO: { fetch: vi.fn(async () => response) },
    MARKETING: { fetch: vi.fn(async () => html("<html>m</html>")) },
    HOSPITALITY: { fetch: vi.fn(async () => html("<html>h</html>")) },
  });
  const get = (path, env) => edgeRouter.fetch(new Request(`${ORIGIN}${path}`), env);

  it("answers an unknown page with 404 and the SPA HTML (not-found page body)", async () => {
    const res = await get("/rialto/no-such-page", envWith(html("<html>NOTFOUND</html>")));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("NOTFOUND");
  });

  it("keeps 200 for every sitemap URL", async () => {
    for (const p of sitemapRialtoPaths()) {
      const res = await get(p, envWith(html("<html>SPA</html>")));
      expect(res.status, p).toBe(200);
    }
  });

  it("does not turn non-HTML assets into 404", async () => {
    const asset = new Response("body{}", { status: 200, headers: { "Content-Type": "text/css" } });
    const res = await get("/rialto/assets/app.css", envWith(asset));
    expect(res.status).toBe(200);
  });
});
