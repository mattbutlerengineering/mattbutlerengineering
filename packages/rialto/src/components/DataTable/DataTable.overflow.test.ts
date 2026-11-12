import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Same contract as Table: the zone grid must scroll inside its frame. */
describe("DataTable narrow-column overflow", () => {
  const css = readFileSync(path.join(__dirname, "DataTable.module.css"), "utf8");

  it("caps the scroll wrapper at its container without inline-size containment", () => {
    const wrapper = /\.wrapper\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(wrapper).toMatch(/overflow-x:\s*auto/);
    expect(wrapper).toMatch(/position:\s*relative/);
    expect(wrapper).toMatch(/max-inline-size:\s*100%/);
    expect(wrapper).toMatch(/min-inline-size:\s*0/);
    expect(wrapper).not.toMatch(/contain:\s*inline-size/);
  });
});
