import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { captureRequestError } from "@mbe/sentry/node";
import { classifyError } from "./classify-error.js";

export const errorHandlerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error);
    // Single owner of the error-handler slot (ADR-008): report to Sentry here.
    captureRequestError(error, request, reply);

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
