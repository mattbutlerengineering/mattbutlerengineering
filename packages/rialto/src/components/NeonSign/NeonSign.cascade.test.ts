/// <reference types="node" />
// @vitest-environment node
/**
 * Cascade guard — the reduced-motion rules must outrank the state animations.
 *
 * The strike and the breathe are bound to `data-state` selectors on `.tube`;
 * the reduced-motion rules (`.reduced` from `useReducedMotion()` and the
 * `prefers-reduced-motion` media twin) switch them off with `animation: none`.
 * That only works when every reduced rule has STRICTLY greater specificity
 * than every animating rule: equal specificity falls through to source order,
 * lower specificity loses outright, and either leaves a sign that reports
 * `data-reduced-motion="true"` while it still flickers (verification.md B2/B3,
 * measured in Chromium: `.reduced .tube` (0,2,0) lost to
 * `.neonSign[data-state="open"] .tube` (0,3,0)).
 *
 * jsdom applies no stylesheet, so the rendered tests cannot see this. This
 * test reads the source CSS and computes the specificities itself — it does
 * not honour `!important`, on purpose: the fix has to be the cascade.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const componentDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(componentDir, "NeonSign.module.css"), "utf-8");

/** (ids, classes + attributes + pseudo-classes, elements + pseudo-elements). */
type Specificity = readonly [number, number, number];

interface StyleRule {
  selector: string;
  declarations: Readonly<Record<string, string>>;
  /** True when the rule sits inside `@media (prefers-reduced-motion: reduce)`. */
  reducedMotionMedia: boolean;
}

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** Index of the `}` that closes the block opened by the `{` at `open`. */
function findBlockEnd(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return i;
  }
  throw new Error(`Unbalanced block opened at offset ${open}`);
}

function parseDeclarations(body: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    body
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration.length > 0)
      .map((declaration) => {
        const colon = declaration.indexOf(":");
        return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
      })
  );
}

/** Walks the sheet block by block: recurses into `@media`, skips other at-rules. */
function parseRules(source: string, reducedMotionMedia = false): readonly StyleRule[] {
  const rules: StyleRule[] = [];
  let cursor = 0;
  for (;;) {
    const open = source.indexOf("{", cursor);
    if (open === -1) return rules;
    const prelude = source.slice(cursor, open).trim();
    const close = findBlockEnd(source, open);
    const body = source.slice(open + 1, close);
    cursor = close + 1;

    if (prelude.startsWith("@media")) {
      const isReduce = /prefers-reduced-motion:\s*reduce/.test(prelude);
      rules.push(...parseRules(body, reducedMotionMedia || isReduce));
    } else if (!prelude.startsWith("@")) {
      const declarations = parseDeclarations(body);
      for (const selector of prelude.split(",")) {
        rules.push({ selector: selector.trim(), declarations, reducedMotionMedia });
      }
    }
  }
}

const count = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;

/**
 * Selectors Level 4 specificity. `:where()` contributes nothing; other
 * functional pseudo-classes are not modelled because this sheet uses none —
 * extend the helper before introducing one.
 */
function specificity(selector: string): Specificity {
  const withoutWhere = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "");
  if (/:[\w-]+\(/.test(withoutWhere)) {
    throw new Error(`specificity(): functional pseudo-class not modelled in "${selector}"`);
  }
  const attributes = count(withoutWhere, /\[[^\]]*\]/g);
  const withoutAttributes = withoutWhere.replace(/\[[^\]]*\]/g, "");
  const ids = count(withoutAttributes, /#[\w-]+/g);
  const classes = count(withoutAttributes, /\.[\w-]+/g);
  const pseudoElements = count(withoutAttributes, /::[\w-]+/g);
  const pseudoClasses = count(withoutAttributes, /(?:^|[^:]):[\w-]+/g);
  const typeSelectors = count(
    withoutAttributes.replace(/::?[\w-]+|[#.][\w-]+/g, " "),
    /[a-z][\w-]*/gi
  );
  return [ids, attributes + classes + pseudoClasses, pseudoElements + typeSelectors];
}

const formatSpecificity = (value: Specificity): string => `(${value.join(",")})`;

/** Strictly greater; equal specificity is a source-order coin toss this guard refuses. */
function outranks(candidate: Specificity, incumbent: Specificity): boolean {
  for (let i = 0; i < candidate.length; i += 1) {
    if (candidate[i] !== incumbent[i]) return (candidate[i] ?? 0) > (incumbent[i] ?? 0);
  }
  return false;
}

/** The subject (last compound) of the selector is the tube. */
function targetsTube(selector: string): boolean {
  const compounds = selector.split(/\s*[>+~]\s*|\s+/);
  return (compounds[compounds.length - 1] ?? "").includes(".tube");
}

const animationName = (rule: StyleRule): string | undefined =>
  rule.declarations["animation-name"] ?? rule.declarations["animation"]?.split(/\s+/)[0];

const describeRule = (rule: StyleRule): string =>
  `${rule.reducedMotionMedia ? "@media (prefers-reduced-motion: reduce) " : ""}"${rule.selector}" ${formatSpecificity(specificity(rule.selector))}`;

describe("NeonSign.module.css cascade — reduced motion outranks the state animations", () => {
  const tubeRules = parseRules(stripComments(css)).filter((rule) => targetsTube(rule.selector));
  const animated = tubeRules.filter((rule) => {
    const name = animationName(rule);
    return name !== undefined && name !== "none";
  });
  const silenced = tubeRules.filter((rule) => animationName(rule) === "none");
  const classPath = silenced.filter(
    (rule) => !rule.reducedMotionMedia && /\.reduced\b/.test(rule.selector)
  );
  const mediaPath = silenced.filter((rule) => rule.reducedMotionMedia);

  it("finds the strike and the breathe bound to the tube (parser sanity)", () => {
    expect(animated.map(animationName)).toEqual(
      expect.arrayContaining(["rialto-neon-strike", "rialto-neon-breathe"])
    );
  });

  it("finds an animation: none rule on the tube for both reduced-motion paths", () => {
    expect(classPath.length).toBeGreaterThan(0);
    expect(mediaPath.length).toBeGreaterThan(0);
  });

  it.each([
    ["useReducedMotion() → .reduced", classPath],
    ["@media (prefers-reduced-motion: reduce)", mediaPath],
  ])("%s rules beat every animated tube rule on specificity alone", (_path, reducedRules) => {
    for (const reduced of reducedRules) {
      for (const rule of animated) {
        expect(
          outranks(specificity(reduced.selector), specificity(rule.selector)),
          `${describeRule(reduced)} must have strictly greater specificity than ${describeRule(rule)} — otherwise its animation: none loses and the ${animationName(rule)} plays under reduced motion`
        ).toBe(true);
      }
    }
  });
});
