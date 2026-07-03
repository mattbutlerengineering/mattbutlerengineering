import react from "@vitejs/plugin-react";
import { buildVitestPreset } from "#vitest-base";

/**
 * React vitest preset: jsdom environment (overridable) + @vitejs/plugin-react.
 *
 * @param {import("#vitest-base").VitestPresetOptions} options
 * @returns {import("vitest/config").ViteUserConfig}
 */
export function defineVitestConfig(options) {
  return buildVitestPreset({ environment: "jsdom", ...options }, { plugins: [react()] });
}
