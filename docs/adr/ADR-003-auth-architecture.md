# ADR-003: Auth Architecture (Auth0 OIDC + Permissive Plugin)

**Status:** active
**Date:** 2026-04-06

## Context

The platform serves both public-facing pages (marketing, menu browsing) and authenticated flows (reservations, user profiles). Routes like `/api/reservations/availability` must work for anonymous visitors but return richer data for logged-in users. A strict auth-or-reject model would force endpoint duplication.

## Decision

Use Auth0 as the OIDC identity provider. On the backend, a custom Fastify plugin (`@mbe/auth`) validates JWTs when present but does not reject unauthenticated requests. Routes opt into protection via a `requireAuth` preHandler. The frontend uses `@auth0/auth0-react` with PKCE and stores tokens in memory (no localStorage).

## Consequences

- **Enables:** Single route definitions that serve both anonymous and authenticated users. Auth0 handles MFA, social login, and token rotation.
- **Constrains:** Every protected route must explicitly add the `requireAuth` guard; forgetting it leaves the route open. Code review must check for this.
- **Trade-off:** Permissive-by-default is riskier than strict-by-default, but matches the product's public-first design. The `requireAuth` guard is a one-liner, keeping the friction low.

## Alternatives Considered

- **Keycloak (self-hosted)**: Full control but significant ops burden for a small team.
- **Firebase Auth**: Tightly coupled to GCP ecosystem; harder to use with non-Firebase backends.
- **Strict-by-default plugin**: Would require `allowAnonymous` decorators on public routes, increasing boilerplate for the common case.
