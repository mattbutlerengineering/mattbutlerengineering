import type { ViteUserConfig } from "vitest/config";
import { buildVitestPreset } from "#vitest-base";
import type { VitestPresetOptions } from "#vitest-base";

export type { CoverageThresholds, VitestCoverageOptions, VitestPresetOptions } from "#vitest-base";

/** Node-environment vitest preset. Environment defaults to "node". */
export function defineVitestConfig(options: VitestPresetOptions): ViteUserConfig {
  return buildVitestPreset(options);
}
