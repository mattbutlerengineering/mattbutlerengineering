# ADR-002: API Error Format (RFC 7807 Problem Details)

**Status:** active
**Date:** 2026-04-06

## Context

With three backend services (reservations, users, agent), each was returning errors in slightly different shapes. Frontend clients needed per-service error parsing logic, and debugging production issues required knowing which service format to expect. We needed a single, standards-based error envelope.

## Decision

All API errors use the `createProblemDetails()` helper from `@mbe/types`, which produces responses conforming to RFC 7807 (Problem Details for HTTP APIs). Every Fastify service registers a shared error handler that catches thrown errors and serializes them into this format with `type`, `title`, `status`, `detail`, and optional `instance` fields.

## Consequences

- **Enables:** Unified client-side error handling via one parser. Agents can programmatically interpret errors without heuristics.
- **Constrains:** All new services must adopt the shared error handler; ad-hoc error shapes are prohibited.
- **Trade-off:** Slightly more boilerplate per service vs. complete consistency across the API surface.

## Alternatives Considered

- **Custom JSON envelope** (`{ success, error, data }`): Simpler but non-standard; no ecosystem tooling support.
- **GraphQL errors**: Would require migrating to GraphQL; overkill when REST serves current needs.
