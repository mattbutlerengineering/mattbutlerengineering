---
id: ADR-011
title: Edge Routing Architecture
status: active
date: 2026-04-06
---

# ADR-011: Edge Routing Architecture

## Context

The platform serves multiple frontend apps (marketing, hospitality, rialto, gen) and a multi-service API backend from a single domain (`mattbutlerengineering.com`). We needed a routing layer that unifies these under one origin, handles security headers, and avoids stale content after deploys.

## Decision

A single **Cloudflare Worker** (`edge-router`) acts as the front door for all traffic. It routes requests by path prefix, using **Service Bindings** for static sites and **HTTP subrequests** for the API.

### Edge Topology Registry

Route prefixes, service bindings, cache classes, health paths, and deploy-KV keys
are all owned by a single config file:

```
infrastructure/worker/routes-config.json
```

The edge-router reads this config at module load time — no topology is hardcoded in
`edge-router.js`. A sync test (`routes-config.test.js`) fails when `wrangler.toml`
service bindings diverge from the config's `staticRoutes[*].binding` list.

### Routing Table

| Pattern          | Target                    | Mechanism                           |
| ---------------- | ------------------------- | ----------------------------------- |
| `/api/*`         | DigitalOcean App Platform | HTTP proxy to `API_ORIGIN`          |
| `/hospitality/*` | Hospitality Worker        | Service Binding (`env.HOSPITALITY`) |
| `/rialto/*`      | Rialto Worker             | Service Binding (`env.RIALTO`)      |
| `/gen/*`         | Gen Worker                | Service Binding (`env.GEN`)         |
| `/*`             | Marketing Worker          | Service Binding (`env.MARKETING`)   |
| `/health/system` | Edge router itself        | Aggregated health (see ADR-004)     |

All entries in this table are defined in `routes-config.json`; the table above is
derived documentation only. Edit the config file to add or change routes.

### Service Bindings for Static Sites

Static site Workers are called via `env.BINDING.fetch()`, which is an in-process function call that **bypasses the Cloudflare CDN entirely**. This eliminates stale HTML after deploys -- the critical problem that motivated this architecture.

The edge router strips path prefixes before forwarding (e.g., `/hospitality/foo` becomes `/foo` on the app Worker), because each app is built with a Vite `base` path but the Worker serves from root.

### HTTP Proxy for API

API requests are forwarded via standard `fetch()` to the DigitalOcean App Platform origin. The edge router:

- Preserves the original path (including `/api/` prefix).
- Sets `X-Forwarded-Host`, `X-Forwarded-For`, and `X-Request-ID` headers.
- Injects feature flags from KV as an `X-Feature-Flags` header.
- Wraps the proxy in a **circuit breaker** (KV-backed state) that opens after repeated 5xx responses and returns a branded error page.

### Security Headers

Every static site response receives security headers injected by the edge router:

- `Strict-Transport-Security` (HSTS with `includeSubDomains`)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy` with a **per-request nonce** for `script-src` (replaces `unsafe-inline`)
- `Referrer-Policy`, `Permissions-Policy`

HTML responses are processed by `HTMLRewriter` to inject the nonce into all `<script>` tags, allowing Vite-generated inline scripts to execute under the nonce-based CSP.

### Cache Policy

- Hashed assets (`/assets/*` with content hashes): `public, max-age=31536000, immutable`.
- HTML documents: `public, max-age=0, must-revalidate`.
- API responses: passed through unmodified.

### Additional Edge Behaviors

- **Rate limiting**: Per-IP, per-path rate limits backed by KV.
- **www redirect**: `www.mattbutlerengineering.com` -> 301 to bare domain.
- **Legacy redirects**: `/dashboard/*` -> `/hospitality/*`.
- **Source map blocking**: `.map` files return 404 (defense in depth; maps are uploaded to Sentry and deleted from dist).
- **Trailing-slash normalization**: SPA prefixes (`/rialto`, `/hospitality`, `/gen`) redirect to trailing-slash versions to prevent React Router confusion.

## Consequences

**Benefits:**

- **No stale deploys**: Service Bindings skip the CDN cache, so HTML is always fresh. This was the primary driver for this architecture.
- **Single domain**: All apps and APIs share one origin, avoiding CORS complexity and cookie domain issues.
- **Centralized security**: Security headers are applied once at the edge, not duplicated across each app's build configuration.
- **Circuit breaker**: API outages produce a branded error page instead of raw connection errors.

**Trade-offs:**

- The edge router is a single point of failure for all traffic. Mitigated by Cloudflare Workers' global distribution and automatic failover.
- Adding a new static site requires: create the Worker, add a Service Binding in `wrangler.toml`, and add one entry to `routes-config.json`. The sync test catches any drift between the config and `wrangler.toml`.
- The HTTP proxy to DigitalOcean means API latency includes the extra hop from Cloudflare's nearest PoP to the DO region. Acceptable because the DO API region is chosen for database proximity, not client proximity.

## Alternatives Considered

### Cloudflare Pages with `_redirects` / `_headers`

Rejected because Pages does not support Service Bindings between multiple apps on the same domain, and its CDN cache requires purge-on-deploy to avoid stale HTML.

### Nginx reverse proxy on the API server

Rejected because it does not solve the static site routing problem and loses Cloudflare's global edge network for static content.

### Separate subdomains per app (`hospitality.mattbutlerengineering.com`)

Rejected because it introduces CORS configuration for API calls, complicates cookie sharing, and requires separate TLS certificates or a wildcard cert. A single domain with path-based routing is operationally simpler.

### Cloudflare CDN cache with purge-on-deploy

Rejected as the primary strategy because cache purge is eventually consistent -- users can still see stale HTML for seconds to minutes after a deploy. Service Bindings provide instant consistency.
