---
id: ADR-004
title: Edge Routing
status: superseded
superseded_by: ADR-011
date: 2026-04-06
---

# ADR-004: Edge Routing (Cloudflare Workers + Service Bindings)

> **Superseded by [ADR-011](ADR-011-edge-routing-architecture.md)**, which documents the full edge routing architecture (topology registry, security headers, rate limiting, circuit breaker) built on the same Cloudflare Worker + Service Bindings decision made here.

## Context

After deploying SPA updates, users received stale `index.html` from CDN cache, causing blank pages until the cache expired. The edge layer needed to serve fresh HTML on every navigation request while still caching static assets aggressively.

## Decision

A single Cloudflare Worker (`edge-router`) receives all requests for `mattbutlerengineering.com`. It dispatches to per-app Workers (marketing, hospitality, gen) via Service Bindings. HTML responses are served with `Cache-Control: no-store` to guarantee fresh content after deploys. Static assets (JS, CSS, images) use content-hashed filenames and long-lived cache headers.

## Consequences

- **Enables:** Zero-downtime deploys with no stale HTML. Per-app isolation means one app's Worker crash doesn't affect others. Sub-millisecond dispatch via Service Bindings (no network hop).
- **Constrains:** All frontend apps must be deployed as Workers, not Pages. Routing logic lives in `edge-router` and must be updated when apps are added.
- **Trade-off:** More operational complexity than a managed platform (Vercel/Netlify), but full control over caching and routing behavior.

## Alternatives Considered

- **Cloudflare Pages**: Simpler deploys but limited control over cache headers and routing; no Service Bindings support.
- **Vercel/Netlify**: Managed platforms with opinionated caching; would require workarounds for the stale-HTML problem.
- **Nginx reverse proxy**: Self-managed, no edge presence, higher latency for global users.
