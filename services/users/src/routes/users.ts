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
        summary: "List all users",
        operationId: "listUsers",
        description:
          "Retrieve a paginated list of all users in the system. Results are ordered by creation date (newest first).",
        tags: ["Users"],
        querystring: {
          type: "object",
          properties: {
            page: {
              type: "string",
              default: "1",
              description: "Page number (1-indexed)",
            },
            limit: {
              type: "string",
              default: "10",
              description: "Number of users per page (max 100)",
            },
          },
        },
        response: {
          200: {
            description: "Successful response with paginated user list",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "User#" },
              },
              pagination: { $ref: "Pagination#" },
            },
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request) => {
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "10", 10) || 10));
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
        summary: "Get user by ID",
        operationId: "getUserById",
        description: "Retrieve a single user by their unique identifier.",
        tags: ["Users"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique user identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "User found",
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          404: {
            description: "User not found",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
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
        summary: "Create a new user",
        operationId: "createUser",
        description:
          "Create a new user account. Email must be unique across the system.",
        tags: ["Users"],
        body: {
          type: "object",
          description: "User creation payload",
          properties: {
            email: {
              type: "string",
              format: "email",
              description: "User's email address (must be unique)",
            },
            name: {
              type: "string",
              description: "User's display name",
            },
            picture: {
              type: "string",
              format: "uri",
              description: "URL to user's profile picture",
            },
          },
          required: ["email"],
        },
        response: {
          201: {
            description: "User created successfully",
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          400: {
            description: "Invalid request body or email already exists",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
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
        summary: "Update a user",
        operationId: "updateUser",
        description:
          "Update an existing user's profile information. Only provided fields will be updated.",
        tags: ["Users"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique user identifier",
            },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          description: "Fields to update",
          properties: {
            name: {
              type: "string",
              description: "New display name",
            },
            picture: {
              type: "string",
              format: "uri",
              description: "New profile picture URL",
            },
          },
        },
        response: {
          200: {
            description: "User updated successfully",
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          404: {
            description: "User not found",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
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
        summary: "Delete a user",
        operationId: "deleteUser",
        description:
          "Permanently delete a user account. This action cannot be undone.",
        tags: ["Users"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique user identifier",
            },
          },
          required: ["id"],
        },
        response: {
          204: {
            description: "User deleted successfully",
            type: "null",
          },
          404: {
            description: "User not found",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
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
        summary: "Get current authenticated user",
        operationId: "getCurrentUser",
        description:
          "Retrieve the profile of the currently authenticated user. If the user doesn't exist in the database, they will be automatically created.",
        tags: ["Users"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            description: "Current user profile",
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          401: {
            description: "Authentication required or token invalid",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
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
        summary: "Update current user's preferences",
        operationId: "updateCurrentUserPreferences",
        description:
          "Update preference settings for the currently authenticated user. Only provided fields will be updated.",
        tags: ["Users"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          description: "Preference fields to update",
          properties: {
            theme: {
              type: "string",
              enum: ["light", "dark", "system"],
              description: "UI theme preference",
            },
            emailNotifications: {
              type: "boolean",
              description: "Enable or disable email notifications",
            },
            marketingEmails: {
              type: "boolean",
              description: "Enable or disable marketing emails",
            },
          },
        },
        response: {
          200: {
            description: "Preferences updated successfully",
            type: "object",
            properties: {
              data: { $ref: "User#" },
            },
          },
          401: {
            description: "Authentication required or token invalid",
            $ref: "Error#",
          },
          404: {
            description: "User not found",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
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
