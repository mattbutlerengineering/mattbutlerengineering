/// <reference types="node" />
// @vitest-environment node
/**
 * The showcase landing's footer must start below the fold on first paint, or
 * late content pushes it off-screen as layout shift (CLS 0.57, #9878). Only the
 * landing container reserves the viewport; the login container stays centred.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "App.module.css"), "utf8");

const ruleBody = (selector: string): string =>
  css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("landing reserves a viewport above the footer", () => {
  it("declares a 100vh fallback followed by 100dvh on .landingContainer", () => {
    expect(ruleBody("\\.landingContainer")).toMatch(
      /min-height:\s*100vh\s*;\s*min-height:\s*100dvh\s*;/
    );
  });

  it("leaves .loginContainer alone", () => {
    expect(ruleBody("\\.loginContainer")).not.toMatch(/min-height/);
  });
});
