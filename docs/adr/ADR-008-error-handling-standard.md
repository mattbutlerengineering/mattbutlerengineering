---
id: ADR-008
title: Error Handling Standard
status: active
date: 2026-04-06
---

# ADR-008: Error Handling Standard

## Context

Early services used ad-hoc error shapes (`{ error, message, statusCode }`). Different services returned slightly different structures, making it difficult for frontend code and external consumers to handle errors uniformly. We needed a single, standards-based error format.

## Decision

All API errors **must** conform to **RFC 7807 Problem Details for HTTP APIs** (`application/problem+json`). The transitional dual-format envelope was retired once every consumer migrated (#3348); responses now carry RFC 7807 fields only.

### Canonical Shape

```typescript
interface ProblemDetails {
  type: string; // URI identifying the error type (default: "about:blank")
  title: string; // Short human-readable summary
  status: number; // HTTP status code
  detail: string; // Human-readable explanation specific to this occurrence
  instance?: string; // URI identifying this specific occurrence
}
```

### Sole Shape (migration complete)

The shared `createProblemDetails()` helper in `@mbe/types` returns RFC 7807 fields only. The transitional legacy envelope (`error` / `message` / `statusCode`) was removed once every consumer migrated (#3348); `ProblemDetails` is now the single wire **and** in-memory error shape:

```typescript
{
  type: "about:blank",
  title: "Not Found",
  status: 404,
  detail: "User with id '123' not found",
}
```

### Extension Members

Domain-specific context is passed via extension members (RFC 7807 Section 3.2), not a generic `details` bag:

```json
{
  "type": "/errors/table-not-available",
  "title": "Table Not Available",
  "status": 409,
  "detail": "Table 5 is already booked for 19:00",
  "tableId": "table-5",
  "conflictingReservationId": "res-123"
}
```

### Auth Errors

The `@mbe/auth` Fastify plugin uses `createProblemDetails()` for all 401 responses, ensuring even authentication failures follow the standard format.

## Consequences

**Benefits:**

- Single error shape across all services -- frontend error handling is a single code path.
- RFC 7807 is a widely adopted standard; third-party consumers and tooling understand it out of the box.
- The `type` URI enables machine-readable error classification without parsing human-readable strings.

**Trade-offs:**

- Dual-format responses during migration add ~100 bytes per error payload.
- Services must import and use `createProblemDetails()` from `@mbe/types` rather than throwing raw objects -- enforced by ESLint custom rules.

## Alternatives Considered

### Custom envelope (`{ success: false, error: { code, message } }`)

Rejected because it is non-standard, requiring every consumer to learn our bespoke format. RFC 7807 is already supported by HTTP client libraries and API gateways.

### GraphQL-style errors (`{ errors: [{ message, extensions }] }`)

Rejected because our services use REST, and importing a GraphQL error convention into REST responses would confuse consumers familiar with either standard.

### No standard (let each service decide)

Rejected because inconsistent error shapes were the problem we set out to solve.
