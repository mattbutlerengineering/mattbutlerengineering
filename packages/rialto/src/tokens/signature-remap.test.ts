/**
 * Kill-test signature remap (rialto-signature-pass Milestone 1, ux.md §
 * Kill-test mapping). Under `[data-palette="signature"]` the five kill-test
 * primitives repaint through Tier-3 tokens: plum for the voice, plum-muted
 * for highlight and hover tints, tinted for the Tabs track. The gold rule
 * holds: primary, focus and selected stay gold.
 *
 * Outside the scope nothing changes: the base Tier-3 values are today's, and
 * every component rule that reads a remapped token is itself scoped to
 * `[data-palette="signature"]`, so no rule matches outside it.
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

const BASE = rule([":root", "[data-surface]", "[data-palette]"]);
const SIGNATURE = rule(['[data-palette="signature"]', '[data-palette="signature"] [data-surface]']);

/** Remapped token → [value inside the scope, today's value outside it]. */
const REMAP: Record<string, readonly [string, string]> = {
  "--rialto-button-secondary-bg": [
    "var(--rialto-surface-elevated)",
    "var(--rialto-surface-elevated)",
  ],
  "--rialto-button-secondary-text": ["var(--rialto-plum)", "var(--rialto-text-primary)"],
  "--rialto-button-secondary-border": ["var(--rialto-plum)", "var(--rialto-border)"],
  "--rialto-button-secondary-bg-hover": [
    "var(--rialto-plum-muted)",
    "var(--rialto-surface-recessed)",
  ],
  "--rialto-button-ghost-bg-hover": ["var(--rialto-plum-muted)", "var(--rialto-surface-recessed)"],
  "--rialto-input-caret": ["var(--rialto-plum)", "auto"],
  "--rialto-input-selection-bg": ["var(--rialto-plum)", "Highlight"],
  "--rialto-input-selection-text": ["var(--rialto-plum-text-on)", "HighlightText"],
  "--rialto-input-border-hover": ["var(--rialto-plum)", "var(--rialto-border-strong)"],
  "--rialto-select-option-highlight-bg": ["var(--rialto-plum-muted)", "var(--rialto-accent-muted)"],
  "--rialto-tabs-track-bg": ["var(--rialto-surface-tinted)", "transparent"],
  "--rialto-tabs-text-inactive": ["var(--rialto-text-primary)", "var(--rialto-text-secondary)"],
  "--rialto-tabs-text-hover": ["var(--rialto-plum)", "var(--rialto-text-primary)"],
};

describe("signature remap tokens", () => {
  it.each(Object.entries(REMAP))("%s re-points inside the scope", (token, [inside]) => {
    expect(SIGNATURE.declarations.get(token)).toBe(inside);
  });

  it.each(Object.entries(REMAP))("%s keeps today's value outside the scope", (token, [, today]) => {
    expect(BASE.declarations.get(token)).toBe(today);
  });

  it("re-points only the mapped tokens", () => {
    expect([...SIGNATURE.declarations.keys()].sort()).toEqual(Object.keys(REMAP).sort());
  });

  it("never remaps a gold-rule token (primary, focus, selected)", () => {
    const goldRule = [...BASE.declarations]
      .filter(([, value]) => /var\(--rialto-accent(-hover)?\)/.test(value))
      .map(([token]) => token);
    expect(goldRule).toEqual(
      expect.arrayContaining([
        "--rialto-button-primary-bg",
        "--rialto-input-border-focus",
        "--rialto-tabs-indicator-color",
      ])
    );
    const scoped = tokenRules
      .filter((r) => r.selectors.some((s) => s.includes('[data-palette="signature"]')))
      .flatMap((r) => [...r.declarations.keys()]);
    for (const token of goldRule) expect(scoped, token).not.toContain(token);
  });

  it("deepens the Input well to elevated on a tinted band", () => {
    const tinted = rule([
      '[data-palette="signature"] [data-surface="tinted"]',
      '[data-palette="signature"][data-surface="tinted"]',
    ]);
    expect(tinted.declarations.get("--rialto-input-bg")).toBe("var(--rialto-surface-elevated)");
  });

  it("keeps ivory content legible on a velvet band", () => {
    const velvet = rule([
      '[data-palette="signature"] [data-surface="velvet"]',
      '[data-palette="signature"][data-surface="velvet"]',
    ]);
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

const SCOPE_PREFIX = ':global([data-palette="signature"])';
const HOOKS = new Set([
  ...Object.keys(REMAP),
  "--rialto-input-bg",
  "--rialto-input-text",
  "--rialto-card-elevated-bg",
  "--rialto-card-sheen",
]);

describe.each(COMPONENT_SHEETS)("$name.module.css", ({ rules: componentRules }) => {
  it("reads the signature tokens inside the scope", () => {
    const scoped = componentRules.filter((r) =>
      r.selectors.every((s) => s.startsWith(SCOPE_PREFIX))
    );
    const reads = scoped.flatMap((r) => [...r.declarations.values()]).join(" ");
    expect([...HOOKS].some((hook) => reads.includes(`var(${hook})`))).toBe(true);
  });

  it("reads a remapped token only from a rule scoped to the signature palette", () => {
    for (const r of componentRules) {
      const readsHook = [...r.declarations.values()].some((value) =>
        [...HOOKS].some((hook) => value.includes(`var(${hook})`))
      );
      if (!readsHook) continue;
      for (const selector of r.selectors)
        expect(selector.startsWith(SCOPE_PREFIX), selector).toBe(true);
    }
  });
});
