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

/**
 * Mid-tone surface scopes (ADR-035). Content on a `data-surface` band reads
 * re-declared surface, focus-gap, text, border and focus-ring tokens. Each
 * scope gets a light block, a dark block and a nested-light-island block.
 */
const SCOPES = ["tinted", "velvet"] as const;
const SCOPE_TOKENS = [
  "--rialto-surface",
  "--rialto-focus-gap",
  "--rialto-text-primary",
  "--rialto-text-secondary",
  "--rialto-text-tertiary",
  "--rialto-border",
  "--rialto-border-strong",
  "--rialto-focus-ring",
] as const;

describe("focus ring tokens", () => {
  it("default to today's accent and surface values, so the focus shadow is unchanged", () => {
    expect(ROOT.get("--rialto-focus-ring")).toBe(ROOT.get("--rialto-accent"));
    expect(ROOT.get("--rialto-focus-gap")).toBe(ROOT.get("--rialto-surface"));
    expect(DARK.get("--rialto-focus-ring")).toBe(DARK.get("--rialto-accent"));
    expect(DARK.get("--rialto-focus-gap")).toBe(DARK.get("--rialto-surface"));
  });
});

describe("data-surface scopes", () => {
  for (const scope of SCOPES) {
    const selectors = {
      light: `[data-surface="${scope}"]`,
      dark: `[data-theme="dark"] [data-surface="${scope}"]`,
      nestedLight: `[data-theme="dark"] [data-theme="light"] [data-surface="${scope}"]`,
    } as const;

    for (const [mode, selector] of Object.entries(selectors)) {
      // Dark tinted (brown) is not a signature surface: it keeps the dark theme's values.
      if (scope === "tinted" && mode === "dark") {
        it("tinted (dark) declares no scope block", () => {
          expect(tokensCss).not.toContain(`${selector} {`);
        });
        continue;
      }
      it(`${scope} (${mode}) re-declares the on-surface tokens`, () => {
        const scoped = declarations(selector);
        for (const name of SCOPE_TOKENS) {
          expect(scoped.has(name), `${name} missing from ${selector}`).toBe(true);
        }
        // The gap behind the focus ring is the band itself.
        expect(scoped.get("--rialto-focus-gap")).toBe(scoped.get("--rialto-surface"));
      });
    }

    it(`${scope}: the band surface is the palette's surface-${scope} token`, () => {
      expect(declarations(selectors.light).get("--rialto-surface")).toBe(
        ROOT.get(`--rialto-surface-${scope}`)
      );
      if (scope !== "tinted") {
        expect(declarations(selectors.dark).get("--rialto-surface")).toBe(
          DARK.get(`--rialto-surface-${scope}`)
        );
      }
      expect(declarations(selectors.nestedLight)).toEqual(declarations(selectors.light));
    });
  }
});

describe("velvet error red", () => {
  it("re-declares --rialto-error on velvet in light, dark and a nested light island", () => {
    for (const selector of [
      '[data-surface="velvet"]',
      '[data-theme="dark"] [data-surface="velvet"]',
      '[data-theme="dark"] [data-theme="light"] [data-surface="velvet"]',
    ]) {
      expect(declarations(selector).has("--rialto-error"), selector).toBe(true);
    }
  });

  it("is not re-declared on tinted", () => {
    expect(declarations('[data-surface="tinted"]').has("--rialto-error")).toBe(false);
  });
});

describe("dark tinted surface", () => {
  it("is no longer the brown signature band: it equals the dark recessed surface", () => {
    expect(DARK.get("--rialto-surface-tinted")).toBe(DARK.get("--rialto-surface-recessed"));
  });
});
