/// <reference types="node" />
// @vitest-environment node
/**
 * Motion Source Guard — HUD components resolve motion, they don't import it
 *
 * ADR-025: motion configs resolve through context so a vibe can retime them.
 * A component that imports `precision` or `springGentle` straight from
 * `tokens/motion` holds a value the provider cannot reach — it keeps default
 * timing under every vibe. That is invisible to typecheck and to every render
 * test, because the wrong config animates perfectly well.
 *
 * Scope: the HUD components whose JS motion the game vibe drives. Two of the
 * ten are absent by design and stay that way — see the note at the bottom.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MOTION_DRIVEN = {
  Meter: "components/Meter/Meter.tsx",
  Progress: "components/Progress/Progress.tsx",
  Odometer: "components/Odometer/Odometer.tsx",
  useTilt: "hooks/useTilt.ts",
} as const;

const TOKENS_MOTION_IMPORT = /import\s*\{[^}]*\}\s*from\s*"[./]*tokens\/motion"/;

describe("HUD motion source", () => {
  it.each(Object.entries(MOTION_DRIVEN))(
    "%s resolves its transition from useMotionPreset()",
    (_name, path) => {
      const source = readFileSync(join(SRC_DIR, path), "utf-8");

      expect(source).toMatch(/useMotionPreset/);
    }
  );

  it.each(Object.entries(MOTION_DRIVEN))(
    "%s imports no motion statics from tokens/motion",
    (_name, path) => {
      const source = readFileSync(join(SRC_DIR, path), "utf-8");

      expect(source).not.toMatch(TOKENS_MOTION_IMPORT);
    }
  );

  it("leaves prop-driven motion alone", () => {
    // SplitFlap's flip is timed by its own `flipInterval` prop and
    // DepartureBoard's cycle by `holdMs` — both caller contracts, neither a
    // token. There is no static to resolve, so the guard must not demand one:
    // routing them through the preset would silently override the caller.
    const splitFlap = readFileSync(join(SRC_DIR, "components/SplitFlap/SplitFlap.tsx"), "utf-8");
    const departureBoard = readFileSync(
      join(SRC_DIR, "components/DepartureBoard/DepartureBoard.tsx"),
      "utf-8"
    );

    expect(splitFlap).toMatch(/flipInterval \/ 1000/);
    expect(departureBoard).toMatch(/holdMs/);
  });
});
