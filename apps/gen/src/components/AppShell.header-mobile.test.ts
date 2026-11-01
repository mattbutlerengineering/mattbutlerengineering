// @vitest-environment node
/**
 * #7962: at 375px the signed-in playground header wrapped to two rows and
 * the first row was the history toggle plus a lone gold diamond — the
 * product name was hidden by this rule below 768px. Pins that the mobile
 * media query no longer hides `.logoText`, while `.shortcutHint` (a
 * keyboard hint with no touch affordance) stays hidden.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(import.meta.dirname, rel), "utf8");

function mobileMediaBlock(css: string): string {
  const match = css.match(/@media \(max-width: 767px\)\s*\{([\s\S]*?)\n\}/);
  const block = match?.[1];
  expect(block).toBeDefined();
  return block ?? "";
}

describe("AppShell header at mobile widths (#7962)", () => {
  it("does not hide the product name below 768px", () => {
    const block = mobileMediaBlock(read("AppShell.module.css"));
    expect(block).not.toMatch(/\.logoText/);
  });

  it("still hides the keyboard-shortcut hint below 768px", () => {
    const block = mobileMediaBlock(read("AppShell.module.css"));
    expect(block).toMatch(/\.shortcutHint/);
  });
});
