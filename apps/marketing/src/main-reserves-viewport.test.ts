/// <reference types="node" />
// @vitest-environment node
/**
 * The footer must start below the fold on first paint, or late content (lazy
 * route chunk, web font) pushes it off-screen and registers as layout shift
 * (CLS 0.49 on /ai-health, #9878). `<main>` therefore reserves a full viewport.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "App.module.css"), "utf8");

describe("main reserves a viewport above the footer", () => {
  const rule = css.match(/\.main\s*\{([^}]*)\}/)?.[1] ?? "";

  it("declares a 100vh fallback followed by 100dvh", () => {
    expect(rule).toMatch(/min-height:\s*100vh\s*;\s*min-height:\s*100dvh\s*;/);
  });
});
