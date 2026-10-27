/// <reference types="node" />
// @vitest-environment node
/**
 * WCAG 2.2.2 — auto-starting motion longer than 5s needs a pause/stop/hide
 * control, so decorative loops must end on their own within 5s total. jsdom
 * applies no stylesheet, so read the source CSS and compute iterations x
 * duration.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_TOTAL_SECONDS = 5;
const componentsDir = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(componentsDir, file), "utf-8");

function totalSeconds(css: string, name: string, durationVar: string): number {
  const line = css.split("\n").find((l) => l.includes(`animation: ${name}`));
  expect(line).toBeDefined();
  expect(line).not.toMatch(/infinite/);
  const iterations = Number(/\s(\d+)(?:\s+(?:forwards|both))?;/.exec(line ?? "")?.[1]);
  const seconds = Number(new RegExp(`${durationVar}:\\s*([\\d.]+)s`).exec(css)?.[1]);
  return iterations * seconds;
}

describe("decorative CSS loops stop within 5s (WCAG 2.2.2)", () => {
  it.each([
    ["NeonSign/NeonSign.module.css", "rialto-neon-breathe", "--neon-warm-cycle"],
    ["Handshake/Handshake.module.css", "rialto-handshake-shuttle", "--handshake-shuttle"],
  ])("%s runs %s for at most 5s in total", (file, name, durationVar) => {
    const total = totalSeconds(read(file), name, durationVar);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_SECONDS);
  });

  // Without a fill-mode the tube snaps back to full opacity when the breathe
  // ends, instead of settling on the keyframes' dim end value.
  it("NeonSign's breathe holds its last frame after it ends", () => {
    const css = read("NeonSign/NeonSign.module.css");
    const line = css.split("\n").find((l) => l.includes("animation: rialto-neon-breathe"));
    expect(line).toMatch(/\s(forwards|both)[\s;]/);
  });
});
