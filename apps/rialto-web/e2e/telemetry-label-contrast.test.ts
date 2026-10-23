/**
 * axe `color-contrast` on the telemetry HUD labels (#7268). `Text variant="label"`
 * uses `--rialto-text-tertiary` (0.38 alpha on the dark recessed HUD surface,
 * well under 4.5:1), so the HUD must lift tertiary text to the secondary token.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  resolve(__dirname, "../src/pages/telemetry/Telemetry.module.css"),
  "utf-8"
);

function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("telemetry HUD label contrast", () => {
  it("maps tertiary text to the secondary token inside the HUD", () => {
    expect(ruleBody("\\.hud")).toMatch(
      /--rialto-text-tertiary:\s*var\(--rialto-text-secondary\)\s*;/
    );
  });
});
