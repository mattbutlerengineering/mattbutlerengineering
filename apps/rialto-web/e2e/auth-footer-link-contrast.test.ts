/**
 * axe `color-contrast` on the auth footer accent link (#6978). Bare
 * `--rialto-accent` is not a text colour (3.15:1 on the light surface), so
 * `.footerLinkAccent` must darken it toward the primary text token.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(__dirname, "../src/pages/auth/AuthLayout.module.css"), "utf-8");

function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("auth footer accent link contrast", () => {
  it("does not use bare --rialto-accent as the text colour", () => {
    const body = ruleBody("\\.footerLinkAccent");
    expect(body).toMatch(/color:/);
    expect(body).not.toMatch(/color:\s*var\(--rialto-accent\)\s*;/);
    expect(body).toMatch(/color-mix\(.*--rialto-accent.*--rialto-text-primary/);
  });
});
