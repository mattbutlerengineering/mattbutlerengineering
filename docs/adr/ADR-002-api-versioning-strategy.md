---
id: ADR-002
title: API Versioning Strategy
status: active
date: 2026-04-06
---

# ADR-002: API Versioning Strategy

## Context

As the platform grows, API contracts will inevitably change. We needed a versioning strategy that lets us evolve endpoints without breaking existing clients, while giving those clients clear, programmatic signals about upcoming changes.

## Decision

We use **path-based versioning** (`/api/v1/...`) combined with **HTTP deprecation headers** (RFC 8594 `Deprecation`, RFC 7231 `Sunset`, and `Link` with `rel="successor-version"`).

### Path Prefixes

Each service owns a versioned path prefix on the shared API origin:

- Users Service: `/api/v1/users/*`
- Reservations Service: `/api/v1/*` (catch-all after more specific prefixes)
- Agent Service: `/v1/*`

### Deprecation Signaling

When a version is superseded, all responses include:

| Header                                         | Purpose                              |
| ---------------------------------------------- | ------------------------------------ |
| `Deprecation: true`                            | Machine-readable flag                |
| `Sunset: <RFC 7231 date>`                      | Date the version becomes unavailable |
| `Link: </api/v2/...>; rel="successor-version"` | URL of the replacement               |

### Sunset Policy

- **6-month window** between deprecation announcement and removal.
- No new features on deprecated versions; critical security patches only.
- Health check responses include `apiVersion`, `successorVersion`, and `sunsetDate` so monitoring tools can alert proactively.

### Version Lifecycle

1. **Current** -- actively maintained, receives features and fixes.
2. **Deprecated** -- still available but marked with headers; clients should migrate.
3. **Sunset** -- removed; requests return 410 Gone.

## Consequences

**Benefits:**

- Path prefixes make routing and log filtering straightforward (DigitalOcean ingress rules, Cloudflare edge router, and observability all key on path).
- Deprecation headers are opt-in to consume -- clients that ignore them keep working until sunset.
- Health endpoints expose version metadata, enabling automated migration reminders.

**Trade-offs:**

- Path-based versioning duplicates route registrations when two versions coexist.
- The 6-month window is generous; shorter windows would reduce maintenance burden but increase client churn risk.

## Alternatives Considered

### Query-parameter versioning (`?version=1`)

Rejected because query params are stripped by some CDN configurations and are invisible in access logs without custom parsing.

### Header-only versioning (`Accept: application/vnd.mbe.v1+json`)

Rejected because it complicates debugging (you cannot tell the version from a URL alone), is harder to route at the infrastructure level, and is less discoverable for new API consumers.

### No versioning (single evolving contract)

Rejected because even with additive-only changes, removing or renaming a field is a breaking change, and we cannot coordinate all clients for simultaneous updates.
