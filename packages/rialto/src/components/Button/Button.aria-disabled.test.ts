// @vitest-environment node
/**
 * A Button that stays focusable while pending (aria-disabled, not native
 * disabled) must look disabled too — issue #9941 — but a pointer press must
 * still reach its onClick — issue #10019. `pointer-events: none` belongs to
 * native `:disabled` only.
 *
 * Asserts on parsed top-level rules (selector list + declarations), not on a
 * substring of the file, so a declaration in a neighbouring rule or a comment
 * cannot satisfy it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "Button.module.css");
const ARIA_DISABLED = '.button[aria-disabled="true"]';
const NATIVE_DISABLED = ".button:disabled";

interface CssRule {
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
}

function parseDeclarations(body: string): ReadonlyMap<string, string> {
  const entries = body
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl.includes(":"))
    .map((decl): [string, string] => {
      const colon = decl.indexOf(":");
      return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()];
    });
  return new Map(entries);
}

/** Top-level style rules only; @-rule blocks (media queries, keyframes) are skipped. */
function parseTopLevelRules(css: string): readonly CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  let depth = 0;
  let start = 0;
  let prelude = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") {
      if (depth === 0) {
        prelude = source.slice(start, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        if (!prelude.startsWith("@")) {
          rules.push({
            selectors: prelude.split(",").map((selector) => selector.trim()),
            declarations: parseDeclarations(source.slice(start, i)),
          });
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

function rulesFor(selector: string): readonly CssRule[] {
  const css = readFileSync(CSS_PATH, "utf-8");
  return parseTopLevelRules(css).filter((rule) => rule.selectors.includes(selector));
}

describe("Button aria-disabled styling", () => {
  it("gives .button[aria-disabled='true'] the disabled look", () => {
    const declarations = rulesFor(ARIA_DISABLED).flatMap((rule) => [...rule.declarations]);
    const merged = new Map(declarations);
    expect(merged.get("cursor")).toBe("not-allowed");
    expect(merged.get("filter")).toBe("saturate(0.6) brightness(0.95)");
  });

  it("never sets pointer-events: none on .button[aria-disabled='true'] (#10019)", () => {
    const rules = rulesFor(ARIA_DISABLED);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.declarations.get("pointer-events")).not.toBe("none");
    }
  });

  it("keeps pointer-events: none on native :disabled", () => {
    const values = rulesFor(NATIVE_DISABLED).map((rule) => rule.declarations.get("pointer-events"));
    expect(values).toContain("none");
  });
});
