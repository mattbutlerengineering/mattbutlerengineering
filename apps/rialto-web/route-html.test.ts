import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prerenderHeads } from "./src/data/route-head-data.js";
import {
  DEMOS_TITLE,
  catalogFromRegistrySource,
  renderDemosHtml,
  renderRouteHtml,
} from "./route-html";

const shell = readFileSync(resolve(__dirname, "index.html"), "utf8");

describe("renderDemosHtml", () => {
  it("serves the demos index its own title, distinct from the design-system home", () => {
    const html = renderDemosHtml(shell);
    expect(DEMOS_TITLE).not.toBe("Rialto — Design System");
    expect(html).toContain(`<title>${DEMOS_TITLE}</title>`);
    expect(html).not.toContain("<title>Rialto — Design System</title>");
  });

  it("keeps the social titles and canonical in step with the title", () => {
    const html = renderDemosHtml(shell);
    expect(html).toContain(`<meta property="og:title" content="${DEMOS_TITLE}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${DEMOS_TITLE}" />`);
    expect(html).toContain(
      '<link rel="canonical" href="https://mattbutlerengineering.com/rialto/demos/" />'
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://mattbutlerengineering.com/rialto/demos/" />'
    );
  });

  it("throws when the shell lacks an expected tag", () => {
    expect(() => renderDemosHtml("<html></html>")).toThrow(/title/);
  });
});

describe("renderRouteHtml", () => {
  it("points canonical and social tags at the page and escapes the heading", () => {
    const html = renderRouteHtml(shell, {
      title: "Checkbox & Radio — Rialto",
      url: "https://mattbutlerengineering.com/rialto/components/checkbox-radio",
    });
    expect(html).toContain("<title>Checkbox &amp; Radio — Rialto</title>");
    expect(html).toContain('<meta property="og:title" content="Checkbox &amp; Radio — Rialto" />');
    expect(html).toContain('<meta name="twitter:title" content="Checkbox &amp; Radio — Rialto" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://mattbutlerengineering.com/rialto/components/checkbox-radio" />'
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://mattbutlerengineering.com/rialto/components/checkbox-radio" />'
    );
    expect(html).not.toContain('content="Checkbox & Radio');
  });

  it("leaves theme-color, robots and the site description untouched", () => {
    const html = renderRouteHtml(shell, {
      title: "Invoice — Rialto",
      url: "https://mattbutlerengineering.com/rialto/examples/invoice",
    });
    expect(html.match(/<meta name="theme-color"[^>]*>/g)).toEqual(
      shell.match(/<meta name="theme-color"[^>]*>/g)
    );
    expect(html).toContain('<meta name="robots" content="index, follow" />');
    expect(html).toContain("precision-crafted React component library");
    expect(html).toContain('"url": "https://mattbutlerengineering.com/rialto/"');
  });
});

describe("registry source parse", () => {
  const source = readFileSync(resolve(__dirname, "src/data/page-registry.ts"), "utf8");
  const catalog = catalogFromRegistrySource(source);

  it("reads every authored entry, including headings that differ from the label", () => {
    const authoredIds = source.match(/\bid:\s*"/g) ?? [];
    expect(catalog).toHaveLength(authoredIds.length);
    expect(catalog.length).toBeGreaterThan(100);
    expect(catalog.map((entry) => entry.path)).toContain("/components/accordion");
    expect(catalog.map((entry) => entry.path)).toContain("/examples/invoice");
    expect(catalog.find((entry) => entry.path === "/examples/reservations")?.heading).toBe(
      "Reservations"
    );
    expect(catalog.find((entry) => entry.path === "/components/disabled-tooltip")?.heading).toBe(
      "DisabledTooltip"
    );
    expect(catalog.find((entry) => entry.path === "/components/button")?.label).toBe("Button");
    expect(catalog.every((entry) => entry.path.startsWith("/"))).toBe(true);
  });

  it("feeds prerender heads whose invoice file is that page's own url", () => {
    const invoice = prerenderHeads(catalog).find(
      (head) => head.fileName === "examples/invoice.html"
    );
    expect(invoice).toEqual({
      title: "Invoice — Rialto",
      url: "https://mattbutlerengineering.com/rialto/examples/invoice",
      fileName: "examples/invoice.html",
    });
  });
});
