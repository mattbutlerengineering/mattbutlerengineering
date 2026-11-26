import type { FastifyPluginAsync } from "fastify";
import {
  type AccessToken,
  type CreateAccessTokenRequest,
  type MintedAccessToken,
  type ProblemDetails,
  accessTokenResponseJsonSchema,
  createAccessTokenBodyJsonSchema,
  createProblemDetails,
  mintedAccessTokenResponseJsonSchema,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { isPatRequest, isWriteScopedPatRequest } from "../middleware/pat-auth.js";
import { TooManyAccessTokensError } from "../services/access-token.js";

const idParams = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
};

/**
 * `GET /api/v1/me/access-token` (#9781): lets a remote MCP server learn whether
 * the bearer it was handed carries the write scope, so it can offer write
 * tools. It answers only `{ write }` for the caller's own token (never the
 * secret, an id, or another user's token) and 404 for a session caller. It sits
 * outside the blocked tokens prefix on purpose.
 */
export const currentAccessTokenRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: { data: { write: boolean } } | ProblemDetails }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Whether the presented personal access token carries the write scope",
        tags: ["Access tokens"],
        response: {
          200: {
            type: "object",
            properties: {
              data: { type: "object", properties: { write: { type: "boolean" } } },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isPatRequest(request)) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "This is not a personal access token."));
      }
      return { data: { write: isWriteScopedPatRequest(request) } };
    }
  );
};

/**
 * Personal access tokens (#9663): a user mints, lists and revokes the
 * read-only bearers remote MCP clients use. The routes sit behind the normal
 * Auth0 `requireAuth`; a token can never mint or revoke tokens. Tokens belong
 * to the caller's `sub`, so another user's id answers 404.
 */
export const accessTokenRoutes: FastifyPluginAsync = async (fastify) => {
  const { accessTokenService } = fastify.services;
  const subOf = (request: { user?: { raw: { sub?: string } } }): string =>
    request.user?.raw.sub ?? "";

  fastify.post<{
    Body: CreateAccessTokenRequest;
    Reply: { data: MintedAccessToken } | ProblemDetails;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Mint a personal access token (the plaintext is returned once)",
        tags: ["Access tokens"],
        body: createAccessTokenBodyJsonSchema,
        response: {
          201: { type: "object", properties: { data: mintedAccessTokenResponseJsonSchema } },
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await accessTokenService.mint(subOf(request), request.body);
        return reply.code(201).send({ data });
      } catch (error) {
        if (error instanceof TooManyAccessTokensError) {
          return reply.code(409).send(createProblemDetails(409, "Conflict", error.message));
        }
        throw error;
      }
    }
  );

  fastify.get<{ Reply: { data: AccessToken[] } }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List the caller's personal access tokens",
        tags: ["Access tokens"],
        response: {
          200: {
            type: "object",
            properties: { data: { type: "array", items: accessTokenResponseJsonSchema } },
          },
        },
      },
    },
    async (request) => ({ data: await accessTokenService.list(subOf(request)) })
  );

  fastify.delete<{ Params: { id: string }; Reply: void | ProblemDetails }>(
    "/:id",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Revoke a personal access token",
        tags: ["Access tokens"],
        params: idParams,
      },
    },
    async (request, reply) => {
      if (!(await accessTokenService.revoke(subOf(request), request.params.id))) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Token not found"));
      }
      return reply.code(204).send();
    }
  );
};
