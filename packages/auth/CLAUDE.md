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

| Hook                    | Returns                                                                                                                                                | Purpose                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `useAuth()`             | `{ isLoading, isAuthenticated, user, accessToken, signIn, signOut, signInSilent, error, activeNavigator, isRefreshing, sessionExpired, refreshError }` | Full auth state and methods                 |
| `useAccessToken()`      | `{ accessToken: string \| null, refreshError: Error \| null }`                                                                                         | Access token + proactive-refresh error      |
| `useRequireAuth()`      | Same as `useAuth()`                                                                                                                                    | Auto-redirects to login if unauthenticated  |
| `useSessionLifecycle()` | `{ expired: boolean }`                                                                                                                                 | Raw token-expiry signal (used by `useAuth`) |

The `user` object is typed as `AuthUser`: `{ id, email?, name?, picture?, emailVerified?, raw: JWTPayload }`. `useAccessToken()` proactively schedules a silent refresh 5 minutes before the token expires and re-arms whenever `expires_at` changes; a failed refresh is surfaced via `refreshError` (typed `AccessTokenState`) so callers can prompt re-login.

#### Lifecycle semantics (measured against react-oidc-context 3.3 / oidc-client-ts 3.5)

- **`isLoading` is true only for the initial user restore, redirect callbacks, and a sign-out in flight.** react-oidc-context also flips its own `isLoading` on for _every_ navigator call (`signinSilent`, `signinRedirect`, …), which would unmount an app that gates on it during a background token refresh. `useAuth()` masks that for sign-in navigators: `isLoading` is `auth.isLoading && (activeNavigator === undefined || <sign-out navigator>)`. Sign-out navigators stay "loading" on purpose — oidc-client-ts removes the user before the end-session redirect, so without the mask the login gate would flash with a live Sign In button.
- **`activeNavigator`** is the navigator currently in flight (`"signinSilent"`, `"signinRedirect"`, …) or `undefined`; **`isRefreshing`** is the `"signinSilent"` case. Use them for in-flight UI (a busy sign-in button, a handshake visual) instead of `isLoading`.
- **Silent failures never reach `error`.** react-oidc-context's wrapped navigators do not reject; they dispatch an error whose `source` is `signinSilent` / `renewSilent` / `signoutSilent` (see `isSilentAuthError`). `useAuth()` routes those to **`refreshError`** and keeps `error` for interactive failures only, so a failed background refresh shows a banner instead of ejecting the user to the error page. `useAccessToken().refreshError` reads the same context-sourced value.
- **`sessionExpired`** is true from the `accessTokenExpired` event (or a restored user whose token is already expired) until a new user loads. react-oidc-context does not re-evaluate `isAuthenticated` on expiry, so gate on this to show a deliberate "session ended" state.

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

### Authorization Guards

Route-level preHandlers that run **after** `requireAuth` (they assume `request.user` is set). All emit RFC 9457 Problem Details on denial.

#### requireOwnershipOrAdmin(resolveOwnerId, resolveCurrentId?, options?)

PreHandler factory admitting the resource **owner** OR any **admin**. Attaches `request.authorization = { isAdmin, isOwner }` so the handler can branch without re-deriving the decision.

- `resolveOwnerId(request)` → the owner's id, or `null` when the resource is absent.
- `resolveCurrentId(request)` → the caller's id in the same identity space. Defaults to `request.user.id` (JWT sub); override when the service keys ownership differently (e.g. a DB cuid or guest email).
- `options.denial` — how a denial is reported:
  - `"forbid"` (default) — `403` for a non-owner or null owner, `401` when the current identity is unresolvable. The resource is known to exist; the caller merely lacks access. **Every existing call site keeps this behavior.**
  - `"hide"` — `404` for **every** denial (non-owner, null owner, unresolvable identity). Existence-hiding: a deny is byte-for-byte indistinguishable from a genuine not-found, so unauthorized callers learn nothing about the resource. Used by the agent service's session routes, where confirming a session id exists is itself a leak.

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

#### requireAdmin

PreHandler admitting only platform admins (`hasPermission(user, "admin")`, read statelessly from the JWT); `403` otherwise. Use for admin-only collections instead of an inline `hasPermission` check inside the handler.

```typescript
fastify.get("/", { preHandler: [requireAuth, requireAdmin] }, listAllHandler);
```

#### requireVenueAccess(membershipLookup, resolveVenueId)

PreHandler admitting platform admins OR members of the addressed venue (fine-grained membership queried server-side per request, so revocation is instant). See `authz.ts`.

### Test Auth Bypass

The auth bypass (`bypassTestMode`, sourced from `AUTH_BYPASS_IN_TESTS=true`) is **DEFAULT OFF**. Both check sites — the global `onRequest` hook and the `requireAuth` preHandler — use a positive opt-in gate: the bypass activates **only when `NODE_ENV === "test"`**. Production, staging, and an unset `NODE_ENV` all leave it OFF, so a deploy that forgets to set `NODE_ENV` can never mint the hardcoded admin identity (`auth0|user-123`) or skip JWT validation. Never set `AUTH_BYPASS_IN_TESTS` in production.

### Token Verification Flow

1. Global `onRequest` hook extracts Bearer token from Authorization header
2. Verifies JWT against JWKS endpoint (`{authority}/.well-known/jwks.json`) using `jose`
3. Validates `iss` (must match authority) and `aud` (must match audience)
4. Populates `request.user: AuthUser` on success
5. Returns RFC 9457 Problem Details on failure via `createProblemDetails`

## Environment Variables

| Variable               | Required      | Description                                                                                                                                                           |
| ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_AUTHORITY`       | Yes (backend) | OIDC issuer URL (e.g., `https://your-tenant.auth0.com`)                                                                                                               |
| `AUTH_AUDIENCE`        | Yes (backend) | Expected JWT audience                                                                                                                                                 |
| `AUTH_BYPASS_IN_TESTS` | No            | When `true` **and** `NODE_ENV === "test"`, requests with `x-auth-bypass: true` skip JWT and receive a hardcoded admin identity. Default OFF; never set in production. |

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
