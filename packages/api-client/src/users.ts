import type {
  PaginatedResponse,
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UpdatePreferencesRequest,
} from "@mbe/types";
import { UserSchema, paginatedResponseSchema } from "@mbe/types";
import type { z } from "zod";
import type { ApiClient } from "./client.js";

const userListSchema: z.ZodSchema<PaginatedResponse<User>> = paginatedResponseSchema(UserSchema);

export class UsersClient {
  constructor(private client: ApiClient) {}

  /**
   * List all users with pagination
   */
  async list(page = 1, limit = 10): Promise<PaginatedResponse<User>> {
    return this.client.get<PaginatedResponse<User>>(
      `/api/v1/users?page=${page}&limit=${limit}`,
      undefined,
      userListSchema
    );
  }

  /**
   * Get a user by ID
   */
  async get(id: string): Promise<User> {
    return this.client.getOne<User>(`/api/v1/users/${id}`, undefined, UserSchema);
  }

  /**
   * Get the currently authenticated user
   */
  async me(): Promise<User> {
    return this.client.getOne<User>("/api/v1/users/me", undefined, UserSchema);
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserRequest): Promise<User> {
    return this.client.postOne<User>("/api/v1/users", data, UserSchema);
  }

  /**
   * Update a user
   */
  async update(id: string, data: UpdateUserRequest): Promise<User> {
    return this.client.patchOne<User>(`/api/v1/users/${id}`, data, UserSchema);
  }

  /**
   * Delete a user
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/users/${id}`);
  }

  /**
   * Update current user's preferences
   */
  async updatePreferences(preferences: UpdatePreferencesRequest): Promise<User> {
    return this.client.patchOne<User>("/api/v1/users/me/preferences", preferences, UserSchema);
  }
}
