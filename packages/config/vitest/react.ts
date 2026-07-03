import react from "@vitejs/plugin-react";
import type { ViteUserConfig } from "vitest/config";
import { buildVitestPreset } from "#vitest-base";
import type { VitestPresetOptions } from "#vitest-base";

export type { CoverageThresholds, VitestCoverageOptions, VitestPresetOptions } from "#vitest-base";

/** React vitest preset: jsdom environment (overridable) + @vitejs/plugin-react. */
export function defineVitestConfig(options: VitestPresetOptions): ViteUserConfig {
  return buildVitestPreset({ environment: "jsdom", ...options }, { plugins: [react()] });
}
