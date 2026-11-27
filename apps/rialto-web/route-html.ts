import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { derivePath } from "../../scripts/ui-quality/derive-path.mjs";
import { extractLayoutDescription } from "./src/data/layout-description.js";
import {
  DEMOS_DESCRIPTION,
  DEMOS_TITLE,
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

export { DEMOS_TITLE };
const DEMOS_URL = "https://mattbutlerengineering.com/rialto/demos/";

interface ParsedEntry {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly heading?: string;
  /** The entry's source text, for reading its explicit `load` import. */
  readonly object: string;
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
    return heading ? { id, label, category, heading, object } : { id, label, category, object };
  });
}

const DEFAULT_PAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "src/pages");

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? listFiles(join(dir, item.name)) : [join(dir, item.name)]
  );
}

function toPascalCase(label: string): string {
  return label
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/**
 * The page module for an entry: its explicit `load: () => import("../pages/...")`
 * path, else the `{Label}Page` / `{Label}ExamplePage` file convention.
 */
function pageFileFor(entry: ParsedEntry, files: readonly string[], dir: string) {
  const explicit = entry.object.match(/import\(\s*"\.\.\/pages\/([^"]+)"\s*\)/)?.[1];
  if (explicit) return join(dir, `${explicit}.tsx`);
  const suffix = entry.category === "Examples" ? "ExamplePage" : "Page";
  return files.find((file) => file.endsWith(`/${toPascalCase(entry.label)}${suffix}.tsx`));
}

export function catalogFromRegistrySource(
  source: string,
  pagesDir: string = DEFAULT_PAGES_DIR
): CatalogEntry[] {
  const files = listFiles(pagesDir);
  return parseRegistryEntries(source).map((entry) => {
    const file = pageFileFor(entry, files, pagesDir);
    const description = file ? extractLayoutDescription(readFileSync(file, "utf8")) : undefined;
    return {
      path: derivePath(entry),
      label: entry.label,
      ...(entry.heading ? { heading: entry.heading } : {}),
      ...(description ? { description } : {}),
    };
  });
}

const DESCRIPTION_TAGS = [
  ["name", "description"],
  ["property", "og:description"],
  ["name", "twitter:description"],
] as const;

/** The shell with description, og:description and twitter:description replaced. */
function withDescription(shell: string, description: string): string {
  const content = escapeHtml(description);
  return DESCRIPTION_TAGS.reduce(
    (html, [attribute, key]) =>
      replaceOnce(
        html,
        new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*/>`),
        `<meta ${attribute}="${key}" content="${content}" />`,
        key
      ),
    shell
  );
}

/** The built shell with one route's title, social titles and URLs substituted. */
export function renderRouteHtml(
  shell: string,
  head: Pick<PrerenderHead, "title" | "url" | "robots" | "description">
): string {
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
  html = replaceOnce(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${url}" />`,
    "og:url"
  );
  if (head.description !== undefined) html = withDescription(html, head.description);
  if (head.robots === undefined) return html;
  return replaceOnce(
    html,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/,
    `<meta name="robots" content="${head.robots}" />`,
    "robots"
  );
}

/** The built shell with the demos index's title, social titles and URLs substituted. */
export function renderDemosHtml(shell: string): string {
  return renderRouteHtml(shell, {
    title: DEMOS_TITLE,
    url: DEMOS_URL,
    description: DEMOS_DESCRIPTION,
  });
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
