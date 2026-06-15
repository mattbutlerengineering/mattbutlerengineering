import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { classifyError } from "./classify-error.js";

export { getTitleForStatus } from "./classify-error.js";

export const errorHandlerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error);

    const { status, title, detail, extensions } = classifyError(error);

    const problemDetails = createProblemDetails(
      status,
      title,
      detail,
      "about:blank",
      request.url,
      extensions
    );

    reply.status(status).send(problemDetails);
  });
});
