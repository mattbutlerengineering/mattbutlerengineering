import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createProblemDetails } from "@mbe/types";

interface CustomError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  meta?: Record<string, unknown>;
  validation?: Array<{
    keyword: string;
    instancePath?: string;
    dataPath?: string;
    schemaPath?: string;
    params?: Record<string, unknown>;
    message?: string;
  }>;
  details?: Record<string, unknown>;
}

export const errorHandlerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    // 1. Log the error using Fastify logger
    request.log.error(error);

    const err = error as CustomError;

    // 2. Map the error to RFC 7807/Problem Details
    let status = err.statusCode || err.status || 500;
    let title = "Internal Server Error";
    let detail = err.message || "An unexpected error occurred";
    const type = "about:blank";
    const extensions: Record<string, unknown> = {};

    // Check if it is a Prisma error
    const isPrisma =
      err.name === "PrismaClientKnownRequestError" ||
      err.constructor?.name === "PrismaClientKnownRequestError" ||
      (typeof err.code === "string" && err.code.startsWith("P2"));

    if (isPrisma) {
      const prismaCode = err.code || "";
      extensions.prismaCode = prismaCode;
      if (err.meta) {
        extensions.prismaMeta = err.meta;
      }

      if (prismaCode === "P2025") {
        status = 404;
        title = "Not Found";
        detail = (err.meta?.cause as string) || err.message || "Record not found";
      } else if (prismaCode === "P2002") {
        status = 409;
        title = "Conflict";
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "field";
        detail = `Unique constraint failed: ${target}`;
      } else if (prismaCode === "P2003") {
        status = 409;
        title = "Conflict";
        detail = `Foreign key constraint failed on field: ${(err.meta?.field_name as string) || "field"}`;
      } else {
        status = 500;
        title = "Database Error";
        detail = "A database error occurred";
      }
    } else if (err.validation) {
      // AJV validation error
      status = 400;
      title = "Bad Request";
      const validationMsgs = err.validation.map((v) => {
        const path = v.instancePath || v.dataPath || "";
        const field = path.startsWith("/")
          ? path.slice(1)
          : (v.params?.missingProperty as string) || "";
        const fieldPrefix = field ? `'${field}' ` : "";
        return `${fieldPrefix}${v.message || ""}`;
      });
      detail = `Validation failed: ${validationMsgs.join(", ")}`;
      extensions.details = {
        validation: err.validation,
      };
    } else if (
      typeof err.statusCode === "number" &&
      err.statusCode >= 400 &&
      err.statusCode < 600
    ) {
      // Standard HTTP errors thrown by Fastify or route handlers
      status = err.statusCode;
      title = getTitleForStatus(status);
      detail = err.message;
      if (err.details) {
        extensions.details = err.details;
      }
    }

    // Call createProblemDetails from @mbe/types
    const problemDetails = createProblemDetails(
      status,
      title,
      detail,
      type,
      request.url,
      extensions
    );

    // Send the response
    reply.status(status).send(problemDetails);
  });
});

function getTitleForStatus(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 406:
      return "Not Acceptable";
    case 408:
      return "Request Timeout";
    case 409:
      return "Conflict";
    case 410:
      return "Gone";
    case 415:
      return "Unsupported Media Type";
    case 422:
      return "Unprocessable Entity";
    case 429:
      return "Too Many Requests";
    case 503:
      return "Service Unavailable";
    default:
      return "Error";
  }
}
