/// <reference types="node" />
// @vitest-environment node
/**
 * Transition Duration Guard — every CSS transition reads a duration token
 *
 * A vibe retimes motion by remapping `--rialto-duration-*` (the game vibe
 * promises a duration scale inside a 100ms feedback budget). A literal time
 * in a `transition` / `transition-duration` declaration is a transition no
 * vibe can retime. `animation` declarations (looping spinners) are out of
 * scope.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const DECLARATION_PATTERN = /(?<![\w-])(transition(?:-duration)?)\s*:\s*([^;}]+)/g;
const LITERAL_TIME_PATTERN = /(?<![\w.-])\d*\.?\d+m?s(?![\w-])/;

/**
 * Intentional exceptions: `<path relative to src>` -> reason. A file listed
 * here may carry literal times in transition declarations.
 */
const ALLOWLIST: Readonly<Record<string, string>> = {
  "styles/global.css":
    "prefers-reduced-motion rule forces 0.01ms on everything; it must be a literal to override every token",
  "components/Button/Button.module.css":
    "0.6s background-position shimmer sweep is a decorative effect longer than any duration token, not a feedback transition",
};

function findCssFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".css"))
    .map((entry) => join(dir, entry));
}

function findOffenders(file: string): string[] {
  const content = readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...content.matchAll(DECLARATION_PATTERN)]
    .map((match) => `${match[1]}: ${(match[2] ?? "").replace(/\s+/g, " ").trim()}`)
    .filter((declaration) => LITERAL_TIME_PATTERN.test(declaration));
}

describe("rialto transition durations", () => {
  it("no transition uses a literal time instead of var(--rialto-duration-*)", () => {
    const offenders = findCssFiles(SRC_DIR).flatMap((file) => {
      const path = relative(SRC_DIR, file);
      if (path in ALLOWLIST) return [];
      return findOffenders(file).map((declaration) => `${path}: ${declaration}`);
    });

    expect(offenders).toEqual([]);
  });

  it("every allowlist entry has a reason and still matches a literal", () => {
    for (const [path, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length).toBeGreaterThan(0);
      expect(findOffenders(join(SRC_DIR, path)).length).toBeGreaterThan(0);
    }
  });
});
