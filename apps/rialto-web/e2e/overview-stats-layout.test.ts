/**
 * At 768px the showcase sidebar is still open, so the stats row is about
 * 444px wide — narrower than the viewport breakpoint (640px) that stacks it.
 * The row has to key off an ancestor's box, or the three cards stay uneven
 * and paint over the container border. A container query on `.stats` itself
 * never matches `.stats`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../src/pages/OverviewPage.module.css"),
  "utf8"
);

describe("OverviewPage stats row", () => {
  it("stacks from an ancestor container, not only the viewport", () => {
    expect(CSS).toMatch(/\.statsFrame\s*\{[^}]*container-type:\s*inline-size/);
    expect(CSS).not.toMatch(/\.stats\s*\{[^}]*container-type:\s*inline-size/);

    const query = /@container\s*\(max-width:\s*40rem\)\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1];
    expect(query, "a 40rem container query restacks the stats").toBeDefined();
    expect(query).toMatch(/\.stats\s*\{[^}]*flex-direction:\s*column/);
    expect(query).toMatch(/\.stat\s*\{[^}]*inline-size:\s*100%/);
    expect(query).toMatch(/\.stat\s*\{[^}]*min-inline-size:\s*0/);
  });
});
