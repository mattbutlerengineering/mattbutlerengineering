# @mbe/auth

Shared authentication package for React (frontend) and Fastify (backend). Uses standard OIDC/JWKS — not Auth0-specific SDKs — for provider portability.

## Structure

```
src/
├── types/index.ts        # OIDCConfig, JWTPayload, AuthUser
├── react/
│   ├── provider.tsx      # AuthProvider (wraps react-oidc-context)
│   └── hooks.ts          # useAuth, useAccessToken, useRequireAuth
└── fastify/
    ├── plugin.ts         # authPlugin, requireAuth, optionalAuth
    ├── plugin.test.ts    # Test patterns with mocked jose
    └── ownership.ts      # requireOwnershipOrAdmin — route-level owner-or-admin authorization guard
```

## React API

### AuthProvider

Wraps the app with OIDC context. Cleans callback params from URL after sign-in.

```tsx
<AuthProvider
  config={{
    authority: "https://your-tenant.auth0.com",
    clientId: "abc123",
    redirectUri: window.location.origin,
    audience: "https://api.example.com",
    scope: "openid profile email", // default
  }}
  onSigninCallback={() => navigate("/")}
>
  {children}
</AuthProvider>
```

### Hooks

| Hook               | Returns                                                                                   | Purpose                                    |
| ------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| `useAuth()`        | `{ isLoading, isAuthenticated, user, accessToken, signIn, signOut, signInSilent, error }` | Full auth state and methods                |
| `useAccessToken()` | `string \| null`                                                                          | Just the access token (for API calls)      |
| `useRequireAuth()` | Same as `useAuth()`                                                                       | Auto-redirects to login if unauthenticated |

The `user` object is typed as `AuthUser`: `{ id, email?, name?, picture?, emailVerified?, raw: JWTPayload }`.

## Fastify API

### Plugin Registration

The `authPlugin` is **permissive by default**: it populates `request.user` for valid tokens, rejects invalid tokens with 401, and passes through requests with no token. Use `requireAuth` or `optionalAuth` preHandlers to control per-route behavior.

```typescript
import { authPlugin, requireAuth, optionalAuth } from "@mbe/auth";

await fastify.register(authPlugin, {
  authority: "https://your-tenant.auth0.com",
  audience: "https://api.example.com",
  excludePaths: ["/health", "/docs"],
});

// Requires valid token — 401 if missing
fastify.get("/me", { preHandler: requireAuth }, handler);

// Documents that auth is optional — request.user may be undefined
fastify.get("/public", { preHandler: optionalAuth }, handler);
```

### getAuthPluginOptionsFromEnv()

Reads `AUTH_AUTHORITY` and `AUTH_AUDIENCE` from env, throws if missing. Excludes `/health` and `/docs` by default.

### Test Auth Bypass

The auth bypass (`bypassTestMode`, sourced from `AUTH_BYPASS_IN_TESTS=true`) is **DEFAULT OFF**. Both check sites — the global `onRequest` hook and the `requireAuth` preHandler — use a positive opt-in gate: the bypass activates **only when `NODE_ENV === "test"`**. Production, staging, and an unset `NODE_ENV` all leave it OFF, so a deploy that forgets to set `NODE_ENV` can never mint the hardcoded admin identity (`auth0|user-123`) or skip JWT validation. Never set `AUTH_BYPASS_IN_TESTS` in production.

### Token Verification Flow

1. Global `onRequest` hook extracts Bearer token from Authorization header
2. Verifies JWT against JWKS endpoint (`{authority}/.well-known/jwks.json`) using `jose`
3. Validates `iss` (must match authority) and `aud` (must match audience)
4. Populates `request.user: AuthUser` on success
5. Returns RFC 9457 Problem Details on failure via `createProblemDetails`

## Environment Variables

| Variable         | Required      | Description                                             |
| ---------------- | ------------- | ------------------------------------------------------- |
| `AUTH_AUTHORITY` | Yes (backend) | OIDC issuer URL (e.g., `https://your-tenant.auth0.com`) |
| `AUTH_AUDIENCE`  | Yes (backend) | Expected JWT audience                                   |
| `AUTH_BYPASS_IN_TESTS` | No | When `true` **and** `NODE_ENV === "test"`, requests with `x-auth-bypass: true` skip JWT and receive a hardcoded admin identity. Default OFF; never set in production. |

Frontend config is passed via `AuthProvider` props (typically from build-time env vars).

## Testing Patterns

### Mocking JWT Verification (Fastify)

```typescript
const mockJwtVerify = vi.hoisted(() => vi.fn());
const mockCreateRemoteJWKSet = vi.hoisted(() => vi.fn(() => "mock-jwks"));

vi.mock("jose", () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

// In test: resolve with valid payload
mockJwtVerify.mockResolvedValueOnce({
  payload: {
    sub: "auth0|user-123",
    iss: "https://test.auth0.com/",
    aud: "https://api.example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: "test@example.com",
  },
  protectedHeader: { alg: "RS256" },
});

// Or reject for auth failure tests
mockJwtVerify.mockRejectedValueOnce(new Error("Invalid token"));
```

### Testing Protected Routes

Register `authPlugin` + routes in a scoped plugin, then use `app.inject()`:

```typescript
const response = await app.inject({
  method: "GET",
  url: "/protected",
  headers: { authorization: "Bearer valid-token" },
});
```

### Testing React Hooks

Mock `react-oidc-context` and provide a fake user object matching the `AuthUser` shape.

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run tests
pnpm lint         # ESLint
pnpm typecheck    # Type check
```
