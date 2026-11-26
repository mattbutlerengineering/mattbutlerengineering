/// <reference types="node" />
// @vitest-environment node
/**
 * Forced-colors focus guard — keyboard focus stays visible in Windows High
 * Contrast and other forced-colors modes.
 *
 * Rialto draws focus with `box-shadow`, which forced-colors mode strips. An
 * `outline: none` removes the only thing the UA would repaint, so focus
 * vanishes (WCAG 2.4.7). A transparent outline paints nothing normally but is
 * recoloured by the UA in forced-colors mode. jsdom cannot emulate forced
 * colours, so this parses the CSS source.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const OUTLINE_REMOVED = /outline:\s*(none|0)\s*;/;
const OUTLINE_DECLARATION = /(?<![\w-])outline:\s*([^;}]+)/;

function findCssFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".css"))
    .map((entry) => join(dir, entry));
}

/** Replace comments with same-length whitespace so line numbers survive. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function lineOf(css: string, index: number): number {
  return css.slice(0, index).split("\n").length;
}

function findRemovedOutlines(file: string): string[] {
  const css = stripComments(readFileSync(file, "utf-8"));
  return [...css.matchAll(new RegExp(OUTLINE_REMOVED, "g"))].map(
    (match) => `${relative(SRC_DIR, file)}:${lineOf(css, match.index ?? 0)}`
  );
}

function findFocusRulesWithoutOutline(file: string): string[] {
  const css = stripComments(readFileSync(file, "utf-8"));
  const offenders: string[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? "").trim();
    const body = rule[2] ?? "";
    if (!selector.includes(":focus") || !body.includes("box-shadow")) continue;
    const outline = OUTLINE_DECLARATION.exec(body)?.[1]?.trim();
    if (outline === undefined || outline === "none" || outline === "0") {
      offenders.push(`${relative(SRC_DIR, file)}:${lineOf(css, rule.index ?? 0)} ${selector}`);
    }
  }
  return offenders;
}

describe("rialto forced-colors focus visibility", () => {
  const files = findCssFiles(SRC_DIR);

  it("finds the CSS sources", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no CSS file removes the outline (use a transparent outline instead)", () => {
    expect(files.flatMap(findRemovedOutlines)).toEqual([]);
  });

  it("every :focus rule that draws focus with box-shadow also declares an outline", () => {
    expect(files.flatMap(findFocusRulesWithoutOutline)).toEqual([]);
  });
});
