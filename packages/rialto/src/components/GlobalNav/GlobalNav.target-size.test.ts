import { readFileSync } from "node:fs";
import { join } from "node:path";

// jsdom does not apply CSS modules, so assert the source rule directly.
describe("GlobalNav brand link target size (WCAG 2.5.8)", () => {
  it("keeps the brand link hit area at 24px minimum", () => {
    const css = readFileSync(join(__dirname, "GlobalNav.module.css"), "utf8");
    const rule = /\n\.brand \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/display:\s*inline-flex/);
    expect(rule).toMatch(/min-block-size:\s*24px/);
  });
});
