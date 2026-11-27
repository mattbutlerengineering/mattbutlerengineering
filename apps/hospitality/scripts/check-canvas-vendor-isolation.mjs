#!/usr/bin/env node
// Guards the #9894 split: konva (`canvas-vendor-*.js`, ~86 kB brotli) is only
// for the floor-plan editor, so it must stay off the initial bundle. A shared
// dependency pulled into canvas-vendor by the bundler's recursive claiming
// would put it back on every page (the guest booking page included) while the
// manualChunks config test still passed. This reads the BUILT output:
//   1. dist/index.html must not modulepreload or script-load canvas-vendor;
//   2. only floor-plan-*.js may statically import canvas-vendor (dynamic
//      `import()` is the lazy route and is fine).

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = path.join(APP_DIR, "dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");

const CANVAS_VENDOR = /^canvas-vendor-.*\.js$/;
const FLOOR_PLAN = /^floor-plan-.*\.js$/;

// `import "./canvas-vendor-x.js"`, `import{a}from"./canvas-vendor-x.js"`,
// `export*from"./canvas-vendor-x.js"`. A dynamic `import("...")` has a paren
// before the specifier, so none of these match it.
const STATIC_IMPORT =
  /\b(?:import|export)\s*(?:[^"';()]*?\bfrom\s*)?["']\.\/canvas-vendor-[^"']*\.js["']/;

const HTML_EAGER_REFERENCE =
  /<(?:link|script)\b[^>]*(?:href|src)=["'][^"']*canvas-vendor-[^"']*\.js["'][^>]*>/i;

/**
 * Pure decision. `chunks` maps built filename -> source text. Returns one
 * human-readable line per leak; empty means canvas-vendor is isolated.
 */
export function findCanvasVendorLeaks({ indexHtml, chunks }) {
  const leaks = [];

  if (HTML_EAGER_REFERENCE.test(indexHtml)) {
    leaks.push("index.html loads canvas-vendor eagerly (modulepreload or script tag)");
  }

  for (const [file, source] of Object.entries(chunks)) {
    if (CANVAS_VENDOR.test(file) || FLOOR_PLAN.test(file)) continue;
    if (STATIC_IMPORT.test(source)) {
      leaks.push(`${file} statically imports canvas-vendor (only floor-plan-*.js may)`);
    }
  }

  return leaks;
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

  if (!files.some((file) => CANVAS_VENDOR.test(file))) {
    console.error("No canvas-vendor chunk in dist/assets — the guard would pass vacuously.");
    process.exit(1);
  }

  const leaks = findCanvasVendorLeaks({ indexHtml, chunks });
  if (leaks.length > 0) {
    console.error(
      `canvas-vendor (konva) leaked onto the initial bundle:\n${leaks.map((l) => `  - ${l}`).join("\n")}\n` +
        "Keep shared deps out of canvas-vendor (see vite.config.ts codeSplitting, #9894)."
    );
    process.exit(1);
  }

  process.stdout.write("canvas-vendor stays off the initial bundle.\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
