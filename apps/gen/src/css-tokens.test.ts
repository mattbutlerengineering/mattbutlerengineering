/// <reference types="node" />
// @vitest-environment node
/**
 * #7463: apps/gen stylesheets use rialto tokens for type size and shadow,
 * never a hand-rolled px font-size or an rgba() shadow colour.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith(".module.css") ? [p] : [];
  });
}

function offences(re: RegExp): string[] {
  return cssFiles(SRC_DIR).flatMap((file) =>
    readFileSync(file, "utf-8")
      .split("\n")
      .flatMap((line, i) =>
        re.test(line) ? [`${relative(SRC_DIR, file)}:${i + 1}: ${line.trim()}`] : []
      )
  );
}

describe("gen stylesheets use rialto tokens", () => {
  it("has no px font-size", () => {
    expect(offences(/font-size:\s*[\d.]+px/)).toEqual([]);
  });

  it("has no rgba() colour (shadows use --rialto-shadow-*)", () => {
    expect(offences(/rgba?\(/)).toEqual([]);
  });
});
