/**
 * User domain fixture factories.
 *
 * Follows the create* convention. All factories return frozen objects to
 * prevent accidental mutation across tests.
 */

export interface MockUserPreferences {
  readonly theme: "light" | "dark" | "system";
  readonly emailNotifications: boolean;
  readonly marketingEmails: boolean;
}

export interface MockUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly picture: string | null;
  readonly emailVerified: boolean;
  readonly preferences: MockUserPreferences;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const BASE_USER_PREFERENCES: MockUserPreferences = Object.freeze({
  theme: "light" as const,
  emailNotifications: true,
  marketingEmails: false,
});

const BASE_USER: MockUser = Object.freeze({
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  preferences: BASE_USER_PREFERENCES,
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
});

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return Object.freeze({
    ...BASE_USER,
    ...overrides,
    preferences: Object.freeze({
      ...BASE_USER_PREFERENCES,
      ...(overrides.preferences ?? {}),
    }),
  });
}

export interface MockPaginatedResponse<T> {
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

export function createMockPaginatedResponse<T>(
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
