export interface FeatureFlag {
  enabled: boolean;
  percentage: number;
}

export interface FeatureContext {
  check(flagName: string): boolean;
  checkForUser(flagName: string, userId: string): boolean;
}

type FeatureFlagMap = Record<string, FeatureFlag>;

function isEnabled(flags: FeatureFlagMap | null, flagName: string): boolean {
  if (!flags || !flags[flagName]) return false;
  const flag = flags[flagName];
  if (!flag.enabled) return false;
  if (flag.percentage >= 100) return true;
  return false;
}

function isEnabledForSeed(flags: FeatureFlagMap | null, flagName: string, seed: string): boolean {
  if (!flags || !flags[flagName]) return false;
  const flag = flags[flagName];
  if (!flag.enabled) return false;
  if (flag.percentage >= 100) return true;
  if (!seed || flag.percentage <= 0) return false;
  const hash = hashCode(seed);
  return hash % 100 < flag.percentage;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function parseFeatureFlags(header: string | null | undefined): FeatureFlagMap {
  if (!header) return {};
  try {
    return JSON.parse(header);
  } catch {
    return {};
  }
}

export function createFeatureContext(header: string | null | undefined): FeatureContext {
  const flags = parseFeatureFlags(header);
  return {
    check(flagName: string): boolean {
      return isEnabled(flags, flagName);
    },
    checkForUser(flagName: string, userId: string): boolean {
      return isEnabledForSeed(flags, flagName, userId);
    },
  };
}
export { createFeatureFlagsPlugin, FEATURE_FLAGS_HEADER } from "./plugin.js";
