import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Header cells are nowrap. A `width: 100%` table inside `overflow-x: auto`
 * still reports that min-content as the wrapper's, so the drivers page grew
 * to 567px at a 375px viewport. jsdom does not apply these stylesheets.
 */
describe("Table narrow-column overflow", () => {
  const css = readFileSync(path.join(__dirname, "Table.module.css"), "utf8");

  it("sizes the scroll wrapper from its container, not the table", () => {
    const wrapper = /\.wrapper\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(wrapper).toMatch(/overflow-x:\s*auto/);
    expect(wrapper).toMatch(/position:\s*relative/);
    expect(wrapper).toMatch(/contain:\s*inline-size/);
    expect(wrapper).toMatch(/max-inline-size:\s*100%/);
    expect(wrapper).toMatch(/min-inline-size:\s*0/);
  });
});
