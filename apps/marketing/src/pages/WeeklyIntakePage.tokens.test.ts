/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards against the invalid-token regression that shipped /weekly with
// collapsed spacing: var(--space-*) / var(--color-*) don't exist — only
// --rialto-* tokens are defined in this app. Read the raw file (not a
// vite import) so the check sees the source exactly as authored.
const css = readFileSync(join(process.cwd(), "src/pages/WeeklyIntakePage.module.css"), "utf8");

describe("WeeklyIntakePage.module.css design tokens", () => {
  it("references only --rialto-* custom properties", () => {
    const vars = css.match(/var\(\s*--[a-z0-9-]+/gi) ?? [];
    expect(vars.length).toBeGreaterThan(0);
    const offenders = vars.filter((v) => !v.includes("--rialto-"));
    expect(offenders).toEqual([]);
  });
});
