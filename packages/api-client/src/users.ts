import type {
  ApiResponse,
  PaginatedResponse,
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UpdatePreferencesRequest,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

export class UsersClient {
  constructor(private client: ApiClient) {}

  /**
   * List all users with pagination
   */
  async list(page = 1, limit = 10): Promise<PaginatedResponse<User>> {
    return this.client.get<PaginatedResponse<User>>(
      `/api/v1/users?page=${page}&limit=${limit}`
    );
  }

  /**
   * Get a user by ID
   */
  async get(id: string): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>(`/api/v1/users/${id}`);
    return response.data;
  }

  /**
   * Get the currently authenticated user
   */
  async me(): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>("/api/v1/users/me");
    return response.data;
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserRequest): Promise<User> {
    const response = await this.client.post<ApiResponse<User>>("/api/v1/users", data);
    return response.data;
  }

  /**
   * Update a user
   */
  async update(id: string, data: UpdateUserRequest): Promise<User> {
    const response = await this.client.patch<ApiResponse<User>>(
      `/api/v1/users/${id}`,
      data
    );
    return response.data;
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
    const response = await this.client.patch<ApiResponse<User>>(
      "/api/v1/users/me/preferences",
      preferences
    );
    return response.data;
  }
}
