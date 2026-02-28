# Codebase Concerns

**Analysis Date:** 2026-02-27

## Tech Debt

**Duplicate Auth Implementation in Reservation Routes:**
- Issue: Auth verification logic is duplicated across multiple route files instead of using the shared `@mbe/auth` plugin
- Files: `services/reservations/src/routes/venues.ts`, `services/reservations/src/routes/floor-plans.ts`, `services/reservations/src/routes/tables.ts`, `services/reservations/src/routes/guests.ts`, `services/reservations/src/routes/reservations.ts`, `services/reservations/src/routes/holds.ts`
- Impact: Each route file manually creates JWKS client, implements `verifyAuth()` handler, and repeats JWT validation logic. This increases maintenance burden and risk of inconsistency. The `@mbe/auth` package exists but is not being used.
- Fix approach: Migrate all reservation routes to use the shared `authPlugin` from `@mbe/auth/fastify`. Update `services/reservations/src/app.ts` to register the plugin with proper environment variables. Refactor individual route auth handlers to use the `requireAuth` preHandler instead.

**Undersized Prisma Connection Pool for Concurrent Load:**
- Issue: `services/reservations/src/services/database.ts` creates a single default PrismaClient without connection pool configuration
- Files: `services/reservations/src/services/database.ts`, `services/users/src/services/database.ts`, `services/agent/src/services/database.ts`
- Impact: Under concurrent load, Prisma's default connection pool (2 connections) may cause connection exhaustion, blocking queries. Production workloads need larger pools.
- Fix approach: Create database instances with explicit connection pool settings via `datasource` in prisma.schema or environmental tuning. Configure pool size based on expected concurrency (typical: 10-20 connections for API services).

**Service Layer Tests Missing Entirely:**
- Issue: No test files exist for any service layer files (availability, guest, floor-plan, hold, reservation, table, venue services)
- Files: All files under `services/reservations/src/services/` except `database.ts`
- Impact: Complex business logic (availability calculation, table allocation, conflict detection) lacks test coverage. Changes to these services have no safety net.
- Fix approach: Write integration tests for all service functions. Target: 80%+ coverage of critical paths (availability slots, conflict detection, duration estimation).

**Frontend Missing Venue Context:**
- Issue: `apps/hospitality/src/pages/GuestsPage.tsx` line 13 has hardcoded empty `venueId` with TODO comment
- Files: `apps/hospitality/src/pages/GuestsPage.tsx`
- Impact: GuestsPage is non-functional until venue selection is implemented. Feature is blocked.
- Fix approach: Implement venue context provider or URL parameter routing to pass venueId from parent component or route.

## Known Issues

**GuestsPage Blocked Functionality:**
- Symptoms: GuestsPage always shows "Please select a venue to view guests" message
- Files: `apps/hospitality/src/pages/GuestsPage.tsx` (line 13-18)
- Trigger: Page loads with empty venueId
- Workaround: Implement venue context or URL-based routing to supply venueId

## Security Considerations

**Type Safety Issues in Webhook Handling:**
- Risk: `services/agent/src/routes/webhooks.ts` uses loose typing (`unknown` types for incoming data) without strict validation before processing
- Files: `services/agent/src/routes/webhooks.ts` (lines 93, 164, 192, 226)
- Current mitigation: None observed. Webhook payloads are partially validated but lack comprehensive schema enforcement.
- Recommendations: Add strict TypeScript types and runtime validation for webhook payloads. Use Fastify schema validation or a validation library (e.g., zod) to ensure webhook structure before processing.

**JWT Payload Type Casting:**
- Risk: JWT payload is cast `as unknown as JWTPayload` in multiple routes without validation of required fields
- Files: `services/reservations/src/routes/venues.ts` (line 54), `services/reservations/src/routes/floor-plans.ts` (line 54), and duplicated in other routes
- Current mitigation: Basic field access with optional chaining, but no validation that required fields exist
- Recommendations: Validate JWT payload structure explicitly after verification. Use a schema validator to ensure `sub`, `email`, and other required fields are present before accessing them.

**Hardcoded Auth Configuration Repeated:**
- Risk: Auth authority and audience URLs are read from environment and constructed in multiple places, creating multiple points of failure
- Files: All reservation routes and other services
- Current mitigation: Environment variables are used
- Recommendations: Centralize auth configuration as a single source of truth. The shared `@mbe/auth` plugin should handle this consistently across all services.

## Performance Bottlenecks

**N+1 Query Risk in Availability Calculation:**
- Problem: `services/reservations/src/services/availability.ts` may fetch reservations and holds separately, then iterate tables in a loop
- Files: `services/reservations/src/services/availability.ts` (lines 156-205)
- Cause: The `getAvailableSlots()` function does Promise.all for reservations and holds (line 156), then loops through each time slot and table combination without batching database queries
- Improvement path: Batch load all relevant data upfront. Use database queries that fetch relationships in a single query (Prisma's `include` or aggregations) rather than per-slot queries.

**Large Route Files with Complex Inline Logic:**
- Problem: Route files exceed recommended size, mixing HTTP handling with business logic
- Files: `services/reservations/src/routes/venues.ts` (750 lines), `services/reservations/src/routes/floor-plans.ts` (698 lines), `services/reservations/src/routes/reservations.ts` (598 lines), `services/reservations/src/routes/guests.ts` (598 lines), `services/reservations/src/routes/tables.ts` (411 lines)
- Cause: Each route file contains full CRUD endpoints with inline request validation, transformation, and response formatting
- Improvement path: Extract per-endpoint logic into separate handler functions or middleware. Consolidate schema validation and response formatting into reusable utilities.

**Schema File Size:**
- Problem: `services/reservations/src/schemas/index.ts` is 613 lines, containing all JSON schema definitions in one file
- Files: `services/reservations/src/schemas/index.ts`
- Cause: All schemas defined in a single file for easier re-export
- Improvement path: Split schemas into feature-based modules (e.g., `schemas/table.ts`, `schemas/venue.ts`) while maintaining barrel export. Reduces cognitive load during schema updates.

## Fragile Areas

**Complex Availability Logic Without Tests:**
- Files: `services/reservations/src/services/availability.ts`
- Why fragile: 576-line file with interdependent functions (estimateDuration, getDaySchedule, parseTimeToMinutes, getAvailableSlots, etc.). No unit tests to verify edge cases (daylight savings, off-hours, boundary times).
- Safe modification: Add comprehensive test coverage before refactoring. Test each helper function independently. Verify timezone handling and edge cases (midnight, closing time).
- Test coverage: 0% (no .test.ts file exists)

**Table Availability Allocation Algorithm:**
- Files: `services/reservations/src/services/availability.ts` (lines 173-205)
- Why fragile: Table assignment logic uses imperative push to availableTables array. No validation that selected tables don't double-book. Concurrent requests could race and allocate same table.
- Safe modification: Add locking mechanism (database-level or optimistic concurrency control). Cover with integration tests that simulate concurrent bookings.
- Test coverage: 0%

**Event Service with No Error Boundaries:**
- Files: `services/reservations/src/services/events.ts`, `services/reservations/src/routes/events.ts`
- Why fragile: Server-Sent Events (SSE) stream to clients without reconnection logic or backpressure handling. Clients that disconnect uncleanly could leave dangling connections.
- Safe modification: Implement timeout-based cleanup for stale connections. Add heartbeat mechanism. Test with connection drops and reconnect scenarios.
- Test coverage: 0% (no test file exists)

**Session Executor Error Suppression:**
- Files: `services/agent/src/services/session-executor.ts` (lines 125-127)
- Why fragile: Event logging is wrapped in try-catch that silently swallows all errors (`catch { }`). If event logging fails, the failure is invisible.
- Safe modification: Log event logging failures to a separate error channel. At minimum, ensure session progress isn't blocked by logging failures, but don't hide the error.
- Test coverage: Limited (only 3 route tests for agent service)

## Scaling Limits

**Single Prisma Instance per Service:**
- Current capacity: Limited by database connection pool (default ~2 connections)
- Limit: Concurrent request bottleneck at ~10-50 RPS depending on query complexity
- Scaling path: Increase connection pool size. Monitor pool exhaustion metrics. For larger scale, consider read replicas or sharding tables like `reservations` by venue.

**Max Concurrent Session Limit Hardcoded:**
- Current capacity: `MAX_CONCURRENT_SESSIONS=5` (default in `services/agent/src/services/session-executor.ts` line 14)
- Limit: System can only run 5 agent sessions simultaneously
- Scaling path: Make limit configurable via environment variable. Implement job queue (Redis, Bull) for session scheduling instead of in-memory map.

**Memory Usage for Active Sessions:**
- Current capacity: Each active session holds an AbortController in memory (`activeControllers` map)
- Limit: If sessions run for hours, memory usage grows unbounded. No cleanup for zombie sessions.
- Scaling path: Implement timeout-based cleanup (e.g., sessions > 24h old are forcibly cancelled). Persist session state to database and use background job processor instead of in-memory tracking.

## Dependencies at Risk

**Jose Library for JWT Handling:**
- Risk: `jose` is used for JWT verification across multiple services. If jose has a vulnerability or is unmaintained, it affects auth across the system.
- Impact: Auth bypass or token validation failures would compromise all reservation and agent APIs
- Migration plan: Ensure jose is regularly updated. Consider adding security scanning to CI/CD. Have a plan to switch to alternative (e.g., `jsonwebtoken` or framework-native auth) if needed.

## Missing Critical Features

**No Rate Limiting on API Endpoints:**
- Problem: Reservation and user APIs have no rate limiting. DOS vulnerability exists.
- Blocks: Production deployment should enforce per-user or per-IP rate limits
- Implementation: Add Fastify rate limiting plugin or custom middleware. Configure limits per endpoint (e.g., 100 req/min for list endpoints, 10 req/min for create).

**No Audit Logging:**
- Problem: No audit trail for critical operations (reservation creation, user updates, venue changes)
- Blocks: Compliance requirements (e.g., GDPR, SOX) cannot be met without audit logs
- Implementation: Middleware to log all non-GET requests with user ID, action, timestamp, before/after state.

**No Idempotency Key Support:**
- Problem: Reservation creation endpoints lack idempotency. Retry scenarios cause duplicate reservations.
- Blocks: Reliable client retry logic is impossible
- Implementation: Accept `Idempotency-Key` header, store request hash and response in cache, return cached response on duplicate key.

## Test Coverage Gaps

**Service Layer Entirely Untested:**
- What's not tested: All business logic in availability, guest, reservation, table, venue, floor-plan, and hold services
- Files: `services/reservations/src/services/*.ts` (all except database.ts)
- Risk: Regressions in complex logic go undetected until production. Refactoring is high-risk.
- Priority: High - These services handle core booking logic

**Agent Service Route Tests Incomplete:**
- What's not tested: Webhook handling, orchestration edge cases, event streaming
- Files: `services/agent/src/routes/webhooks.ts`, `services/agent/src/routes/session-events.ts`
- Risk: Webhook integration bugs (GitHub, CI/CD hooks) only surfaced in production
- Priority: High - Webhook processing is critical for agent automation

**E2E Tests Missing:**
- What's not tested: Complete user flows (booking a reservation, managing a venue)
- Files: No e2e test suite for reservation service
- Risk: Integration failures between services go undetected
- Priority: Medium - Catches cross-service issues early

**Frontend Component Tests Absent:**
- What's not tested: React components in `apps/hospitality/` and `apps/marketing/`
- Files: Dashboard pages and web components
- Risk: UI regressions and accessibility issues not caught
- Priority: Medium - Protects user experience

---

*Concerns audit: 2026-02-27*
