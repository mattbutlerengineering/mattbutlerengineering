---
date: 2026-08-23
session: api-surface-invariants
trigger: A route declared its own `config.rateLimit` to key the cap on the verified `sub` instead of the caller IP, and in doing so silently removed every rate-limit bound from that route's unauthenticated surface
correction: Declare no route-level `config.rateLimit` at all, so the service-wide onRequest limiter keeps covering the anonymous surface, and enforce the per-identity cap by hand in a preHandler after requireAuth
root_cause: "@fastify/rate-limit's onRoute hook takes the global branch only when `config.rateLimit == null`. A route that declares its own opts out of the global limiter entirely. Moving the hook to preHandler so it could read request.user meant body-schema validation's 400 and requireAuth's 401 both answered before the limiter ran, leaving a publicly reachable POST with no bound."
prevention: "Detection is a live probe, not a diff — diff response headers against a sibling route on the deployed service. GET /api/v1/venues answers 401 carrying x-ratelimit-limit; the POST on the same path carried no rate-limit headers on either its 400 or its 401. Note you cannot fix this with a second rate-limit hook: rateLimitRequestHandler sets a rateLimitRan flag and every later limiter short-circuits, so at most ONE limiter runs per request. The escape hatch is fastify.createRateLimit(opts), which calls applyRateLimit directly and never touches that flag."
feeds_back_into: .claude/rules/gotchas.md#fastify--rate-limiting
---

## Summary

The dangerous property here is that nothing goes red. An absent rate limiter and a present one are identical to lint, to typecheck, and to every single-request test — the route still answers 401 to an anonymous caller, it just answers 401 an unlimited number of times. The change that caused it was itself correct in intent: keying on the verified `sub` is right, because `request.user` does not exist at `onRequest` and IP-keying lets one office NAT lock out everyone behind it.

The general lesson is that a route-level config which _replaces_ rather than _augments_ a service-wide default is a silent-downgrade hazard. It is normally harmless in this repo only because every other route keeps the default `onRequest` timing, so it swaps one limiter for an equivalent-or-stricter one at the same stage. The moment the timing moves, the unauthenticated surface below it is uncovered.

Verifying this class requires probing the deployed service and comparing response headers between sibling routes. No local gate can see it.
