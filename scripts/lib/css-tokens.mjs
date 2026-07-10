import fs from "node:fs";
import { walkFiles } from "./repo-scan.mjs";

/**
 * Pure helpers for the phantom-token guard: extract the custom properties a
 * CSS file *defines* versus the ones it *references* via `var(--…)`, then
 * compute the set difference. A `var(--x)` whose `--x` is never defined (in the
 * rialto token sheet or the app itself) silently renders its literal fallback —
 * ignoring brand colour and dark mode — and no visual test catches it. These
 * functions operate on raw CSS text so the invariant is checked against the
 * authored source, not a vite/CSS-modules import that rewrites it.
 */

/** A custom-property declaration (`--name:`), not a `var()` reference. */
const DEFINITION_RE = /(?<![\w-])--([a-zA-Z0-9_-]+)\s*:/g;

/** A custom-property reference: the `--name` inside `var(--name[, fallback])`. */
const REFERENCE_RE = /var\(\s*--([a-zA-Z0-9_-]+)/g;

/** Drop `/* … *\/` comments so a documented example token is never mistaken for real usage. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Custom properties *defined* in the given CSS text (names keep the `--` prefix).
 * @param {string} css
 * @returns {Set<string>}
 */
export function collectDefinedProperties(css) {
  const defined = new Set();
  for (const match of stripComments(css).matchAll(DEFINITION_RE)) defined.add(`--${match[1]}`);
  return defined;
}

/**
 * Custom properties *referenced* via `var(--…)` in the given CSS text.
 * @param {string} css
 * @returns {Set<string>}
 */
export function collectReferencedProperties(css) {
  const referenced = new Set();
  for (const match of stripComments(css).matchAll(REFERENCE_RE)) referenced.add(`--${match[1]}`);
  return referenced;
}

/**
 * Set difference: referenced custom properties with no definition in `defined`.
 * @param {Iterable<string>} referenced
 * @param {Set<string>} defined
 * @returns {string[]} unresolved names, sorted
 */
export function findUnresolvedReferences(referenced, defined) {
  return [...referenced].filter((name) => !defined.has(name)).sort();
}

/**
 * All `.css` files under `dir` (recursively), skipping build/vendor dirs.
 * @param {string} dir
 * @returns {string[]}
 */
export function cssFilesIn(dir) {
  return walkFiles(dir, { match: (name) => name.endsWith(".css") });
}

/**
 * Union of every custom property defined across the given CSS files.
 * @param {Iterable<string>} files
 * @returns {Set<string>}
 */
export function collectDefinedFromFiles(files) {
  const defined = new Set();
  for (const file of files) {
    for (const name of collectDefinedProperties(fs.readFileSync(file, "utf8"))) defined.add(name);
  }
  return defined;
}

/**
 * Map each referenced custom property to the files that reference it.
 * @param {Iterable<string>} files
 * @returns {Map<string, string[]>}
 */
export function collectReferencesFromFiles(files) {
  const references = new Map();
  for (const file of files) {
    for (const name of collectReferencedProperties(fs.readFileSync(file, "utf8"))) {
      const seenIn = references.get(name) ?? [];
      seenIn.push(file);
      references.set(name, seenIn);
    }
  }
  return references;
}
