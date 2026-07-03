import type { ViteUserConfig } from "vitest/config";

type CoverageConfig = NonNullable<NonNullable<ViteUserConfig["test"]>["coverage"]>;

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

/**
 * Builds a vitest UserConfig from the axes that actually vary across the
 * workspace's per-package configs, optionally layering a variant-specific
 * preset config (e.g. the react plugin) and the caller's own overrides.
 */
export declare function buildVitestPreset(
  options: VitestPresetOptions,
  presetConfig?: ViteUserConfig
): ViteUserConfig;
