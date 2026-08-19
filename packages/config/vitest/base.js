import { defineConfig, mergeConfig } from "vitest/config";

const DEFAULT_REPORTER = ["text", "json", "html"];

/**
 * Builds a vitest UserConfig from the axes that actually vary across the
 * workspace's per-package configs, optionally layering a variant-specific
 * preset config (e.g. the react plugin) and the caller's own overrides.
 *
 * @param {import("./base.js").VitestPresetOptions} options
 * @param {import("vitest/config").ViteUserConfig} [presetConfig]
 * @returns {import("vitest/config").ViteUserConfig}
 */
export function buildVitestPreset(options, presetConfig = {}) {
  const testConfig = {
    globals: options.globals ?? true,
    environment: options.environment ?? "node",
    ...(options.include ? { include: options.include } : {}),
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/junit.xml" },
    coverage: {
      provider: "v8",
      reporter: options.coverage.reporter ?? DEFAULT_REPORTER,
      include: options.coverage.include,
      exclude: options.coverage.exclude,
      thresholds: options.coverage.thresholds,
    },
  };

  const base = defineConfig({ test: testConfig });
  const withPreset = mergeConfig(base, presetConfig);
  return options.extend ? mergeConfig(withPreset, options.extend) : withPreset;
}
