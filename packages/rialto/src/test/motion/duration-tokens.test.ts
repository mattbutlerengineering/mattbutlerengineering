/// <reference types="node" />
// @vitest-environment node
/**
 * Duration Token Guard — hardcoded transition durations in HUD components
 *
 * A vibe retimes the interface by overriding `--rialto-duration-*`. A
 * declaration that hardcodes `0.15s` instead of `var(--rialto-duration-standard)`
 * is invisible to that mechanism: it keeps the default timing under every vibe,
 * and under `prefers-reduced-motion` it keeps animating after the adapter has
 * zeroed the tokens. Nothing in lint or typecheck sees this — the CSS is valid,
 * it just cannot be reached.
 *
 * The rule is deliberately value-preserving: a literal is only a violation when
 * it equals a duration token's own value. `0.3s`, `1.5s`, and the ambient
 * `animation` loops match no token, so they stay literals — tokenizing them
 * would require inventing a token, which would change default-vibe output.
 *
 * Scope: the ten HUD components the game vibe drives. The rest of the package
 * still carries literals; widening this list is how they get tokenized, and
 * each addition is a real (small) change to that component's reachability.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPONENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "components");

const HUD_COMPONENTS = [
  "StatusLED",
  "Meter",
  "Odometer",
  "SplitFlap",
  "DepartureBoard",
  "DataTable",
  "Card",
  "Stat",
  "Progress",
  "TapeChart",
  "SegmentedControl",
] as const;

/** Token values as declared in `tokens/shadows.css`, in milliseconds. */
const DURATION_TOKENS_MS: Record<number, string> = {
  100: "--rialto-duration-fast",
  150: "--rialto-duration-standard",
  200: "--rialto-duration-slow",
};

const TRANSITION_DECLARATION = /transition(?:-duration)?\s*:([^;}]*)/g;
const TIME_LITERAL = /(\d*\.?\d+)(ms|s)\b/g;

function toMilliseconds(value: string, unit: string): number {
  return unit === "ms" ? Number(value) : Number(value) * 1000;
}

function findTokenizableLiterals(css: string): string[] {
  return [...css.matchAll(TRANSITION_DECLARATION)].flatMap((declaration) =>
    [...(declaration[1] ?? "").matchAll(TIME_LITERAL)]
      .map(([literal, value = "", unit = ""]) => ({
        literal,
        token: DURATION_TOKENS_MS[toMilliseconds(value, unit)],
      }))
      .filter(({ token }) => token !== undefined)
      .map(({ literal, token }) => `${literal} → var(${token})`)
  );
}

describe("HUD duration tokens", () => {
  it.each(HUD_COMPONENTS)(
    "%s uses duration tokens, not literals, in its transitions",
    (component) => {
      const css = readFileSync(join(COMPONENTS_DIR, component, `${component}.module.css`), "utf-8");

      expect(findTokenizableLiterals(css)).toEqual([]);
    }
  );

  it("leaves literals that match no token alone", () => {
    // `animation` shorthands are ambient loops, not interaction feedback: their
    // durations match no token, so the guard must not demand one be invented.
    const progress = readFileSync(join(COMPONENTS_DIR, "Progress", "Progress.module.css"), "utf-8");

    expect(progress).toContain("1.5s");
    expect(findTokenizableLiterals(progress)).toEqual([]);
  });
});
