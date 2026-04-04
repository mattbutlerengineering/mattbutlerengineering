import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";

export interface ApiVersioningOptions {
  currentVersion: string;
  successorVersion?: string;
  sunsetMonthsFromNow?: number;
}

const DEFAULT_SUCCESSOR_VERSION = (current: string) => {
  const match = current.match(/^v(\d+)$/);
  if (match) {
    const next = parseInt(match[1], 10) + 1;
    return `v${next}`;
  }
  return undefined;
};

const getSunsetDate = (monthsFromNow: number): string => {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  return date.toUTCString();
};

const apiVersioningPlugin: FastifyPluginAsync<ApiVersioningOptions> = async (
  fastify: FastifyInstance,
  options: ApiVersioningOptions
) => {
  const {
    currentVersion,
    successorVersion = DEFAULT_SUCCESSOR_VERSION(currentVersion),
    sunsetMonthsFromNow = 6,
  } = options;

  const sunsetDate = getSunsetDate(sunsetMonthsFromNow);

  fastify.addHook("onSend", async (request, reply) => {
    reply.header("API-Version", currentVersion);

    if (successorVersion) {
      const path = request.url.replace(/\/v\d+/, `/${successorVersion}`);
      reply.header("Link", `<${path}>; rel="successor-version"`);
    }
  });

  fastify.decorate("addDeprecationHeaders", (reply: FastifyReply) => {
    reply.header("Deprecation", "true");
    reply.header("Sunset", sunsetDate);
    if (successorVersion) {
      const path = reply.request.url.replace(/\/v\d+/, `/${successorVersion}`);
      reply.header("Link", `<${path}>; rel="successor-version"`);
    }
  });

  fastify.decorate("apiVersion", currentVersion);
  fastify.decorate("successorVersion", successorVersion);
  fastify.decorate("sunsetDate", sunsetDate);
};

declare module "fastify" {
  interface FastifyInstance {
    apiVersion: string;
    successorVersion?: string;
    sunsetDate: string;
    addDeprecationHeaders: (reply: FastifyReply) => void;
  }
}

export default apiVersioningPlugin;
export { apiVersioningPlugin, getSunsetDate, DEFAULT_SUCCESSOR_VERSION };
