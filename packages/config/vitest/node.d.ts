import type { ViteUserConfig } from "vitest/config";
import type { VitestPresetOptions } from "#vitest-base";

export type { CoverageThresholds, VitestCoverageOptions, VitestPresetOptions } from "#vitest-base";

/** Node-environment vitest preset. Environment defaults to "node". */
export declare function defineVitestConfig(options: VitestPresetOptions): ViteUserConfig;
