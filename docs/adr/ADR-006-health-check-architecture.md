---
id: ADR-006
title: Health Check Architecture
status: superseded
superseded_by: ADR-009
date: 2026-04-06
---

# ADR-006: Health Check Architecture

> **Superseded by [ADR-009](ADR-009-health-check-patterns.md)**, which documents the same per-service `/health` + public health endpoints as this ADR's Tier 1, and adds the Tier 2 system-wide aggregation endpoint.

## Context

DigitalOcean App Platform requires a health endpoint for liveness probes, but we also need user-visible health status for debugging and transparency. A single endpoint cannot serve both: platform probes need fast, simple responses while public health pages benefit from dependency status and latency metrics.

## Decision

Each service exposes two health endpoints:

- **`/health`** (platform probe): Returns 200 with `{ status: "ok" }`. No database queries, no external calls. Used by DO App Platform for restart decisions.
- **`/api/<service>/health`** (public): Returns dependency status (database connectivity, external service reachability) and flags slow queries exceeding a configurable threshold. Used by the status page and agent diagnostics.

Both endpoints are unauthenticated.

## Consequences

- **Enables:** Reliable platform health checks that never false-positive due to a slow downstream dependency. Public endpoint gives agents and developers actionable diagnostics without SSH access.
- **Constrains:** Two endpoints to maintain per service; the public endpoint's dependency checks must be lightweight enough to not become a performance problem themselves.
- **Trade-off:** Slight duplication vs. clear separation of concerns between infrastructure probes and observability.

## Alternatives Considered

- **Single `/health` endpoint with query params**: Mixes concerns; risk of platform probe hitting the slow path.
- **External monitoring only** (e.g., UptimeRobot): No integration with platform auto-restart; adds a paid dependency for basic health visibility.
