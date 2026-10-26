---
paths:
  - "services/**/src/**"
  - "packages/service-bootstrap/**"
---

# Gotchas — Fastify / rate limiting

Path-scoped sibling of [gotchas.md](./gotchas.md#fastify--rate-limiting).

- **A route-level `config.rateLimit` REPLACES the global 100/min limiter for that route.** With `hook: "preHandler"`, schema-validation 400s and `requireAuth` 401s answer before any limiter, leaving the route unbounded (#4492 → #4499). Detect with a live probe: compare `x-ratelimit-*` headers against a sibling route.
- **`@fastify/rate-limit` runs at most ONE limiter per request** (`rateLimitRan` flag), so a second hook is silently skipped. For a per-identity cap, declare no `config.rateLimit` and enforce by hand in a preHandler after `requireAuth` with `fastify.createRateLimit(opts)`, replying 429 on `isExceeded` (narrow on `isAllowed` first).
