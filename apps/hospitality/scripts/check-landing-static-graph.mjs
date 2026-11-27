#!/usr/bin/env node
// Guards the public /hospitality landing's first load (#9976). The landing is
// the entry's own graph plus a lazy ShowcaseLanding chunk, so whatever the
// entry statically imports is downloaded before the landing can render. The
// signed-in app's dependencies (json-render, and the venue context / query
// hooks that sit on @mbe/api-client + zod) must stay behind lazy imports.
// This reads the BUILT output: it walks the static import graph from the
// entry script and the index.html modulepreloads (dynamic `import()` is the
// lazy route and is ignored) and fails when a forbidden chunk is reachable.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = path.join(APP_DIR, "dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");

// Chunk basenames (hash stripped) the landing's static graph must not reach.
const FORBIDDEN =
  /^(json-render-vendor|zod-vendor|venue-context-object|VenueContext|useVenues|useVenueTeam|useMutation|create-query-hook)-[^/]*\.js$/;

// `import "./x.js"`, `import{a}from"./x.js"`, `export*from"./x.js"`. A dynamic
// `import("...")` has a paren before the specifier, so none of these match it.
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[^"';()]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g;
const HTML_JS_REFERENCE =
  /<(?:link|script)\b[^>]*(?:href|src)=["'][^"']*\/assets\/([^"']+\.js)["'][^>]*>/gi;

function staticImportsOf(source) {
  return [...source.matchAll(STATIC_IMPORT)].map((match) => match[1]);
}

/**
 * Pure decision. `chunks` maps built filename -> source text. Returns one
 * human-readable line per forbidden chunk reachable from index.html through
 * static imports; empty means the landing's first load stays clean.
 */
export function findLandingGraphLeaks({ indexHtml, chunks }) {
  const roots = [...indexHtml.matchAll(HTML_JS_REFERENCE)].map((match) => match[1]);
  const via = new Map(roots.map((file) => [file, "index.html"]));
  const queue = [...roots];

  while (queue.length > 0) {
    const file = queue.shift();
    for (const dep of staticImportsOf(chunks[file] ?? "")) {
      if (via.has(dep)) continue;
      via.set(dep, file);
      queue.push(dep);
    }
  }

  return [...via.entries()]
    .filter(([file]) => FORBIDDEN.test(file))
    .map(([file, parent]) => `${file} is statically reachable from the entry (via ${parent})`);
}

function main() {
  let indexHtml;
  let files;
  try {
    indexHtml = readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
    files = readdirSync(ASSETS_DIR).filter((file) => file.endsWith(".js"));
  } catch {
    console.error(`dist not found at ${DIST_DIR} — run "pnpm build" before size:check.`);
    process.exit(1);
  }

  const chunks = Object.fromEntries(
    files.map((file) => [file, readFileSync(path.join(ASSETS_DIR, file), "utf8")])
  );

  if (!files.some((file) => /^json-render-vendor-/.test(file))) {
    console.error("No json-render-vendor chunk in dist/assets — the guard would pass vacuously.");
    process.exit(1);
  }

  const leaks = findLandingGraphLeaks({ indexHtml, chunks });
  if (leaks.length > 0) {
    console.error(
      `The signed-in app's dependencies leaked onto the public landing's first load:\n${leaks.map((l) => `  - ${l}`).join("\n")}\n` +
        "Keep venue hooks and json-render behind lazy imports (see App.tsx, main.tsx, #9976)."
    );
    process.exit(1);
  }

  process.stdout.write("The landing's static graph excludes json-render and the venue hooks.\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
