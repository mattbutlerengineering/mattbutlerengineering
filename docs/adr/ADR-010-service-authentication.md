---
id: ADR-010
title: Service Authentication
status: active
date: 2026-04-06
---

# ADR-010: Service Authentication

## Context

The platform serves authenticated users (restaurant operators) across multiple frontend apps and backend services. We needed an authentication strategy that is secure, standards-based, and avoids vendor lock-in to a single identity provider.

## Decision

We use **Auth0 as the OIDC identity provider**, but all client and server code interacts through **standard OIDC/JWKS protocols** rather than Auth0-specific SDKs. This is implemented in the shared `@mbe/auth` package.

### Frontend: OIDC Authorization Code Flow (PKCE)

React apps wrap their component tree with `AuthProvider`, which delegates to `react-oidc-context` (a generic OIDC library):

- Authority, client ID, audience, and redirect URI are passed as props (sourced from build-time env vars).
- PKCE is used for the authorization code exchange (no client secret in the browser).
- After sign-in, callback params are stripped from the URL via `history.replaceState`.
- `useAuth()` exposes `isAuthenticated`, `user`, `accessToken`, `signIn`, `signOut`, and `signInSilent`.
- `useAccessToken()` provides just the token for API calls.
- `useRequireAuth()` auto-redirects unauthenticated users to the login page.

### Backend: JWT Verification via JWKS

The `authPlugin` Fastify plugin verifies JWTs on every request:

1. Fetches the signing keys from `{authority}/.well-known/jwks.json` using the `jose` library (not an Auth0 SDK).
2. Verifies `iss` (must match the configured authority) and `aud` (must match the configured audience).
3. Populates `request.user: AuthUser` with `id`, `email`, `name`, `picture`, and raw claims.
4. Returns RFC 7807 Problem Details on failure (see ADR-003).

**Permissive by default:** The global `onRequest` hook rejects invalid tokens but passes through requests with no token. Route-level preHandlers control access:

- `requireAuth` -- returns 401 if `request.user` is not set.
- `optionalAuth` -- documents that auth is optional; request.user may be undefined.

Health and docs paths are excluded from token verification entirely.

### Environment Configuration

| Variable              | Context  | Purpose                     |
| --------------------- | -------- | --------------------------- |
| `AUTH_AUTHORITY`      | Backend  | OIDC issuer URL             |
| `AUTH_AUDIENCE`       | Backend  | Expected JWT audience       |
| `VITE_AUTH_AUTHORITY` | Frontend | Same, via build-time env    |
| `VITE_AUTH_CLIENT_ID` | Frontend | Auth0 application client ID |

Auth0 resources (applications, API) are managed via Pulumi using `@pulumi/auth0`, keeping infrastructure as code.

## Consequences

**Benefits:**

- **Provider portability**: Because all code uses standard OIDC/JWKS (not `@auth0/auth0-spa-js` or `@auth0/nextjs-auth0`), switching to another OIDC provider (Clerk, Keycloak, AWS Cognito) requires only changing environment variables and Pulumi configuration.
- **Shared package**: A single `@mbe/auth` package serves both React and Fastify, eliminating duplicated auth logic across services.
- **Secure defaults**: Health and docs are excluded; everything else requires a valid token structure, with route-level control for enforcement.

**Trade-offs:**

- Auth0-specific features (Actions, Organizations, MFA enrollment API) require direct Auth0 API calls outside the standard OIDC flow.
- The permissive hook pattern means forgetting to add `requireAuth` to a sensitive route leaves it open to anonymous access -- mitigated by code review and the `security-reviewer` agent.
- Token refresh relies on `signInSilent()` (silent renew via hidden iframe or refresh token), which can fail if third-party cookies are blocked -- acceptable because our apps and Auth0 are on different domains and we use refresh tokens as fallback.

## Alternatives Considered

### Auth0-specific SDKs (`@auth0/auth0-react`, `@auth0/nextjs-auth0`)

Rejected because they create hard vendor lock-in. The Auth0 React SDK wraps the same OIDC flows but exposes Auth0-specific APIs that would need to be replaced if we switch providers.

### Self-hosted identity (Keycloak, Ory)

Rejected for now because the operational burden of running and securing an identity service outweighs the cost savings at our current scale. The standard-OIDC approach makes future migration straightforward.

### API gateway token validation (no per-service verification)

Rejected because our edge router (Cloudflare Worker) proxies to DigitalOcean via HTTP, meaning the API origin is technically reachable without the edge. Per-service verification provides defense in depth.
