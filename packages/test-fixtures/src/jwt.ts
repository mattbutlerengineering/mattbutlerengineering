/**
 * JWT payload fixture factory.
 *
 * Defined once here; all services import from this shared source.
 * Returns a frozen object to prevent accidental mutation across tests.
 */

export interface MockJWTPayload {
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

export function createMockJWTPayload(overrides?: Partial<MockJWTPayload>): MockJWTPayload {
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
    permissions: ["admin"],
    ...overrides,
  });
}
