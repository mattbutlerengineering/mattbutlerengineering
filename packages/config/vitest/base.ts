import { defineConfig, mergeConfig } from "vitest/config";
import type { ViteUserConfig } from "vitest/config";

type TestConfig = NonNullable<ViteUserConfig["test"]>;
type CoverageConfig = NonNullable<TestConfig["coverage"]>;

/** Coverage percentage gates. Any field left unset is not enforced (matches vitest's own behavior). */
export interface CoverageThresholds {
  lines?: number;
  branches?: number;
  functions?: number;
  statements?: number;
}

export interface VitestCoverageOptions {
  include: string[];
  exclude: string[];
  thresholds: CoverageThresholds;
  /** Defaults to ["text", "json", "html"]. */
  reporter?: CoverageConfig["reporter"];
}

export interface VitestPresetOptions {
  /** Defaults to "node". */
  environment?: "node" | "jsdom";
  /** Defaults to true. */
  globals?: boolean;
  /** Test-file include glob. Omit to fall back to vitest's own default. */
  include?: string[];
  coverage: VitestCoverageOptions;
  /** Raw vite/vitest config merged in last, for anything package-specific (setupFiles, css, resolve.alias, env, ...). */
  extend?: ViteUserConfig;
}

const DEFAULT_REPORTER: CoverageConfig["reporter"] = ["text", "json", "html"];

/**
 * Builds a vitest UserConfig from the axes that actually vary across the
 * workspace's per-package configs, optionally layering a variant-specific
 * preset config (e.g. the react plugin) and the caller's own overrides.
 */
export function buildVitestPreset(
  options: VitestPresetOptions,
  presetConfig: ViteUserConfig = {}
): ViteUserConfig {
  const testConfig: TestConfig = {
    globals: options.globals ?? true,
    environment: options.environment ?? "node",
    ...(options.include ? { include: options.include } : {}),
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
