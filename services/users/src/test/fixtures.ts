/**
 * Shared users-service test fixtures.
 *
 * Factories return frozen objects to prevent accidental mutation across tests.
 */

import type { User, UserPreferences } from "@mbe/types";

interface MockJWTPayload {
  readonly sub: string;
  readonly iss: string;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly email: string;
  readonly email_verified: boolean;
  readonly name: string;
  readonly picture: string;
  readonly permissions: readonly string[];
}

interface MockPaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

function createMockJWTPayload(overrides?: Partial<MockJWTPayload>): MockJWTPayload {
  return Object.freeze({
    sub: "auth0|user-123",
    iss: "https://test.auth0.com/",
    aud: "https://api.example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: "test@example.com",
    email_verified: true,
    name: "Test User",
    picture: "https://example.com/pic.jpg",
    // Least privilege: tests that need admin must ask for it explicitly.
    permissions: [],
    ...overrides,
  });
}

const BASE_USER_PREFERENCES: UserPreferences = Object.freeze({
  theme: "light" as const,
  emailNotifications: true,
  marketingEmails: false,
});

const BASE_USER: User = Object.freeze({
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  preferences: BASE_USER_PREFERENCES,
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
} satisfies User);

export function makeUser(overrides: Partial<User> = {}): User {
  return Object.freeze({
    ...BASE_USER,
    ...overrides,
    preferences: Object.freeze({
      ...BASE_USER_PREFERENCES,
      ...(overrides.preferences ?? {}),
    }),
  });
}

export function makePaginatedResponse<T>(
  data: T[],
  opts: { page?: number; limit?: number; total?: number } = {}
): MockPaginatedResponse<T> {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 10;
  const total = opts.total ?? data.length;
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

// Constant aliases for tests that reference MOCK_JWT_PAYLOAD directly
export const MOCK_JWT_PAYLOAD = createMockJWTPayload();
// Routes guarded by requireAdmin / requireOwnershipOrAdmin need admin asked for explicitly.
export const ADMIN_JWT_PAYLOAD = createMockJWTPayload({ permissions: ["admin"] });
