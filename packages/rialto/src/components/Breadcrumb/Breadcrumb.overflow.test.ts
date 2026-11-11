/**
 * A trail wider than its column was a nowrap flex row. Items shrank to the
 * longest word, so "Lap 14" wrapped mid-phrase and single-word crumbs painted
 * through the chevrons. The list has to wrap whole crumbs inside the column.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Breadcrumb narrow-column overflow", () => {
  const css = readFileSync(path.join(__dirname, "Breadcrumb.module.css"), "utf8");

  it("wraps whole crumbs inside the column instead of shrinking them into the chevrons", () => {
    const nav = /\.nav\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    const list = /\.list\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    const item = /\.item\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(nav).toMatch(/min-width:\s*0/);
    expect(nav).toMatch(/max-width:\s*100%/);
    expect(list).toMatch(/flex-wrap:\s*wrap/);
    expect(list).toMatch(/width:\s*100%/);
    expect(list).toMatch(/min-width:\s*0/);
    expect(item).toMatch(/flex-shrink:\s*0/);
    expect(item).toMatch(/max-width:\s*100%/);
    expect(css).toMatch(/\.link,\s*\n\.current\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
