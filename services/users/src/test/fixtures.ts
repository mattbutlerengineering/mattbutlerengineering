/**
 * Immutable test fixtures for the users service.
 *
 * All fixtures are frozen to prevent accidental mutation across tests.
 * Use the factory functions for cases where you need to customize fields.
 */

export interface UserFixture {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly picture: string | null;
  readonly emailVerified: boolean;
  readonly preferences: {
    readonly theme: "light" | "dark" | "system";
    readonly emailNotifications: boolean;
    readonly marketingEmails: boolean;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const MOCK_USER: UserFixture = Object.freeze({
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  preferences: Object.freeze({
    theme: "light" as const,
    emailNotifications: true,
    marketingEmails: false,
  }),
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
});

export const MOCK_JWT_PAYLOAD = Object.freeze({
  sub: "auth0|user-123",
  email: "test@example.com",
  email_verified: true,
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  permissions: ["admin"],
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

/**
 * Create a user fixture with custom overrides.
 * Returns a new frozen object — never mutates the base fixture.
 */
export function makeUser(overrides: Partial<UserFixture> = {}): UserFixture {
  return Object.freeze({
    ...MOCK_USER,
    ...overrides,
    preferences: Object.freeze({
      ...MOCK_USER.preferences,
      ...(overrides.preferences ?? {}),
    }),
  });
}

/**
 * Create a paginated response wrapper.
 */
export function makePaginatedResponse<T>(
  data: T[],
  { page = 1, limit = 10, total }: { page?: number; limit?: number; total?: number } = {}
) {
  const actualTotal = total ?? data.length;
  const totalPages = Math.ceil(actualTotal / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total: actualTotal,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
