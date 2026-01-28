import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UpdatePreferencesRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import type { AuthUser, JWTPayload } from "@mbe/auth/types";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { userService } from "../services/user.js";

// Augment FastifyRequest to include user from auth
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // JWT verification for protected routes
  const authority = process.env.AUTH_AUTHORITY;
  const audience = process.env.AUTH_AUDIENCE;

  let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
  if (authority && audience) {
    const jwksUri = `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
    JWKS = createRemoteJWKSet(new URL(jwksUri));
  }

  const verifyAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!JWKS || !authority || !audience) {
      return reply.code(500).send({ error: "Auth not configured" });
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Missing or invalid authorization header",
        statusCode: 401,
      });
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: authority.replace(/\/$/, "") + "/",
        audience,
      });

      const jwtPayload = payload as unknown as JWTPayload;
      request.user = {
        id: jwtPayload.sub,
        email: jwtPayload.email,
        name: jwtPayload.name,
        picture: jwtPayload.picture,
        emailVerified: jwtPayload.email_verified,
        raw: jwtPayload,
      };
    } catch (error) {
      fastify.log.warn({ error }, "JWT validation failed");
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid token",
        statusCode: 401,
      });
    }
  };

  // List users
  fastify.get<{
    Querystring: { page?: string; limit?: string };
    Reply: PaginatedResponse<User>;
  }>(
    "/",
    {
      schema: {
        description: "List all users with pagination",
        tags: ["Users"],
        querystring: {
          type: "object",
          properties: {
            page: { type: "string", default: "1" },
            limit: { type: "string", default: "10" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "User#" },
              },
              pagination: { $ref: "Pagination#" },
            },
          },
        },
      },
    },
    async (request) => {
      const page = parseInt(request.query.page ?? "1", 10);
      const limit = parseInt(request.query.limit ?? "10", 10);
      return userService.list(page, limit);
    }
  );

  // Get user by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<User> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        description: "Get a user by ID",
        tags: ["Users"],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
              statusCode: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await userService.getById(request.params.id);
      if (!user) {
        return reply.code(404).send({
          error: "Not Found",
          message: "User not found",
          statusCode: 404,
        });
      }
      return { data: user };
    }
  );

  // Create user
  fastify.post<{
    Body: CreateUserRequest;
    Reply: ApiResponse<User>;
  }>(
    "/",
    {
      schema: {
        description: "Create a new user",
        tags: ["Users"],
        body: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            name: { type: "string" },
            picture: { type: "string", format: "uri" },
          },
          required: ["email"],
        },
        response: {
          201: {
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await userService.create(request.body);
      return reply.code(201).send({ data: user });
    }
  );

  // Update user
  fastify.patch<{
    Params: { id: string };
    Body: UpdateUserRequest;
    Reply: ApiResponse<User> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        description: "Update a user",
        tags: ["Users"],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            picture: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await userService.update(request.params.id, request.body);
      if (!user) {
        return reply.code(404).send({
          error: "Not Found",
          message: "User not found",
          statusCode: 404,
        });
      }
      return { data: user };
    }
  );

  // Delete user
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      schema: {
        description: "Delete a user",
        tags: ["Users"],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
        response: {
          204: {
            type: "null",
          },
        },
      },
    },
    async (request, reply) => {
      await userService.delete(request.params.id);
      return reply.code(204).send();
    }
  );

  // Get current user (from JWT)
  fastify.get<{
    Reply: ApiResponse<User> | ApiError;
  }>(
    "/me",
    {
      preHandler: verifyAuth,
      schema: {
        description: "Get the currently authenticated user",
        tags: ["Users"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          401: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
              statusCode: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const authUser = request.user;
      if (!authUser || !authUser.email) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
          statusCode: 401,
        });
      }

      let user = await userService.getByEmail(authUser.email);
      if (!user) {
        // Auto-create user on first login
        user = await userService.create({
          email: authUser.email,
          name: authUser.name,
          picture: authUser.picture,
        });
      }
      return { data: user };
    }
  );

  // Update current user's preferences
  fastify.patch<{
    Body: UpdatePreferencesRequest;
    Reply: ApiResponse<User> | ApiError;
  }>(
    "/me/preferences",
    {
      preHandler: verifyAuth,
      schema: {
        description: "Update the current user's preferences",
        tags: ["Users"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            theme: { type: "string", enum: ["light", "dark", "system"] },
            emailNotifications: { type: "boolean" },
            marketingEmails: { type: "boolean" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          401: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
              statusCode: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const authUser = request.user;
      if (!authUser || !authUser.email) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
          statusCode: 401,
        });
      }

      const existingUser = await userService.getByEmail(authUser.email);
      if (!existingUser) {
        return reply.code(404).send({
          error: "Not Found",
          message: "User not found",
          statusCode: 404,
        });
      }

      const user = await userService.updatePreferences(
        existingUser.id,
        request.body
      );
      if (!user) {
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to update preferences",
          statusCode: 500,
        });
      }
      return { data: user };
    }
  );
};
