/**
 * Nested theme scopes. The light palette is authored on `:root`, which
 * matches the document root and not a nested element. Custom properties
 * inherit, so a `[data-theme="light"]` island inside a `[data-theme="dark"]`
 * ancestor kept the dark tokens — the SilkFlow docs "Light" panel painted
 * dark whenever the page was dark. The dark palette is already re-declared
 * on its attribute; the light palette has to be re-declared on the island too.
 *
 * Parsed from the generated stylesheet (never a copied hex table) so a
 * regen that drops the nested rule fails here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(resolve(__dirname, "colors.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** Body of the rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1];
  if (body === undefined) throw new Error(`Rule not found: ${selector}`);
  return body;
}

function declarations(selector: string): Map<string, string> {
  return new Map(
    [...ruleBody(selector).matchAll(/(--rialto-[\w-]+):\s*([^;]+);/g)].map(
      (match) => [match[1] as string, (match[2] as string).trim()] as const
    )
  );
}

const ROOT = declarations(":root");
const DARK = declarations('[data-theme="dark"]');
/** Light island inside a dark ancestor — not `:root`, and not the dark rule. */
const NESTED_LIGHT = '[data-theme="dark"] [data-theme="light"]';

describe("nested light theme scope", () => {
  it("re-declares the light palette on a light island inside a dark ancestor", () => {
    const nested = declarations(NESTED_LIGHT);

    expect(nested.get("--rialto-surface")).toBe(ROOT.get("--rialto-surface"));
    expect(nested.get("--rialto-surface")).not.toBe(DARK.get("--rialto-surface"));

    // Every dark-theme token is overridden with the light value. Tokens that
    // share a hex across themes stay equal to :root as well.
    for (const name of DARK.keys()) {
      expect(nested.has(name), `${name} missing from the nested light scope`).toBe(true);
      expect(nested.get(name), name).toBe(ROOT.get(name));
    }
  });

  it("resets color-scheme so the island does not inherit the dark scheme", () => {
    expect(ruleBody(NESTED_LIGHT)).toMatch(/color-scheme:\s*light\s*;/);
    expect(ruleBody('[data-theme="dark"]')).toMatch(/color-scheme:\s*dark\s*;/);
  });
});
