import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createFeatureContext, type FeatureContext } from "./index.js";

export const FEATURE_FLAGS_HEADER = "x-feature-flags";

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
