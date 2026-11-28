import type { ViteUserConfig } from "vitest/config";
import type { VitestPresetOptions } from "#vitest-base";

export type { CoverageThresholds, VitestCoverageOptions, VitestPresetOptions } from "#vitest-base";

export interface ReactVitestPresetOptions extends VitestPresetOptions {
  /**
   * Test-file globs that need the DOM. When set, only these run under `environment` with
   * `extend.test.setupFiles`; every other `include` file runs in a node project with no
   * setup files, so a DOM-needing file left out fails with "document is not defined".
   */
  domInclude?: string[];
}

/** React vitest preset: jsdom environment (overridable) + @vitejs/plugin-react. */
export declare function defineVitestConfig(options: ReactVitestPresetOptions): ViteUserConfig;
