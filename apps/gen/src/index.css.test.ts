/// <reference types="node" />
// @vitest-environment node
/**
 * Guards the mechanism apps/marketing and apps/rialto-web use to apply the
 * family body font: a `body { font-family: var(--rialto-font-sans); }` rule
 * loaded at the app root, alongside the rialto tokens stylesheet.
 *
 * Without it, any text node that doesn't set its own font-family (e.g.
 * Hero's subtitle paragraph) falls through to the browser's UA default
 * serif instead of the loaded family fonts — see #4856. A real-cascade
 * computed-style assertion would need `@mattbutlerengineering/rialto/styles`
 * built to a real dist (this suite mocks rialto everywhere else, e.g.
 * AppShell.test.tsx), so this reads the stylesheet source directly, the
 * same way apps/marketing/src/landing-motion.test.ts guards a CSS
 * mechanism.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(SRC_DIR, "index.css"), "utf-8");

describe("index.css body font rule", () => {
  it("sets the rialto sans font token on body, not `inherit` or nothing", () => {
    const bodyRule = css.match(/\bbody\s*\{([^}]*)\}/);
    expect(bodyRule).not.toBeNull();
    expect(bodyRule![1]).toMatch(/font-family:\s*var\(--rialto-font-sans\)/);
  });
});
