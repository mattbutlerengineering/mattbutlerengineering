import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Crawlers and link previews read the served HTML, not the title set after render.
describe("index.html", () => {
  it("serves a landing-page title, not the generic dashboard one", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf8");
    expect(html).toContain("<title>Hospitality — Matt Butler Engineering</title>");
  });
});
