/**
 * Signature palette promotion (rialto-signature-pass Milestone 2). The
 * kill-test remap (ux.md § Kill-test mapping) is the default: Tier-3 tokens
 * re-point at `:root` to plum, plum-muted and tinted, with no scope attribute.
 * The gold rule holds: primary, focus and selected stay gold. Component rules
 * that read a remapped token carry no `[data-palette]` prefix.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

interface Rule {
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
}

function rules(css: string): Rule[] {
  return [...strip(css).matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    selectors: (match[1] as string).split(",").map((s) => s.trim().replace(/\s+/g, " ")),
    declarations: new Map(
      [...(match[2] as string).matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(
        (d) => [d[1] as string, (d[2] as string).replace(/\s+/g, " ").trim()] as const
      )
    ),
  }));
}

const tokenRules = rules(readFileSync(resolve(__dirname, "component-tokens.css"), "utf8"));

function rule(selectors: readonly string[]): Rule {
  const found = tokenRules.find(
    (r) =>
      r.selectors.length === selectors.length && r.selectors.every((s, i) => s === selectors[i])
  );
  if (found === undefined) throw new Error(`No rule for ${selectors.join(", ")}`);
  return found;
}

const BASE = rule([":root", "[data-theme]", "[data-surface]", "[data-palette]"]);

/** Signature remap tokens and the semantic token each now resolves to at :root. */
const REMAP: Record<string, string> = {
  "--rialto-button-secondary-bg": "var(--rialto-surface-elevated)",
  "--rialto-button-secondary-text": "var(--rialto-plum)",
  "--rialto-button-secondary-border": "var(--rialto-plum)",
  "--rialto-button-secondary-bg-hover": "var(--rialto-plum-muted)",
  "--rialto-button-ghost-bg-hover": "var(--rialto-plum-muted)",
  "--rialto-input-caret": "var(--rialto-plum)",
  "--rialto-input-selection-bg": "var(--rialto-plum)",
  "--rialto-input-selection-text": "var(--rialto-plum-text-on)",
  "--rialto-input-border-hover": "var(--rialto-plum)",
  "--rialto-select-option-highlight-bg": "var(--rialto-plum-muted)",
  "--rialto-tabs-track-bg": "var(--rialto-surface-tinted)",
  "--rialto-tabs-text-inactive": "var(--rialto-text-primary)",
  "--rialto-tabs-text-hover": "var(--rialto-plum)",
};

describe("signature remap tokens", () => {
  it.each(Object.entries(REMAP))("%s resolves to the signature value at :root", (token, value) => {
    expect(BASE.declarations.get(token)).toBe(value);
  });

  it('leaves no [data-palette="signature"] selector in the token sheet', () => {
    const selectors = tokenRules.flatMap((r) => r.selectors);
    expect(selectors.filter((s) => s.includes('[data-palette="signature"]'))).toEqual([]);
  });

  it("never remaps a gold-rule token (primary, focus, selected) away from the accent", () => {
    for (const token of [
      "--rialto-button-primary-bg",
      "--rialto-input-border-focus",
      "--rialto-tabs-indicator-color",
    ]) {
      expect(BASE.declarations.get(token), token).toMatch(/var\(--rialto-accent(-hover)?\)/);
    }
  });

  it("deepens the Input well to elevated on a tinted band", () => {
    expect(rule(['[data-surface="tinted"]']).declarations.get("--rialto-input-bg")).toBe(
      "var(--rialto-surface-elevated)"
    );
  });

  it("keeps ivory content legible on a velvet band", () => {
    const velvet = rule(['[data-surface="velvet"]']);
    // Card and wells take the band; plum, which is dark, never sits on velvet as text.
    expect(velvet.declarations.get("--rialto-card-elevated-bg")).toBe("var(--rialto-surface)");
    expect(velvet.declarations.get("--rialto-tabs-track-bg")).toBe("transparent");
    expect(velvet.declarations.get("--rialto-tabs-text-hover")).toBe("var(--rialto-text-primary)");
    expect(velvet.declarations.get("--rialto-input-caret")).toBe("var(--rialto-text-primary)");
    expect(velvet.declarations.get("--rialto-input-border-hover")).toBe(
      "var(--rialto-border-strong)"
    );
  });
});

const COMPONENT_SHEETS = ["Button", "Input", "Select", "Card", "Tabs"].map((name) => ({
  name,
  rules: rules(
    readFileSync(resolve(__dirname, `../components/${name}/${name}.module.css`), "utf8")
  ),
}));

describe.each(COMPONENT_SHEETS)("$name.module.css", ({ rules: componentRules }) => {
  it("has no rule scoped to data-palette", () => {
    for (const r of componentRules)
      for (const selector of r.selectors) expect(selector).not.toContain("data-palette");
  });
});
