# Architecture

**Analysis Date:** 2026-02-27

## Pattern Overview

**Overall:** Monorepo with microservices backend + multi-app frontend, using domain-driven design with strict separation between presentation, business logic, and data access layers.

**Key Characteristics:**
- Multiple independent backend services (users, agent, reservations) each with isolated database
- Shared type definitions and utilities across all applications
- Frontend apps (marketing, dashboard, design system) consume backend APIs via client library
- Agent execution engine (@mbe/agent-core) runs autonomous coding sessions with safety constraints
- Async/event-driven architecture for long-running agent tasks

## Layers

**Presentation Layer (Frontend):**
- Purpose: User interface and interactions via browser
- Location: `apps/marketing`, `apps/dashboard`, `apps/agent-viz`, `apps/rialto-web`
- Contains: React components, pages, layouts, hooks, styling
- Depends on: @mbe/auth, @mbe/types, @mbe/api-client, @mbe/shared-layout, @mbe/rialto
- Used by: Web browsers

**API Client Layer:**
- Purpose: Abstraction for making HTTP requests to backend services
- Location: `packages/api-client/src`
- Contains: HTTP client factories, API call wrappers
- Depends on: Fetch API, @mbe/types
- Used by: Frontend applications

**Authentication & Authorization:**
- Purpose: User identity verification and JWT validation
- Location: `packages/auth/src`
- Contains: Auth0 integration, React hooks (useAuth), Fastify decorators, JWT verification
- Depends on: jose, @mbe/types
- Used by: Frontend apps (@mbe/auth/react), backend services

**Type Definitions:**
- Purpose: Single source of truth for all data types across frontend and backend
- Location: `packages/types/src`
- Contains: User, Reservation, Venue, Guest, Agent session types, API response envelopes
- Depends on: Nothing (foundation layer)
- Used by: All applications and services

**Backend Services (Microservices):**
- Purpose: Independent business logic and data persistence
- Location: `services/{users,agent,reservations}/src`
- Contains: Route handlers, business logic services, Prisma ORM models, schemas
- Depends on: Fastify, Prisma, @mbe/types, @mbe/auth
- Used by: Frontend via API calls, Agent service via HTTP

**Agent Execution Engine:**
- Purpose: Autonomous coding agent session orchestration and execution
- Location: `packages/agent-core/src`
- Contains: Session runner, tool permission handler, worktree management, PR creation, cost tracking
- Depends on: @anthropic-ai/claude-agent-sdk, child_process (git), @mbe/types
- Used by: Agent service, CLI tool

**CLI & Tools:**
- Purpose: Command-line interface for users and integration
- Location: `tools/cli/src`
- Contains: Agent commands, auth commands, user management commands
- Depends on: commander, @mbe/agent-core, @mbe/api-client
- Used by: Developers and scripts

## Data Flow

**User Authentication Flow:**

1. User visits frontend app and clicks "Sign In"
2. @mbe/auth/react initiates Auth0 login via browser redirect
3. Auth0 redirects back with authorization code
4. Frontend exchanges code for JWT token (stored in browser)
5. Frontend makes API request with Authorization: Bearer [JWT]
6. Backend service verifies JWT using Auth0 JWKS endpoint (jose library)
7. Request includes authenticated user context in FastifyRequest
8. Response returned with user data

**Reservation Booking Flow:**

1. Frontend (BookingWidget in dashboard) calls availabilityService to get time slots
2. Reservations service queries availability rules, pacing rules, existing reservations
3. User selects time slot and fills guest details
4. Frontend submits CreateReservationRequest to reservations service
5. Service validates, checks table availability, records hold if needed
6. Response returns reservation with ID and confirmation details
7. Frontend updates UI with booking confirmation

**Agent Session Execution Flow:**

1. User submits task via CLI (`mbe agent run "Fix login bug"`)
2. CLI calls @mbe/agent-core.runSession() or hits agent service API
3. runSession creates isolated git worktree on local filesystem
4. Agent execution begins via @anthropic-ai/claude-agent-sdk
5. Agent reads project context via buildSystemPrompt (loads CLAUDE.md, etc.)
6. Agent iteratively invokes tools (Read, Write, Bash, etc.)
7. Tool permission handler validates each tool request against allowedTools
8. After max turns or task completion, agent commits changes and creates PR via GitHub API
9. Session result (branch, PR URL, cost, tokens) returned to caller
10. CLI/dashboard displays results and PR link

**State Management:**

- Frontend: React state + Context API (useAuth from @mbe/auth)
- Backend: Prisma ORM manages database state, services expose query/mutation methods
- Agent: Worktree filesystem is isolated state, database session record tracks progress
- API: Stateless request/response with authorization via JWT

## Key Abstractions

**Service Pattern:**
- Purpose: Encapsulate business logic away from route handlers
- Examples: `services/users/src/services/user.ts`, `services/reservations/src/services/reservation.ts`
- Pattern: Object with async methods (list, getById, create, update, delete), uses Prisma for data access

**Repository Pattern (via Prisma):**
- Purpose: Abstract database access behind consistent interface
- Examples: prisma.user, prisma.reservation, prisma.table
- Pattern: Prisma client instance exposes model-specific operations, no raw SQL

**Factory Pattern (API Client):**
- Purpose: Create configured HTTP clients for different backends
- Examples: `packages/api-client/src`, exported createApiClient function
- Pattern: Function accepts base URL config, returns object with typed API methods

**Plugin Pattern (Fastify):**
- Purpose: Modular route registration with shared schema/auth setup
- Examples: `userRoutes`, `sessionRoutes` exported as FastifyPluginAsync
- Pattern: Each route file exports plugin function that receives fastify instance and registers routes

**Hook Pattern (Fastify):**
- Purpose: Cross-cutting concerns like logging, error handling, authorization
- Examples: `fastify.addHook("onRequest", verifyAuth)`, `fastify.addHook("onSend", logResponse)`
- Pattern: Hooks run before/after request processing, can terminate request early

**Schema First (JSON Schema):**
- Purpose: Single source of truth for request/response validation and documentation
- Examples: `services/users/src/schemas/`, Fastify swagger integration
- Pattern: Define schema once, register with fastify, used for validation + OpenAPI docs

## Entry Points

**Marketing Application:**
- Location: `apps/marketing/src/main.tsx`
- Triggers: Browser navigation to localhost:3000
- Responsibilities: Renders marketing homepage, static content, redirects to dashboard/API docs

**Dashboard Application:**
- Location: `apps/dashboard/src/main.tsx`
- Triggers: Browser navigation to dashboard.localhost:3002
- Responsibilities: Authenticated dashboard with reservations, timeline, floor plans, guest management

**Users Service:**
- Location: `services/users/src/index.ts`
- Triggers: Process startup with PORT=3001
- Responsibilities: User CRUD, preferences, profile management via REST API

**Agent Service:**
- Location: `services/agent/src/index.ts`
- Triggers: Process startup with PORT=3003
- Responsibilities: Agent session management, session events, orchestration, GitHub webhooks

**Reservations Service:**
- Location: `services/reservations/src/index.ts`
- Triggers: Process startup (port TBD)
- Responsibilities: Reservation CRUD, availability calculation, table management, venue configuration

**CLI:**
- Location: `tools/cli/src/index.ts`
- Triggers: Command execution (`mbe agent run "task"`, `mbe users list`, etc.)
- Responsibilities: Command parsing, calling agent-core or API client, outputting results

## Error Handling

**Strategy:** Explicit error handling at every layer, structured error responses

**Patterns:**

- Frontend: Try/catch blocks around API calls, error boundaries for React components
- Services: Try/catch in route handlers, return structured ApiError responses with statusCode
- Agent: Error events emitted via SessionEventCallback, stored in SessionResult.errors array
- Validation: Schema validation via Fastify before handler execution, returns 400 Bad Request
- Authentication: Return 401 Unauthorized on missing/invalid JWT, handled by middleware

Example error response format:
```json
{
  "error": "Not Found",
  "message": "User with ID xyz not found",
  "statusCode": 404
}
```

## Cross-Cutting Concerns

**Logging:**
- Approach: Fastify logger (pino) on backend, console on frontend, structured logging with context
- Services: Add request ID to all log entries for tracing
- Agent: Emit session:log events for streaming to frontend

**Validation:**
- Approach: JSON Schema validation at API boundaries, runtime type guards in services
- Never trust external data (API responses, user input, file content)
- Fail fast with clear error messages

**Authentication:**
- Approach: OAuth 2.0 with Auth0, JWT tokens in Authorization header
- Backend verification via JWKS endpoint
- Frontend stores token in browser storage (auth context)

**Rate Limiting:**
- Current state: Not implemented (noted in concerns)
- Recommendation: Add rate limiting middleware to Fastify services

---

*Architecture analysis: 2026-02-27*
