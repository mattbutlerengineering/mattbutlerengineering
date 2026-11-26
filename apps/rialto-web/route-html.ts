import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { derivePath } from "../../scripts/ui-quality/derive-path.mjs";
import {
  prerenderHeads,
  type CatalogEntry,
  type PrerenderHead,
} from "./src/data/route-head-data.js";

/**
 * Crawlers and link-preview bots read the served HTML, not the title the
 * client sets after render. `/rialto/demos/` otherwise answers with the
 * design-system home's `index.html` and the same title. This emits
 * `demos/index.html` (the edge router strips `/rialto`, so Workers Static
 * Assets serves it for `/demos/`) with the demos index's own head tags,
 * plus one `<route>.html` per sitemap page and static demo route.
 *
 * `components/accordion.html` is served at `/components/accordion` by the
 * default `auto-trailing-slash` html handling — the same way marketing serves
 * `/metrics` from `metrics.html`. A `components/accordion/index.html` would
 * 307 the sitemap URL onto a trailing slash. No edge-router change: the
 * prefix strip already forwards `/rialto/components/accordion` as
 * `/components/accordion`. Dynamic demo URLs (`/demos/drivers/:id`) stay
 * client-only.
 */

export const DEMOS_TITLE = "Demos — Rialto Design System";
const DEMOS_URL = "https://mattbutlerengineering.com/rialto/demos/";

interface ParsedEntry {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly heading?: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function replaceOnce(html: string, pattern: RegExp, replacement: string, label: string): string {
  const matches = html.match(new RegExp(pattern.source, "g")) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `route-html: expected exactly one ${label} tag in the built index.html, found ${matches.length}`
    );
  }
  return html.replace(pattern, () => replacement);
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Object literals at the top of the RAW_PAGE_ENTRIES array, comments and strings skipped. */
function extractTopLevelObjects(source: string, arrayStart: number): string[] {
  const objects: string[] = [];
  let arrayDepth = 0;
  let objectDepth = 0;
  let objectStart = -1;

  for (let i = arrayStart; i < source.length;) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const newline = source.indexOf("\n", i);
      i = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      i = close < 0 ? source.length : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "[") arrayDepth += 1;
    else if (ch === "]") {
      arrayDepth -= 1;
      if (arrayDepth === 0) break;
    } else if (ch === "{") {
      if (arrayDepth === 1 && objectDepth === 0) objectStart = i;
      objectDepth += 1;
    } else if (ch === "}") {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        objects.push(source.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
    i += 1;
  }

  return objects;
}

function stringProp(object: string, name: string): string | undefined {
  const match = object.match(new RegExp(`\\b${name}:\\s*"([^"]*)"`));
  return match?.[1];
}

/**
 * Reads id, label, category and optional heading from the page-registry source.
 * The registry module itself pulls `import.meta.glob`, which the Vite config
 * bundle cannot evaluate, so the build reads the literals instead.
 */
function parseRegistryEntries(source: string): ParsedEntry[] {
  const marker = source.indexOf("const RAW_PAGE_ENTRIES");
  if (marker < 0) {
    throw new Error("route-html: RAW_PAGE_ENTRIES not found in page-registry.ts");
  }
  // The type annotation is `RawPageEntry[]`, so the first `[` is not the array.
  const assign = source.indexOf("= [", marker);
  const arrayStart = assign < 0 ? -1 : assign + 2;
  if (arrayStart < 0) {
    throw new Error("route-html: RAW_PAGE_ENTRIES is not an array");
  }
  const objects = extractTopLevelObjects(source, arrayStart);
  if (objects.length === 0) {
    throw new Error("route-html: RAW_PAGE_ENTRIES parsed to zero entries");
  }
  return objects.map((object) => {
    const id = stringProp(object, "id");
    const label = stringProp(object, "label");
    const category = stringProp(object, "category");
    const heading = stringProp(object, "heading");
    if (!id || !label || !category) {
      throw new Error(
        `route-html: registry entry is missing id, label or category: ${object.slice(0, 120)}`
      );
    }
    return heading ? { id, label, category, heading } : { id, label, category };
  });
}

export function catalogFromRegistrySource(source: string): CatalogEntry[] {
  return parseRegistryEntries(source).map((entry) => ({
    path: derivePath(entry),
    label: entry.label,
    ...(entry.heading ? { heading: entry.heading } : {}),
  }));
}

/** The built shell with one route's title, social titles and URLs substituted. */
export function renderRouteHtml(shell: string, head: Pick<PrerenderHead, "title" | "url">): string {
  const title = escapeHtml(head.title);
  const url = escapeHtml(head.url);
  let html = replaceOnce(shell, /<title>[^<]*<\/title>/, `<title>${title}</title>`, "title");
  html = replaceOnce(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${title}" />`,
    "og:title"
  );
  html = replaceOnce(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${title}" />`,
    "twitter:title"
  );
  html = replaceOnce(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${url}" />`,
    "canonical"
  );
  return replaceOnce(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${url}" />`,
    "og:url"
  );
}

/** The built shell with the demos index's title, social titles and URLs substituted. */
export function renderDemosHtml(shell: string): string {
  return renderRouteHtml(shell, { title: DEMOS_TITLE, url: DEMOS_URL });
}

/** Vite build plugin: emits per-route HTML beside `index.html`. */
export function routeHtmlPlugin(): Plugin {
  let registryPath = "";
  return {
    name: "mbe:rialto-route-html",
    apply: "build",
    configResolved(config) {
      registryPath = resolve(config.root, "src/data/page-registry.ts");
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const shell = bundle["index.html"];
        if (shell === undefined || shell.type !== "asset") {
          throw new Error("route-html: index.html was not emitted before route pages");
        }
        if (registryPath === "") {
          throw new Error("route-html: config did not resolve before emit");
        }
        const source = String(shell.source);
        const entries = catalogFromRegistrySource(readFileSync(registryPath, "utf8"));
        for (const head of prerenderHeads(entries)) {
          this.emitFile({
            type: "asset",
            fileName: head.fileName,
            source: renderRouteHtml(source, head),
          });
        }
        this.emitFile({
          type: "asset",
          fileName: "demos/index.html",
          source: renderDemosHtml(source),
        });
      },
    },
  };
}
