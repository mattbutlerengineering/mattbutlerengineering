import type { FastifyPluginAsync } from "fastify";
import {
  type User,
  type CreateUserRequest,
  type UpdateUserRequest,
  type UpdatePreferencesRequest,
  type ApiResponse,
  type ApiError,
  type PaginatedResponse,
  createProblemDetails,
} from "@mbe/types";
import { requireAuth, type AuthUser } from "@mbe/auth/fastify";
import { userService } from "../services/user.js";

function isAdmin(user: AuthUser | undefined): boolean {
  const permissions = user?.raw?.permissions; return Array.isArray(permissions) && permissions.includes("admin");
}

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // List users
  fastify.get<{
    Querystring: { page?: string; limit?: string };
    Reply: PaginatedResponse<User>;
  }>(
    "/",
    {
      preHandler: requireAuth,
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
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        reply.code(403); return reply.send(createProblemDetails(403, "Forbidden", "Admin access required to list all users") as never);
      }
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
      preHandler: requireAuth,
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
      const authUser = request.user;
      const requestedId = request.params.id;

      if (!isAdmin(authUser)) {
        if (!authUser?.email) {
          return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Authentication required"));
        }
        const requestingUser = await userService.getByEmail(authUser.email);
        if (!requestingUser || requestingUser.id !== requestedId) {
          return reply.code(403).send(createProblemDetails(403, "Forbidden", "You can only access your own profile"));
        }
      }

      const user = await userService.getById(request.params.id);
      if (!user) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "User not found"));
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
      preHandler: requireAuth,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
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
      preHandler: requireAuth,
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
      const authUser = request.user;
      const requestedId = request.params.id;

      if (!isAdmin(authUser)) {
        if (!authUser?.email) {
          return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Authentication required"));
        }
        const requestingUser = await userService.getByEmail(authUser.email);
        if (!requestingUser || requestingUser.id !== requestedId) {
          return reply.code(403).send(createProblemDetails(403, "Forbidden", "You can only update your own profile"));
        }
      }

      const user = await userService.update(request.params.id, request.body);
      if (!user) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "User not found"));
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
      preHandler: requireAuth,
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
      const authUser = request.user;
      const requestedId = request.params.id;

      if (!isAdmin(authUser)) {
        if (!authUser?.email) {
          return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Authentication required"));
        }
        const requestingUser = await userService.getByEmail(authUser.email);
        if (!requestingUser || requestingUser.id !== requestedId) {
          return reply.code(403).send(createProblemDetails(403, "Forbidden", "You can only delete your own profile"));
        }
      }

      const deleted = await userService.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "User not found"));
      }
      return reply.code(204).send();
    }
  );

  // Get current user (from JWT)
  fastify.get<{
    Reply: ApiResponse<User> | ApiError;
  }>(
    "/me",
    {
      preHandler: requireAuth,
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
        return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Authentication required"));
      }

      // Use findOrCreate (upsert) to prevent race conditions when two
      // concurrent first-login requests both try to create the same user
      const user = await userService.findOrCreate({
        email: authUser.email,
        name: authUser.name,
        picture: authUser.picture,
      });
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
      preHandler: requireAuth,
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
        return reply.code(401).send(createProblemDetails(401, "Unauthorized", "Authentication required"));
      }

      const existingUser = await userService.getByEmail(authUser.email);
      if (!existingUser) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "User not found"));
      }

      const user = await userService.updatePreferences(
        existingUser.id,
        request.body
      );
      if (!user) {
        return reply.code(500).send(createProblemDetails(500, "Internal Server Error", "Failed to update preferences"));
      }
      return { data: user };
    }
  );
};
