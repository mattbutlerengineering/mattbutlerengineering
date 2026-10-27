/// <reference types="node" />
// @vitest-environment node
/**
 * WCAG 2.2.2 — decorative loops must stop on their own. jsdom applies no
 * stylesheet, so read the source CSS and assert no `infinite` iteration count.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const componentsDir = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(componentsDir, file), "utf-8");

describe("decorative CSS loops are bounded", () => {
  it.each([
    ["NeonSign/NeonSign.module.css", "rialto-neon-breathe"],
    ["Handshake/Handshake.module.css", "rialto-handshake-shuttle"],
  ])("%s runs %s a finite number of times", (file, name) => {
    const css = read(file);
    const line = css.split("\n").find((l) => l.includes(`animation: ${name}`));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/infinite/);
    expect(line).toMatch(/\s\d+;/);
  });
});
