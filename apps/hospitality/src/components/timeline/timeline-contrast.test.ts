import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #10036: booking-block text and the now label failed axe color-contrast on /timeline, and the now
 * label was drawn over the hour heading. These read the parsed CSS module rules (selector →
 * declarations), so a comment or a neighbouring rule can't satisfy them by substring.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

function parseRules(file: string): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const css = readFileSync(resolve(HERE, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = new Map<string, Map<string, string>>();
  // Top-level rules only; @media bodies are skipped so the desktop rule is what is asserted.
  const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  for (const match of topLevel.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim();
    const declarations = new Map(
      (match[2] ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const colon = d.indexOf(":");
          return [d.slice(0, colon).trim(), d.slice(colon + 1).trim()] as const;
        })
    );
    rules.set(selector, declarations);
  }
  return rules;
}

function rule(
  rules: ReadonlyMap<string, ReadonlyMap<string, string>>,
  selector: string
): ReadonlyMap<string, string> {
  const found = rules.get(selector);
  expect(found, `${selector} rule`).toBeDefined();
  return found ?? new Map();
}

describe("reservation block text contrast (#10036)", () => {
  const rules = parseRules("ReservationBlock.module.css");
  const STATUS_CLASSES = [
    ".statusPending",
    ".statusConfirmed",
    ".statusCompleted",
    ".statusNoShow",
  ] as const;

  it("paints block text with the on-surface text token, not a status tint", () => {
    expect(rule(rules, ".block").get("color")).toBe("var(--rialto-text-primary)");
  });

  it.each(STATUS_CLASSES)("%s keeps its signal in the border, not the text color", (selector) => {
    const declarations = rule(rules, selector);
    expect(declarations.has("color")).toBe(false);
    expect(declarations.get("border-inline-start-color")).toMatch(/^var\(--rialto-/);
  });

  it("de-emphasises a cancelled block with the secondary text token, not a tint", () => {
    expect(rule(rules, ".statusCancelled").get("color")).toBe("var(--rialto-text-secondary)");
  });

  it.each([".guestName", ".details"])(
    "%s carries no opacity that would wash the text out",
    (selector) => {
      const declarations = rule(rules, selector);
      expect(declarations.has("opacity")).toBe(false);
      expect(declarations.has("color")).toBe(false);
    }
  );
});

describe("now label placement and contrast (#10036)", () => {
  const rules = parseRules("TimelineGrid.module.css");

  it("is centred in the header band, clear of the first table row", () => {
    const declarations = rule(rules, ".currentTimeLabel");
    expect(declarations.get("inset-block-start")).toBe("calc(var(--timeline-header-height) / 2)");
    expect(declarations.get("transform")).toBe("translateY(-50%)");
  });

  it("is layered above the sticky header, so it covers an hour heading instead of mixing with it", () => {
    const indicator = Number(rule(rules, ".currentTimeIndicator").get("z-index"));
    const header = Number(rule(rules, ".headerRow").get("z-index"));
    expect(indicator).toBeGreaterThan(header);
  });

  it("is a solid accent chip with the on-accent text token", () => {
    const declarations = rule(rules, ".currentTimeLabel");
    expect(declarations.get("background")).toBe("var(--rialto-accent)");
    expect(declarations.get("color")).toBe("var(--rialto-text-on-accent)");
    expect(declarations.has("opacity")).toBe(false);
  });
});
