# @mbe/auth reference

File map, API tables, usage examples and the token verification walkthrough, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time an auth file is read. The rules (gate order, lifecycle semantics, guard denial modes, test-bypass gating) stay in CLAUDE.md. The source of truth is `src/`.

## Structure

```
src/
├── types/index.ts        # OIDCConfig, JWTPayload, AuthUser
├── react/
│   ├── provider.tsx      # AuthProvider (wraps react-oidc-context)
│   ├── hooks.ts          # useAuth, useAccessToken, useRequireAuth
│   ├── auth-gate.ts      # useAuthGate / resolveAuthGate — the one screen-gate order
│   └── signin-return-to.ts # signinReturnTo — validated post-sign-in destination
└── fastify/
    ├── plugin.ts          # authPlugin, requireAuth, optionalAuth, hasPermission
    ├── plugin.test.ts     # Test patterns with mocked jose
    ├── ownership.ts       # requireOwnershipOrAdmin — owner-or-admin guard (with { denial } knob)
    └── authz.ts           # requireAdmin, requireVenueAccess — role / venue-membership guards
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

| Hook                       | Returns                                                                                                                                                | Purpose                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `useAuth()`                | `{ isLoading, isAuthenticated, user, accessToken, signIn, signOut, signInSilent, error, activeNavigator, isRefreshing, sessionExpired, refreshError }` | Full auth state and methods                                                                                                           |
| `useAccessToken()`         | `{ accessToken: string \| null, refreshError: Error \| null }`                                                                                         | Access token + proactive-refresh error                                                                                                |
| `useRequireAuth()`         | Same as `useAuth()`                                                                                                                                    | Auto-redirects to login if unauthenticated                                                                                            |
| `useSessionLifecycle()`    | `{ expired: boolean }`                                                                                                                                 | Raw token-expiry signal (used by `useAuth`)                                                                                           |
| `hasAuthParams(location?)` | `boolean`                                                                                                                                              | react-oidc-context's own callback predicate, re-exported so an app's gate and the provider agree on whether a callback is in progress |

## Fastify API

### Plugin Registration

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

### requireOwnershipOrAdmin example

```typescript
// Existence-hiding: non-owner / non-admin / webhook-origin (userId=null) all get 404.
const requireSessionAccess = [
  loadSession, // stashes request.agentSession for a single DB read
  requireOwnershipOrAdmin(
    (req) => Promise.resolve(req.agentSession?.userId ?? null),
    undefined, // default resolveCurrentId = request.user.id
    { denial: "hide" }
  ),
];
fastify.get("/:id", { preHandler: [requireAuth, ...requireSessionAccess] }, handler);
```

### requireAdmin example

```typescript
fastify.get("/", { preHandler: [requireAuth, requireAdmin] }, listAllHandler);
```

### Token Verification Flow

1. Global `onRequest` hook extracts Bearer token from Authorization header
2. Verifies JWT against JWKS endpoint (`{authority}/.well-known/jwks.json`) using `jose`
3. Validates `iss` (must match authority) and `aud` (must match audience)
4. Populates `request.user: AuthUser` on success
5. Returns RFC 9457 Problem Details on failure via `createProblemDetails`

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
