import type { ViteUserConfig } from "vitest/config";
import type { VitestPresetOptions } from "#vitest-base";

export type { CoverageThresholds, VitestCoverageOptions, VitestPresetOptions } from "#vitest-base";

/** React vitest preset: jsdom environment (overridable) + @vitejs/plugin-react. */
export declare function defineVitestConfig(options: VitestPresetOptions): ViteUserConfig;
