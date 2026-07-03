import { buildVitestPreset } from "#vitest-base";

/**
 * Node-environment vitest preset. Environment defaults to "node".
 *
 * @param {import("#vitest-base").VitestPresetOptions} options
 * @returns {import("vitest/config").ViteUserConfig}
 */
export function defineVitestConfig(options) {
  return buildVitestPreset(options);
}
