# External Integrations

**Analysis Date:** 2026-02-27

## APIs & External Services

**Claude AI (Anthropic):**
- Service: Claude AI API (Anthropic)
- What it's used for: Autonomous coding agent sessions (runs code generation, fixes, refactoring)
  - SDK/Client: @anthropic-ai/claude-agent-sdk 0.1.0 (packages/agent-core)
  - API Endpoint: Anthropic Claude API
  - Auth: Environment variable `ANTHROPIC_API_KEY` (required in services/agent)

**GitHub:**
- Service: GitHub API (REST)
- What it's used for: Pull request creation, worktree management, branch operations
  - Used in: packages/agent-core (pr-creator.ts, worktree-manager.ts)
  - Auth: Git credentials from system (likely SSH key or GitHub token)
  - Operations: Create/update PRs, push branches, commit changes

**Auth0:**
- Service: Auth0 OIDC/JWT Identity Provider
- What it's used for: User authentication and authorization
  - SDK/Client: oidc-client-ts 3.0.1, react-oidc-context 3.1.0
  - Auth Authority: Environment variable `AUTH_AUTHORITY` (e.g., https://dev-ytbgmz5ls3wh4xdx.us.auth0.com)
  - API Identifier: Environment variable `AUTH_AUDIENCE` (https://api.mattbutlerengineering.com)
  - Token validation: jose 5.2.0 for JWT verification in services

## Data Storage

**Databases:**
- Type: PostgreSQL 16-alpine (Docker container in development)
- Purpose: Dual-database design for separation of concerns

  **Users Service Database:**
  - Connection: `DATABASE_URL=postgresql://mbe:mbe_dev_password@localhost:5432/mbe`
  - Client: Prisma Client (PrismaClient)
  - Models: `User` (id, email, name, picture, emailVerified, preferences, timestamps)
  - Location: `services/users/prisma/schema.prisma`

  **Agent Service Database:**
  - Connection: `DATABASE_URL=postgresql://mbe:mbe_dev_password@localhost:5432/mbe_agent`
  - Client: Prisma Client (PrismaClient)
  - Models: `Session`, `SessionEvent` (agent execution tracking, events, results)
  - Location: `services/agent/prisma/schema.prisma`

**File Storage:**
- Local filesystem only - No external object storage configured
- Worktree operations: Git directories managed locally in development
- Artifacts: Generated code and PR diffs stored in database (Session.resultText)

**Caching:**
- None detected - No Redis or Memcached integration
- Turborepo handles build caching locally

## Authentication & Identity

**Auth Provider:**
- Service: Auth0
- Implementation: OIDC (OpenID Connect) protocol
- Token type: JWT (JSON Web Tokens)
- Token validation: jose library for JWT verification
- React integration: react-oidc-context for hook-based auth state
- Fastify integration: Custom JWT middleware via @mbe/auth/fastify
- Token claims: Standard OIDC claims (sub, iss, email, etc.)

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, DataDog, or similar configured

**Logs:**
- Approach: Fastify built-in logger with configurable levels
- Configuration: `LOG_LEVEL` environment variable (default: "info")
- Output: Console (structured JSON logging via Fastify pino)
- Log format: Includes requestId, method, url, statusCode, responseTime

**Metrics/APM:**
- None detected - No APM service integration (DataDog, New Relic, etc.)

## CI/CD & Deployment

**Hosting:**
- Not detected in codebase - Infrastructure configuration missing
- Indicated by project structure: Pulumi IaC in `infrastructure/pulumi/`

**CI Pipeline:**
- GitHub Actions - Webhook support in services/agent (routes/webhooks.ts)
- Build system: Turborepo with remote caching
- Test integration: Vitest test runner (supports CI output formatting)
- Playwright E2E: Configured in apps/rialto-web/playwright.config.ts

**Deployment Artifacts:**
- Docker container deployment likely (Docker Compose present)
- Node.js application server format

## Environment Configuration

**Required env vars (Users Service):**
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3001)
- `LOG_LEVEL` - Logging verbosity (default: "info")
- `CORS_ORIGIN` - CORS allowed origin (e.g., http://localhost:3000)
- `AUTH_AUTHORITY` - Auth0 tenant URL
- `AUTH_AUDIENCE` - Auth0 API identifier

**Required env vars (Agent Service):**
- `DATABASE_URL` - PostgreSQL connection string (separate from users)
- `PORT` - Server port (default: 3003)
- `LOG_LEVEL` - Logging verbosity (default: "info")
- `ANTHROPIC_API_KEY` - Claude API key (CRITICAL - must be rotated if exposed)
- `DEFAULT_MODEL` - Default Claude model (default: "claude-sonnet-4-6")
- `DEFAULT_MAX_TURNS` - Agent turn limit (default: 50)
- `DEFAULT_MAX_BUDGET_USD` - Cost limit (default: 1.00)
- `MAX_CONCURRENT_SESSIONS` - Rate limit (default: 5)
- `CORS_ORIGIN` - CORS allowed origin

**Secrets location:**
- `.env` files (local development) - NOT committed to git
- Environment variables (production) - Must be injected via deployment platform
- GitHub secrets for CI/CD (for ANTHROPIC_API_KEY and Auth0 secrets)

## Webhooks & Callbacks

**Incoming:**
- GitHub webhooks: services/agent/src/routes/webhooks.ts
  - Endpoint: `POST /v1/webhooks/github`
  - Purpose: Trigger agent sessions from GitHub events (PR reviews, issue creation, etc.)
  - Authentication: GitHub webhook signature verification (HMAC-SHA256)
  - Config var: `GITHUB_WEBHOOK_SECRET` (used in webhook handler)

**Outgoing:**
- Pull request creation: Agent creates PRs via GitHub API
- Session callbacks: Server-Sent Events (SSE) for session progress streaming
  - Endpoint: `GET /v1/sessions/:id/events`
  - Purpose: Real-time event streaming to clients

## Data Flow

**User Authentication:**
1. User logs in via React app (auth context)
2. Auth0 redirects with authorization code
3. App exchanges code for ID token + access token
4. Access token sent in Authorization header to APIs
5. Fastify middleware validates JWT via jose library

**Agent Session Execution:**
1. Client (CLI or API) creates session via `/v1/sessions` POST
2. Agent service stores session in database (Session model)
3. Service calls Anthropic SDK to run agent
4. Agent runs tools (read files, write code, commit, create PRs)
5. Session events stored in SessionEvent model
6. Client streams events via SSE or polls session status

---

*Integration audit: 2026-02-27*
