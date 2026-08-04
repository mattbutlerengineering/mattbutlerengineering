import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectDefinedProperties,
  collectReferencedProperties,
  findUnresolvedReferences,
  collectDefinedFromFiles,
  collectReferencesFromFiles,
  cssFilesIn,
} from "../lib/css-tokens.mjs";

/**
 * Monorepo-wide phantom-token guard. Every custom property an app references
 * via `var(--…)` must resolve to a definition in the rialto token sheet or in
 * that same app. A reference to an undefined token (e.g. `--color-primary` or
 * the misspelled `--rialto-space-6`) silently renders its literal fallback —
 * ignoring the design system and dark mode — and no visual test catches it.
 * Deliberate app-local aliases (e.g. hospitality's `--color-background` mapped
 * onto a rialto token) are fine: the guard checks *resolution*, not naming.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The canonical rialto token layer (imported by every app via `@…/rialto/styles`). */
const RIALTO_TOKEN_DIRS = [
  path.join(REPO_ROOT, "packages/rialto/src/tokens"),
  path.join(REPO_ROOT, "packages/rialto/src/styles"),
];

const APPS_DIR = path.join(REPO_ROOT, "apps");

describe("css-tokens resolver", () => {
  test("collectDefinedProperties captures declarations, not var() references", () => {
    const defined = collectDefinedProperties(":root { --a: 1px; } .x { color: var(--b); }");
    expect([...defined]).toEqual(["--a"]);
  });

  test("collectReferencedProperties captures var() names with and without a fallback", () => {
    const referenced = collectReferencedProperties(".x { color: var(--a); gap: var( --b , 4px); }");
    expect([...referenced].sort()).toEqual(["--a", "--b"]);
  });

  test("comments never count as definitions or references", () => {
    expect(collectDefinedProperties("/* --a: 1; */").size).toBe(0);
    expect(collectReferencedProperties("/* var(--a) */").size).toBe(0);
  });

  test("findUnresolvedReferences flags a referenced token that nothing defines", () => {
    const referenced = collectReferencedProperties(".x { color: var(--nonexistent-xyz); }");
    const defined = collectDefinedProperties(":root { --rialto-accent: gold; }");
    expect(findUnresolvedReferences(referenced, defined)).toEqual(["--nonexistent-xyz"]);
  });

  test("findUnresolvedReferences resolves a deliberate app-local alias", () => {
    const referenced = collectReferencedProperties(".x { background: var(--color-background); }");
    const rialto = collectDefinedProperties(":root { --rialto-surface: #fff; }");
    const appLocal = collectDefinedProperties(
      ":root { --color-background: var(--rialto-surface); }"
    );
    const defined = new Set([...rialto, ...appLocal]);
    expect(findUnresolvedReferences(referenced, defined)).toEqual([]);
  });
});

const rialtoDefined = collectDefinedFromFiles(RIALTO_TOKEN_DIRS.flatMap((dir) => cssFilesIn(dir)));

const appNames = fs
  .readdirSync(APPS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => cssFilesIn(path.join(APPS_DIR, name, "src")).length > 0)
  .sort();

describe("monorepo CSS custom-property resolution", () => {
  test("the rialto token sheet defines a non-trivial set of tokens", () => {
    expect(rialtoDefined.size).toBeGreaterThan(50);
  });

  test("discovers apps to guard", () => {
    expect(appNames.length).toBeGreaterThan(0);
  });

  test.each(appNames)(
    "%s references only custom properties defined in rialto or the app itself",
    (appName) => {
      const files = cssFilesIn(path.join(APPS_DIR, appName, "src"));
      const references = collectReferencesFromFiles(files);
      const defined = new Set([...rialtoDefined, ...collectDefinedFromFiles(files)]);
      const unresolved = findUnresolvedReferences(references.keys(), defined);
      const detail = unresolved
        .map((name) => {
          const where = references.get(name).map((file) => path.relative(REPO_ROOT, file));
          return `  ${name} referenced in:\n    ${where.join("\n    ")}`;
        })
        .join("\n");
      expect(unresolved, `phantom tokens in ${appName}:\n${detail}`).toEqual([]);
    }
  );
});
