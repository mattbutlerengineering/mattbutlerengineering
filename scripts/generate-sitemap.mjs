#!/usr/bin/env node
/**
 * generate-sitemap.mjs — derives apps/marketing/public/sitemap.xml from the
 * route inventory (scripts/ui-quality/routes.mjs) instead of a hand-edited file.
 *
 *   marketing  → every `page` route of apps/marketing/src/App.tsx
 *   rialto-web → "/" plus every PAGE_REGISTRY route (the paths of
 *                REGISTRY_SITEMAP_PATHS, derived via the shared `derivePath`),
 *                served under the /rialto/ mount
 *   hospitality → its own app; listed as a fixed entry
 *
 * Deterministic: entries are sorted, no <lastmod>, no timestamps.
 *
 * Usage: node scripts/generate-sitemap.mjs [generate|check]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RIALTO_WEB_REGISTRY, createRepoIo, extractApp } from "./ui-quality/routes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SITEMAP_PATH = "apps/marketing/public/sitemap.xml";
const ORIGIN = "https://mattbutlerengineering.com";

const isStaticPage = (row) => row.kind === "page" && !/[:*]/.test(row.route);
const toPath = (route) => (route === "/" ? "/" : `/${route}`);

/** Absolute site paths (sorted, unique) with their priority. */
export function collectEntries(marketingRows, rialtoRows) {
  const marketing = marketingRows
    .filter(isStaticPage)
    .map((r) => ({ path: toPath(r.route), priority: r.route === "/" ? "1.0" : "0.6" }));
  const rialto = rialtoRows
    .filter(isStaticPage)
    .filter((r) => r.route === "/" || r.source_files.includes(RIALTO_WEB_REGISTRY))
    .map((r) => ({
      path: r.route === "/" ? "/rialto/" : `/rialto${toPath(r.route)}`,
      priority: r.route === "/" ? "0.8" : "0.6",
    }));
  const hospitality = [{ path: "/hospitality", priority: "0.8" }];
  const all = [...marketing, ...rialto, ...hospitality];
  return [...new Map(all.map((e) => [e.path, e])).values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
}

export function renderSitemap(entries) {
  const urls = entries.map(
    (e) =>
      `  <url>\n    <loc>${ORIGIN}${e.path}</loc>\n    <priority>${e.priority}</priority>\n  </url>`
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export function buildSitemap(io) {
  return renderSitemap(collectEntries(extractApp("marketing", io), extractApp("rialto-web", io)));
}

function main(argv) {
  const mode = argv[0] ?? "generate";
  const out = resolve(ROOT, SITEMAP_PATH);
  const next = buildSitemap(createRepoIo(ROOT));
  if (mode === "check") {
    if (readFileSync(out, "utf8") !== next) {
      console.error(`${SITEMAP_PATH} is stale — run: node scripts/generate-sitemap.mjs`);
      return 1;
    }
    return 0;
  }
  if (mode !== "generate") {
    console.error("usage: generate-sitemap.mjs [generate|check]");
    return 2;
  }
  writeFileSync(out, next);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
