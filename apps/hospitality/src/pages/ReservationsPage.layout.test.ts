import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// CSS modules are not applied in jsdom, so the touch floor is pinned on the source rule.
const CSS = readFileSync(resolve(process.cwd(), "src/pages/ReservationsPage.module.css"), "utf-8");
const TSX = readFileSync(resolve(process.cwd(), "src/pages/ReservationsPage.tsx"), "utf-8");

describe("ReservationsPage toolbar on phone and tablet", () => {
  it("gives the New reservation button a 44px touch floor at phone/tablet widths", () => {
    const block = CSS.match(
      /@media \(pointer: coarse\), \(max-width: 1024px\) \{\s*\.newReservation \{([^}]*)\}/
    );
    expect(block?.[1]).toMatch(/min-block-size:\s*44px/);
  });

  it("applies that rule to the toolbar's New reservation button", () => {
    expect(TSX).toMatch(/size="sm"\s+className=\{styles\.newReservation\}/);
  });
});

/** The text between the braces that open at `from` and their matching close. */
function braceBody(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(from + 1, i);
  }
  throw new Error("unbalanced braces");
}

/** Declarations of every top-level rule in `source` whose selector is exactly `selector`. */
function declarationsOf(withComments: string, selector: string): string {
  // A comment between two rules would otherwise be read as part of the next selector.
  const source = withComments.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  const rule = /(^|\})\s*([^{}@]+?)\s*\{/g;
  for (let m = rule.exec(source); m; m = rule.exec(source)) {
    if (m[2] === selector) found.push(braceBody(source, rule.lastIndex - 1));
  }
  return found.join(";");
}

/** The `<Input … />` element in the page that carries `attribute`, or "" when there is none. */
function inputElementWith(attribute: string): string {
  const elements = TSX.match(/<Input\b[\s\S]*?\/>/g) ?? [];
  return elements.find((element) => element.includes(attribute)) ?? "";
}

/**
 * Width the longest search placeholder needs, in rem. es-MX and fr-CA are both 31 characters;
 * es-MX measured 232.8px in a real browser at the input's 16px, plus 26px of padding and border
 * (#10244). ch would overshoot: "0" is far wider than this font's average glyph.
 */
const LONGEST_PLACEHOLDER_REM = (232.8 + 26) / 16;

describe("ReservationsPage search field", () => {
  // The Input's wrapper is a flex item with no sizing, so it stays at the input's intrinsic
  // width (~20 characters) and clips the fr-CA / es-MX placeholder at every width (#10241,
  // #10244). The fix is one rule outside any media query, so it holds from phone to desktop.
  const search = declarationsOf(CSS, ".search");

  it("has a flex basis that fits the longest placeholder, and grows", () => {
    const basis = search.match(/flex:\s*1 1 ([\d.]+)rem/);
    expect(Number(basis?.[1])).toBeGreaterThanOrEqual(LONGEST_PLACEHOLDER_REM);
  });

  it("never shrinks below that width, except to fit a narrower toolbar", () => {
    const floor = search.match(/min-inline-size:\s*min\(100%,\s*([\d.]+)rem\)/);
    expect(Number(floor?.[1])).toBeGreaterThanOrEqual(LONGEST_PLACEHOLDER_REM);
  });

  it("is sized by that one rule: no breakpoint resizes it, and 480px is gone", () => {
    expect(CSS.match(/\.search \{/g)).toHaveLength(1);
    expect(CSS).toMatch(/\n\.search \{/);
    expect(CSS).not.toMatch(/480px/);
  });

  it("leaves the toolbar rule itself free of search sizing", () => {
    expect(declarationsOf(CSS, ".toolbar")).not.toMatch(/flex-basis|inline-size/);
  });

  it("applies the class to the Input that carries the search label", () => {
    const searchInput = inputElementWith('aria-label={t("reservations.search.label")}');
    expect(searchInput).toMatch(/className=\{styles\.search\}/);
  });
});
