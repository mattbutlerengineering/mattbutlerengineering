import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_META } from "../src/utils/route-meta-data.js";
import { prerenderableRoutes, renderRouteHtml } from "./route-html.js";

const here = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(here, "../index.html"), "utf8");

const meta = {
  pattern: "/metrics",
  title: "Quality Metrics — Matt Butler Engineering",
  description: 'Metrics for "agents" & <humans>.',
};

describe("renderRouteHtml", () => {
  const html = renderRouteHtml(shell, meta);

  it("sets the title and every description/social tag from the route meta", () => {
    expect(html).toContain("<title>Quality Metrics — Matt Butler Engineering</title>");
    expect(html).toMatch(
      /name="twitter:title"\s+content="Quality Metrics — Matt Butler Engineering"/
    );
    expect(html).toMatch(
      /property="og:title"\s+content="Quality Metrics — Matt Butler Engineering"/
    );
    expect(html).toMatch(
      /name="description"\s+content="Metrics for &quot;agents&quot; &amp; &lt;humans&gt;\."/
    );
    expect(html).toMatch(/property="og:description"\s+content="Metrics for &quot;agents&quot;/);
    expect(html).toMatch(/name="twitter:description"\s+content="Metrics for &quot;agents&quot;/);
  });

  it("points canonical and og:url at the route, not the homepage", () => {
    expect(html).toContain(
      '<link rel="canonical" href="https://mattbutlerengineering.com/metrics" />'
    );
    expect(html).toMatch(
      /property="og:url"\s+content="https:\/\/mattbutlerengineering\.com\/metrics"/
    );
  });

  it("leaves the rest of the shell untouched", () => {
    expect(html).toContain('<div id="root">');
    expect(html).toContain("og-marketing.png");
    expect(html.replace(/<title>.*<\/title>/, "").length).toBeLessThan(shell.length + 400);
  });

  it("throws when a tag it must rewrite is missing", () => {
    expect(() => renderRouteHtml("<html><head></head></html>", meta)).toThrow(/title/);
    expect(() => renderRouteHtml(shell.replace(/<link rel="canonical"[^>]*>/, ""), meta)).toThrow(
      /canonical/
    );
  });
});

describe("prerenderableRoutes", () => {
  it("keeps static, indexable routes and drops params, the catch-all and home", () => {
    const routes = prerenderableRoutes([
      { pattern: "/status", title: "t", description: "d" },
      { pattern: "/shipped/:slug", title: "t", description: "d" },
      { pattern: "*", title: "t", description: "d", indexable: false },
    ]);
    expect(routes.map((r) => r.pattern)).toEqual(["/status"]);
  });

  it("covers every static route in the real route table", () => {
    const patterns = prerenderableRoutes(ROUTE_META).map((r) => r.pattern);
    expect(patterns).toEqual(
      expect.arrayContaining(["/status", "/metrics", "/acmm", "/ai-health", "/shipped"])
    );
    expect(patterns.every((p) => !p.includes(":") && p !== "*")).toBe(true);
  });
});
