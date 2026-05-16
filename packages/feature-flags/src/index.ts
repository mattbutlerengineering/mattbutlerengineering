export interface FeatureFlag {
  enabled: boolean;
  percentage: number;
}

export type FeatureFlagMap = Record<string, FeatureFlag>;

export function isEnabled(flags: FeatureFlagMap | null, flagName: string): boolean {
  if (!flags || !flags[flagName]) return false;
  const flag = flags[flagName];
  if (!flag.enabled) return false;
  if (!flag.percentage || flag.percentage >= 100) return true;
  return false;
}

export function isEnabledForSeed(flags: FeatureFlagMap | null, flagName: string, seed: string): boolean {
  if (!flags || !flags[flagName]) return false;
  const flag = flags[flagName];
  if (!flag.enabled) return false;
  if (!flag.percentage || flag.percentage >= 100) return true;
  if (!seed) return false;
  const hash = hashCode(seed);
  return (hash % 100) < flag.percentage;
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

export function parseFeatureFlags(header: string | null | undefined): FeatureFlagMap {
  if (!header) return {};
  try {
    return JSON.parse(header);
  } catch {
    return {};
  }
}
