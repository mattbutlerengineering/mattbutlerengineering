/**
 * Derived tokens re-resolve on scope elements (ADR-035).
 *
 * A custom property defined from another (`--rialto-input-border-focus:
 * var(--rialto-accent)`) is substituted where it is declared, and descendants
 * inherit the substituted value. So Tier-3 component tokens and the focus
 * shadow must be declared on every element that re-declares the semantic
 * tokens they read — `data-surface` bands and the `data-palette` kill-test
 * scope — or a band's focus ring and gap never reach the components on it.
 *
 * Parsed from the stylesheets so a selector edit that drops a scope fails here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sheet(name: string): string {
  return readFileSync(resolve(__dirname, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

interface Rule {
  readonly selectors: readonly string[];
  readonly body: string;
}

function rules(css: string): Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    selectors: (match[1] as string).split(",").map((s) => s.trim().replace(/\s+/g, " ")),
    body: match[2] as string,
  }));
}

/** The kill-test PR ships the surface and palette scopes; `[data-theme]` lands with the promotion. */
const SCOPE_SELECTORS = [":root", "[data-surface]", "[data-palette]"];

describe("component-tokens.css", () => {
  it("declares the Tier-3 tokens on :root and on every surface and palette scope", () => {
    const tokenRules = rules(sheet("component-tokens.css")).filter((rule) =>
      rule.body.includes("--rialto-button-primary-bg")
    );
    expect(tokenRules).toHaveLength(1);
    expect(tokenRules[0]?.selectors).toEqual(SCOPE_SELECTORS);
  });
});

describe("shadows.css focus shadow", () => {
  const focusRules = rules(sheet("shadows.css")).filter((rule) =>
    /--rialto-shadow-focus\s*:/.test(rule.body)
  );

  it("is declared once", () => {
    expect(focusRules).toHaveLength(1);
  });

  it("is declared on :root, every surface and palette scope, and the dark theme", () => {
    // `[data-theme="dark"]` keeps today's behaviour for a dark element under a
    // light root, where the old dark-only copy re-resolved the shadow.
    expect(focusRules[0]?.selectors).toEqual([
      ":root",
      '[data-theme="dark"]',
      "[data-surface]",
      "[data-palette]",
    ]);
  });

  it("is composed from the focus gap and focus ring tokens", () => {
    const value = /--rialto-shadow-focus\s*:([^;]+);/.exec(focusRules[0]?.body ?? "")?.[1];
    expect(value?.replace(/\s+/g, " ").trim()).toBe(
      "0 0 0 2px var(--rialto-focus-gap), 0 0 0 4px var(--rialto-focus-ring), 0 0 12px var(--rialto-accent-glow)"
    );
  });

  it("no longer reads the surface and accent tokens directly", () => {
    const all = sheet("shadows.css");
    expect(all).not.toMatch(/0 0 0 2px var\(--rialto-surface\)/);
    expect(all).not.toMatch(/0 0 0 4px var\(--rialto-accent\)/);
  });
});
