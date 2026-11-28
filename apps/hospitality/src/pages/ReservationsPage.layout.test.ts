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
function declarationsOf(source: string, selector: string): string {
  const found: string[] = [];
  const rule = /(^|\})\s*([^{}@]+?)\s*\{/g;
  for (let m = rule.exec(source); m; m = rule.exec(source)) {
    if (m[2] === selector) found.push(braceBody(source, rule.lastIndex - 1));
  }
  return found.join(";");
}

/** The body of the one `@media <query>` block, or "" when there is none. */
function mediaBody(query: string): string {
  const at = CSS.indexOf(`@media ${query} {`);
  return at === -1 ? "" : braceBody(CSS, CSS.indexOf("{", at));
}

describe("ReservationsPage search field on a phone", () => {
  // The Input's wrapper is a flex item with no sizing, so it stays at the input's intrinsic
  // width (~20 characters) and clips the fr-CA / es-MX placeholder at 375px (#10241).
  const phone = mediaBody("(max-width: 480px)");

  it("takes the whole toolbar row at phone width", () => {
    const search = declarationsOf(phone, ".search");
    expect(search).toMatch(/flex:\s*1 1 100%/);
    expect(search).toMatch(/min-inline-size:\s*0/);
  });

  it("leaves the tablet and desktop toolbar rule free of search sizing", () => {
    expect(declarationsOf(CSS, ".toolbar")).not.toMatch(/flex-basis|inline-size/);
    expect(CSS).not.toMatch(/\n\.search \{/);
  });

  it("applies the class to the search Input's wrapper", () => {
    expect(TSX).toMatch(/className=\{styles\.search\}/);
  });
});
