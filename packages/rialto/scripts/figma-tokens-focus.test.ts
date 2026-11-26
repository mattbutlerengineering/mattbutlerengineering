// @vitest-environment node
/**
 * The focus shadow lives in a shared multi-selector rule in shadows.css
 * (`:root, [data-theme="dark"], [data-surface], [data-palette]`, ADR-035), not
 * in the per-theme blocks the Figma generator parses. This pins that the
 * Figma export still carries it in both modes. `pnpm regen --check` keeps the
 * committed file equal to the generator's output.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const figmaTokens = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../figma-tokens.json"), "utf-8")
) as Record<string, { shadow?: Record<string, { $value?: string; $type?: string }> }>;

describe("figma-tokens.json focus shadow", () => {
  it.each(["rialto/light", "rialto/dark"])("%s carries shadow.focus", (mode) => {
    const focus = figmaTokens[mode]?.shadow?.focus;
    expect(focus?.$type).toBe("shadow");
    expect(focus?.$value).toContain("var(--rialto-focus-ring)");
  });
});
