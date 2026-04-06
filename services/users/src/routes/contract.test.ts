import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { UserSchema } from "@mbe/types";

// Mock the user service
vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
  },
}));

// Mock the database
vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// Mock jose library
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { userService } from "../services/user.js";
import { jwtVerify } from "jose";
import { buildApp } from "../app.js";

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  preferences: {
    theme: "light" as const,
    emailNotifications: true,
    marketingEmails: false,
  },
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

describe("User Service API Contract", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH0_DOMAIN: "test.auth0.com",
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { 
        sub: "auth0|user-123",
        email: "test@example.com",
        email_verified: true,
        name: "Test User",
        picture: "https://example.com/pic.jpg",
        permissions: ["admin"],
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("GET /api/v1/users/:id matches UserSchema", async () => {
    vi.mocked(userService.getById).mockResolvedValueOnce(mockUser);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/user-123",
      headers: { authorization: "Bearer valid-token" },
    });

    if (response.statusCode !== 200) {
      console.error("Response Body:", response.body);
    }
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    
    // Validate against Zod schema from @mbe/types
    const result = UserSchema.safeParse(body.data);
    if (!result.success) {
      console.error("Zod Validation Error:", result.error.format());
    }
    expect(result.success).toBe(true);
  });
});
