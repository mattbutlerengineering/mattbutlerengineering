/// <reference types="node" />
// @vitest-environment node
/**
 * Token Usage Guard — undefined --rialto-* custom property detection
 *
 * `var(--rialto-undefined-token)` is not a CSS error: the browser silently
 * falls back to the property's initial value (e.g. `gap` collapses to 0).
 * No linter catches this by default, so a bad token reference ships quiet
 * and only surfaces as a visual bug (see #3425). This test greps every
 * `var(--rialto-*)` usage in the package against every `--rialto-*`
 * definition and fails the build if a usage has no matching definition.
 *
 * Scope: packages/rialto only (the token owner). Consuming apps compose
 * their own CSS and are out of scope for this guard.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFINITION_PATTERN = /(?:^|[\s;{])(--rialto-[\w-]+)\s*:/gm;
const USAGE_PATTERN = /var\((--rialto-[\w-]+)/g;

function findCssFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".css"))
    .map((entry) => join(dir, entry));
}

function extractMatches(content: string, pattern: RegExp): string[] {
  return [...content.matchAll(pattern)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

describe("rialto token usage", () => {
  it("every var(--rialto-*) usage has a matching --rialto-* definition", () => {
    const cssFiles = findCssFiles(SRC_DIR);

    const defined = new Set<string>();
    const undefinedUsages: string[] = [];

    for (const file of cssFiles) {
      const content = readFileSync(file, "utf-8");
      for (const name of extractMatches(content, DEFINITION_PATTERN)) {
        defined.add(name);
      }
    }

    for (const file of cssFiles) {
      const content = readFileSync(file, "utf-8");
      for (const name of extractMatches(content, USAGE_PATTERN)) {
        if (!defined.has(name)) {
          undefinedUsages.push(`${name} (${file})`);
        }
      }
    }

    expect(undefinedUsages).toEqual([]);
  });
});
