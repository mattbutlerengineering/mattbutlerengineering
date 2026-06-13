import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export interface FeatureFlag {
  enabled: boolean;
  percentage: number;
}

export interface FeatureContext {
  check(flagName: string): boolean;
  checkForUser(flagName: string, userId: string): boolean;
}

type FeatureFlagMap = Record<string, FeatureFlag>;

export const FEATURE_FLAGS_HEADER = "x-feature-flags";

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

/**
 * Fastify plugin that parses the x-feature-flags header once per request and
 * decorates the request with a ready-to-use FeatureContext. Routes call
 * `request.features.check("flag-name")` directly — no header access, no cast.
 */
export function createFeatureFlagsPlugin(): FastifyPluginAsync {
  return fp(
    async function featureFlagsPlugin(fastify) {
      fastify.decorateRequest("features");
      fastify.addHook("onRequest", async (request) => {
        const raw = request.headers[FEATURE_FLAGS_HEADER];
        // Headers are typed string | string[]; Node joins repeated headers
        // into one comma-separated string (invalid JSON → flags disabled),
        // the array branch only guards exotic clients
        const header = Array.isArray(raw) ? raw[0] : raw;
        request.features = createFeatureContext(header);
      });
    },
    { name: "feature-flags" }
  );
}

declare module "fastify" {
  interface FastifyRequest {
    features: FeatureContext;
  }
}
