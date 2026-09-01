/// <reference types="node" />
// @vitest-environment node
/**
 * theme-color pin test (#4858).
 *
 * `<meta name="theme-color">` is the color the mobile browser paints its
 * frame around the page. It must be a scheme-aware pair whose hex values
 * mirror the rialto `--rialto-surface` ground token literally (meta tags
 * can't read CSS custom properties) so the frame never clashes with the
 * page it wraps for a system-dark visitor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = resolve(__dirname, "../index.html");

const THEME_COLOR_META = /<meta name="theme-color"[^>]*>/g;

describe("gen index.html theme-color", () => {
  it("carries a scheme-aware pair matching the rialto surface tokens", () => {
    const html = readFileSync(INDEX_HTML_PATH, "utf-8");
    const metas = html.match(THEME_COLOR_META) ?? [];

    expect(metas).toHaveLength(2);

    const light = metas.find((m) => m.includes("prefers-color-scheme: light"));
    const dark = metas.find((m) => m.includes("prefers-color-scheme: dark"));

    expect(light).toContain('content="#f8f6f3"');
    expect(dark).toContain('content="#1e1c1a"');
  });
});
