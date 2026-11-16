import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const APPS_DIR = resolve(ROOT, "apps");

const START = "<!-- shared-fonts:start -->";
const END = "<!-- shared-fonts:end -->";

/**
 * Vite HTML entries have no include mechanism, so the web-font setup is
 * copy-pasted. This guard keeps the copies identical ("fixed in one place, not
 * the other" left rialto-web with zero web fonts for nine weeks, #4330).
 * Apps are discovered, not listed, as in app-html-inline-handlers.test.mjs.
 */
function appHtmlEntries() {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ app: entry.name, path: resolve(APPS_DIR, entry.name, "index.html") }))
    .filter((entry) => existsSync(entry.path));
}

/** Entries that carry the shared web-font block (by font stylesheet or marker). */
function fontEntries() {
  return appHtmlEntries()
    .map((entry) => ({ ...entry, html: readFileSync(entry.path, "utf8") }))
    .filter(({ html }) => html.includes("data-font-stylesheet") || html.includes(START));
}

function block(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1 || end < start) return null;
  return html.slice(start + START.length, end);
}

describe("shared web-font block in app index.html files", () => {
  const entries = fontEntries();

  it("finds at least two apps carrying the block", () => {
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it.each(entries.map((e) => [e.app, e]))("%s wraps the block in both markers", (_app, entry) => {
    expect(entry.html, `${entry.path} is missing ${START}`).toContain(START);
    expect(entry.html, `${entry.path} is missing ${END}`).toContain(END);
  });

  it("has identical text between the markers in every app", () => {
    const blocks = entries.map((e) => ({ app: e.app, text: block(e.html) }));
    const [first, ...rest] = blocks;
    for (const other of rest) {
      expect(
        other.text,
        `apps/${other.app}/index.html font block differs from apps/${first.app}/index.html`
      ).toBe(first.text);
    }
  });

  it.each(entries.map((e) => [e.app, e]))(
    "%s preload href equals its noscript stylesheet href",
    (_app, entry) => {
      const text = block(entry.html) ?? "";
      const preload = /rel="preload"[\s\S]*?href="([^"]+)"/.exec(text)?.[1];
      const noscript = /<noscript>[\s\S]*?href="([^"]+)"[\s\S]*?<\/noscript>/.exec(text)?.[1];
      expect(preload, `${entry.path} has no preload href`).toBeTruthy();
      expect(noscript, `${entry.path} has no noscript href`).toBe(preload);
    }
  );
});
