import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export interface RequestIdOptions {
  headerName?: string;
  generator?: () => string;
}

const DEFAULT_OPTIONS: Required<RequestIdOptions> = {
  headerName: "x-request-id",
  generator: () => randomUUID(),
};

export function createRequestIdMiddleware(options: RequestIdOptions = {}) {
  const { headerName, generator } = { ...DEFAULT_OPTIONS, ...options };

  return fp(
    async function requestIdPlugin(fastify: FastifyInstance) {
      fastify.addHook("onRequest", async (request) => {
        const clientRequestId = request.headers[headerName];
        if (typeof clientRequestId === "string" && clientRequestId.length > 0) {
          request.id = clientRequestId;
        } else {
          request.id = generator();
        }
      });
    },
    { name: "request-id-middleware" }
  );
}
