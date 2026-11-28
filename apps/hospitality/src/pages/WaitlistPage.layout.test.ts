import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// CSS modules are not applied in jsdom, so the wrap is pinned on the parsed source rules (#10035).
const CSS = readFileSync(resolve(process.cwd(), "src/pages/WaitlistPage.module.css"), "utf-8");

type Declarations = Readonly<Record<string, string>>;

/** Top-level rules and `@media` blocks, each block parsed into selector -> declarations. */
function parseSheet(css: string): {
  readonly rules: Readonly<Record<string, Declarations>>;
  readonly media: Readonly<Record<string, Readonly<Record<string, Declarations>>>>;
} {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let rules: Record<string, Declarations> = {};
  let media: Record<string, Readonly<Record<string, Declarations>>> = {};
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf("{", i);
    if (open === -1) break;
    const prelude = source.slice(i, open).trim();
    const close = matchingBrace(source, open);
    const body = source.slice(open + 1, close);
    if (prelude.startsWith("@media")) {
      media = { ...media, [prelude.replace(/\s+/g, " ")]: parseSheet(body).rules };
    } else {
      rules = { ...rules, [prelude]: parseDeclarations(body) };
    }
    i = close + 1;
  }
  return { rules, media };
}

function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced brace at ${open}`);
}

function parseDeclarations(body: string): Declarations {
  return Object.fromEntries(
    body
      .split(";")
      .map((decl) => decl.trim())
      .filter(Boolean)
      .map((decl) => {
        const colon = decl.indexOf(":");
        return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()];
      })
  );
}

const sheet = parseSheet(CSS);
// The app's tablet breakpoint (the DashboardLayout sidebar is still visible at 768); it covers 375 too.
const TABLET = "@media (max-width: 1024px)";

describe("WaitlistPage row layout on phone and tablet (#10035)", () => {
  const tablet = sheet.media[TABLET] ?? {};

  it("wraps the row so the table picker and actions drop below the guest info", () => {
    expect(tablet[".row"]?.["flex-wrap"]).toBe("wrap");
    expect(tablet[".actions"]?.["flex-basis"]).toBe("100%");
  });

  it("wraps the actions themselves so Seat, Notify and Cancel never run off-screen", () => {
    expect(tablet[".actions"]?.["flex-wrap"]).toBe("wrap");
    expect(tablet[".actions"]?.["gap"]).toMatch(/^var\(--rialto-space-/);
  });

  it("keeps 44px touch targets on the row actions", () => {
    const touch = sheet.media["@media (pointer: coarse), (max-width: 1024px)"] ?? {};
    expect(touch[".actions > button"]?.["min-block-size"]).toBe("44px");
    expect(touch[".actions > button"]?.["min-inline-size"]).toBe("44px");
  });

  it("keeps 44px touch targets on the party-size chips (#10038)", () => {
    const touch = sheet.media["@media (pointer: coarse), (max-width: 1024px)"] ?? {};
    expect(touch[".partySizeRow > button"]?.["min-block-size"]).toBe("44px");
    expect(touch[".partySizeRow > button"]?.["min-inline-size"]).toBe("44px");
  });

  it("never introduces horizontal scroll", () => {
    expect(CSS).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });
});

describe("WaitlistPage row layout on desktop", () => {
  it("stays a single non-wrapping line", () => {
    expect(sheet.rules[".row"]?.["flex-wrap"]).toBeUndefined();
    expect(sheet.rules[".actions"]?.["flex-wrap"]).toBeUndefined();
    expect(sheet.rules[".actions"]?.["flex-basis"]).toBeUndefined();
  });

  it("keeps the party-size chips at their compact desktop size", () => {
    expect(sheet.rules[".partySizeRow > button"]).toBeUndefined();
  });
});
