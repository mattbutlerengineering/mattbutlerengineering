# Architecture

## Overview

Matt Butler Engineering is a monorepo-based web platform with a React frontend, authenticated dashboard, and Fastify API backend, deployed on DigitalOcean App Platform with Cloudflare DNS.

## ASCII Diagram

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                        Auth0                                │
                                    │                                                             │
                                    │  ┌─────────────────┐    ┌─────────────────────────────┐   │
                                    │  │ mattbutlereng-  │    │ mattbutlerengineering-api   │   │
                                    │  │ ineering-app    │    │ (Resource Server)           │   │
                                    │  │ (SPA Client)    │    │                             │   │
                                    │  └────────┬────────┘    └──────────────┬──────────────┘   │
                                    │           │                            │                   │
                                    └───────────┼────────────────────────────┼───────────────────┘
                                                │                            │
                                                │ OAuth 2.0 / OIDC           │ JWT Validation
                                                │                            │
┌──────────┐                        ┌───────────▼────────────────────────────▼───────────────────┐
│          │                        │                                                            │
│  User    │    HTTPS Request       │                      Cloudflare                            │
│ Browser  │ ─────────────────────► │                   (DNS + Proxy)                            │
│          │                        │                                                            │
└──────────┘                        │                 mattbutlerengineering.com                  │
                                    │                                                            │
                                    └───────────────────────────┬────────────────────────────────┘
                                                                │
                                                                │ CNAME
                                                                ▼
                                    ┌────────────────────────────────────────────────────────────┐
                                    │              DigitalOcean App Platform                     │
                                    │          mattbutlerengineering-8ryim.ondigitalocean.app   │
                                    │                                                            │
                                    │  ┌─────────────────────────────────────────────────────┐  │
                                    │  │                    Ingress Router                    │  │
                                    │  │                                                      │  │
                                    │  │   /api/*  ──────►  users-api                        │  │
                                    │  │   /dashboard/* ──► dashboard                        │  │
                                    │  │   /* ──────────►   web                              │  │
                                    │  │                                                      │  │
                                    │  └──────────┬─────────────────┬─────────────────┬──────┘  │
                                    │             │                 │                 │         │
                                    │             ▼                 ▼                 ▼         │
                                    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
                                    │  │   users-api  │  │  dashboard   │  │     web      │    │
                                    │  │              │  │              │  │              │    │
                                    │  │   Fastify    │  │    React     │  │    React     │    │
                                    │  │   Docker     │  │  Static Site │  │ Static Site  │    │
                                    │  │   Port 3001  │  │              │  │              │    │
                                    │  │              │  │  /dashboard  │  │      /       │    │
                                    │  └──────────────┘  └──────────────┘  └──────────────┘    │
                                    │                                                            │
                                    └────────────────────────────────────────────────────────────┘
```

## Mermaid Diagram

```mermaid
flowchart TB
    subgraph User
        Browser[Browser]
    end

    subgraph Auth0[Auth0 Tenant]
        SPA[mattbutlerengineering-app<br/>SPA Client]
        API_RS[mattbutlerengineering-api<br/>Resource Server]
    end

    subgraph Cloudflare[Cloudflare]
        DNS[DNS + CDN Proxy<br/>mattbutlerengineering.com]
    end

    subgraph Neon[Neon]
        DB[(PostgreSQL<br/>Serverless)]
    end

    subgraph DO[DigitalOcean App Platform]
        Ingress[Ingress Router]

        subgraph Components[App Components]
            Web[web<br/>React Static Site<br/>Path: /]
            Dashboard[dashboard<br/>React Static Site<br/>Path: /dashboard]
            UsersAPI[users-api<br/>Fastify Docker<br/>Path: /api]
        end
    end

    Browser -->|HTTPS| DNS
    DNS -->|CNAME| Ingress

    Ingress -->|"/*"| Web
    Ingress -->|"/dashboard/*"| Dashboard
    Ingress -->|"/api/*"| UsersAPI

    UsersAPI -->|Prisma| DB

    Browser <-->|OAuth 2.0 / OIDC| SPA
    Dashboard <-->|Get Tokens| SPA
    UsersAPI <-->|Validate JWT| API_RS

    style Auth0 fill:#eb5424,color:#fff
    style Cloudflare fill:#f38020,color:#fff
    style DO fill:#0080ff,color:#fff
    style Neon fill:#00e599,color:#000
```

## Component Details

### Frontend Apps

| App | Technology | Path | Description |
|-----|------------|------|-------------|
| `web` | React + Vite | `/` | Public marketing site |
| `dashboard` | React + Vite | `/dashboard` | Authenticated user dashboard |

### Backend Services

| Service | Technology | Path | Description |
|---------|------------|------|-------------|
| `users-api` | Fastify + Prisma | `/api` | User management API |
| `agent` | Fastify + Prisma | `:3003` | Agent session API (sessions, orchestration, webhooks) |

### Developer Tooling

| Package | Technology | Description |
|---------|------------|-------------|
| `@mbe/agent-core` | Claude Agent SDK | Agentic workflow engine — worktrees, sessions, PR creation |
| `@mbe/cli` | Commander.js | CLI (`mbe agent run`, `mbe users`, etc.) |

### Infrastructure

| Component | Provider | Cost | Purpose |
|-----------|----------|------|---------|
| App Platform | DigitalOcean | ~$5/mo | Hosting (static sites + Docker services) |
| Database | Neon | Free | Serverless PostgreSQL |
| DNS + CDN | Cloudflare | Free | Domain routing, SSL, caching |
| Authentication | Auth0 | Free | OAuth 2.0 / OIDC identity provider |
| IaC | Pulumi (TypeScript) | Free | Infrastructure as Code |

### Monorepo Structure

```
mattbutlerengineering/
├── apps/
│   ├── web/              # Public website
│   ├── dashboard/        # Authenticated dashboard
│   └── rialto-web/       # Design system showcase
├── services/
│   ├── users/            # Users API (Fastify)
│   └── agent/            # Agent session API (Fastify)
├── packages/
│   ├── agent-core/       # Agentic workflow engine
│   ├── rialto/           # Design system (React components)
│   ├── types/            # Shared TypeScript types
│   ├── auth/             # Auth utilities (React + Fastify)
│   └── config/           # Shared ESLint/TypeScript config
├── tools/
│   └── cli/              # CLI tool (mbe)
└── infrastructure/
    └── pulumi/           # IaC definitions
```

## Data Flow

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant Auth0
    participant API

    User->>Dashboard: Visit /dashboard
    Dashboard->>Auth0: Redirect to login
    Auth0->>User: Show login form
    User->>Auth0: Enter credentials
    Auth0->>Dashboard: Return with auth code
    Dashboard->>Auth0: Exchange code for tokens
    Auth0->>Dashboard: ID token + Access token
    Dashboard->>API: Request with Bearer token
    API->>Auth0: Validate JWT (JWKS)
    Auth0->>API: Token valid
    API->>Dashboard: Return user data
    Dashboard->>User: Show dashboard
```

## Agentic Workflows

An autonomous coding agent system that accepts tasks, executes them in isolated git worktrees via the Claude Agent SDK, and delivers pull requests.

### Architecture Layers

```mermaid
flowchart TB
    subgraph Clients["Phase 4 — Client Integrations ✅"]
        CLI["CLI<br/><code>mbe agent run/start/orchestrate</code>"]
        GH["GitHub Webhooks<br/>Issues / PR comments"]
        GHA["GitHub Action<br/>workflow_dispatch"]
        CI["CI/CD Auto-Retry<br/>agent/ branch failures"]
    end

    subgraph Orchestrator["Phase 3 — Orchestrator ✅"]
        Decomposer["Task Decomposer<br/>Breaks big tasks into sub-tasks"]
        Coordinator["Coordinator Agent<br/>MCP tools → Session API"]
    end

    subgraph SessionAPI["Phase 2 — Session API ✅"]
        API["Fastify REST API<br/>:3003"]
        DB[(PostgreSQL<br/>Sessions + Events)]
        SSE["SSE Stream<br/>Real-time events"]
    end

    subgraph Core["Phase 1 — @mbe/agent-core ✅"]
        Runner["Session Runner<br/>SDK query() orchestration"]
        Worktree["Worktree Manager<br/>Git isolation per session"]
        Permissions["Tool Permissions<br/>Security boundary"]
        PR["PR Creator<br/>gh CLI + zod validation"]
        Cost["Cost Tracker<br/>Budget enforcement"]
    end

    subgraph SDK["Claude Agent SDK"]
        Query["query()<br/>Async generator"]
        Tools["Built-in Tools<br/>Read, Write, Edit, Bash, Glob, Grep"]
    end

    CLI --> Runner
    GH --> API
    GHA --> API
    CI --> API

    Decomposer --> Coordinator
    Coordinator --> API

    API --> Runner
    API --> DB
    API --> SSE

    Runner --> Query
    Runner --> Worktree
    Runner --> Permissions
    Runner --> PR
    Runner --> Cost

    Query --> Tools

    style Core fill:#22c55e,color:#000
    style SessionAPI fill:#3b82f6,color:#fff
    style Orchestrator fill:#a855f7,color:#fff
    style Clients fill:#f59e0b,color:#000
    style SDK fill:#6b7280,color:#fff
```

### Session Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant CLI as mbe CLI
    participant Core as @mbe/agent-core
    participant Git as Git Worktree
    participant SDK as Claude Agent SDK
    participant GH as GitHub

    User->>CLI: mbe agent run "Fix the bug"
    CLI->>Core: runSession(config)
    Core->>Git: Create worktree + branch
    Git-->>Core: agent/fix-the-bug-a1b2c3

    Core->>SDK: query(task, options)
    loop Agent turns
        SDK->>SDK: Read files, edit code, run tests
        SDK-->>Core: Stream SDKMessage events
    end
    SDK-->>Core: SDKResultMessage (success/fail)

    Core->>Git: git add + commit
    Core->>Git: git push -u origin branch
    Core->>GH: gh pr create --json
    GH-->>Core: PR URL + number

    Core->>Git: Remove worktree (cleanup)
    Core-->>CLI: SessionResult
    CLI-->>User: Status, PR URL, cost, tokens
```

### Security Model

```mermaid
flowchart LR
    subgraph Allowed["✅ Allowed"]
        Read["Read"]
        Write["Write<br/>(worktree only)"]
        Edit["Edit<br/>(worktree only)"]
        Bash["Bash<br/>(safe commands)"]
        Glob["Glob"]
        Grep["Grep"]
    end

    subgraph Blocked["🚫 Blocked"]
        Web["WebSearch / WebFetch"]
        Ask["AskUserQuestion"]
        Push["git push<br/>(orchestrator handles)"]
        Sudo["sudo / rm -rf"]
        Publish["npm/pnpm publish"]
        Escape["Path traversal<br/>(../ resolved)"]
    end

    Agent["Agent Session"] --> Allowed
    Agent -.-x Blocked

    style Allowed fill:#dcfce7,color:#000
    style Blocked fill:#fecaca,color:#000
```

### Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | `@mbe/agent-core` + CLI (`mbe agent run`) | ✅ Complete (84 tests) |
| **Phase 2** | Session API (Fastify + Prisma + SSE) | ✅ Complete (29 tests) |
| **Phase 3** | Orchestrator (task decomposition, parallel sessions) | ✅ Complete |
| **Phase 4** | GitHub webhooks, GitHub Action, CI auto-retry | ✅ Complete |

See [`docs/plans/2026-02-27-agentic-workflows.md`](plans/2026-02-27-agentic-workflows.md) for the full implementation plan.

## URLs

| Environment | URL |
|-------------|-----|
| Production | https://mattbutlerengineering.com |
| Dashboard | https://mattbutlerengineering.com/dashboard |
| API | https://mattbutlerengineering.com/api |
| DO Direct | https://mattbutlerengineering-8ryim.ondigitalocean.app |
| Auth0 | https://dev-ytbgmz5ls3wh4xdx.us.auth0.com |
| Neon Console | https://console.neon.tech (project: mattbutlerengineering) |
