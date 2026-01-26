import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the user service
vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
    getByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the database (needed for health check registration)
vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { userService } from "../services/user.js";

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

describe("User Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("GET /api/v1/users", () => {
    it("returns paginated list of users", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce({
        data: [mockUser],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].email).toBe("test@example.com");
      expect(body.pagination.total).toBe(1);
    });

    it("respects page and limit query params", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce({
        data: [],
        pagination: {
          page: 2,
          limit: 5,
          total: 10,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        },
      });

      await app.inject({
        method: "GET",
        url: "/api/v1/users?page=2&limit=5",
      });

      expect(userService.list).toHaveBeenCalledWith(2, 5);
    });
  });

  describe("GET /api/v1/users/:id", () => {
    it("returns user by ID", async () => {
      vi.mocked(userService.getById).mockResolvedValueOnce(mockUser);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/user-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("user-123");
      expect(body.data.email).toBe("test@example.com");
    });

    it("returns 404 when user not found", async () => {
      vi.mocked(userService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/nonexistent",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("POST /api/v1/users", () => {
    it("creates a new user", async () => {
      vi.mocked(userService.create).mockResolvedValueOnce(mockUser);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        payload: {
          email: "test@example.com",
          name: "Test User",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.email).toBe("test@example.com");
    });

    it("creates user with email only", async () => {
      const userWithoutName = { ...mockUser, name: null };
      vi.mocked(userService.create).mockResolvedValueOnce(userWithoutName);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        payload: {
          email: "minimal@example.com",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(userService.create).toHaveBeenCalledWith({
        email: "minimal@example.com",
      });
    });
  });

  describe("PATCH /api/v1/users/:id", () => {
    it("updates user", async () => {
      const updatedUser = { ...mockUser, name: "Updated Name" };
      vi.mocked(userService.update).mockResolvedValueOnce(updatedUser);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/user-123",
        payload: {
          name: "Updated Name",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("Updated Name");
    });

    it("returns 404 when updating nonexistent user", async () => {
      vi.mocked(userService.update).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/nonexistent",
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/users/:id", () => {
    it("deletes user and returns 204", async () => {
      vi.mocked(userService.delete).mockResolvedValueOnce(undefined);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/users/user-123",
      });

      expect(response.statusCode).toBe(204);
      expect(userService.delete).toHaveBeenCalledWith("user-123");
    });
  });
});
