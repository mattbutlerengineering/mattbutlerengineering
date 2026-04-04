import { randomUUID } from "crypto";

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

  return function requestIdHook(fastify: { addHook: (name: string, fn: (req: { headers: Record<string, string>; id: string }) => void) => void }) {
    fastify.addHook("onRequest", async (request) => {
      const clientRequestId = request.headers[headerName];
      request.id = clientRequestId || generator();
    });
  };
}

export function getRequestId(request: { id?: string }): string {
  return request.id ?? "unknown";
}

export function logWithRequestId(logger: { info: (msg: string, ctx: Record<string, unknown>) => void }, requestId: string, message: string, ctx: Record<string, unknown> = {}) {
  logger.info(message, { ...ctx, requestId });
}
