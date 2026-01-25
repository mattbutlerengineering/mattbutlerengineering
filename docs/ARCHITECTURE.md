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

    Browser <-->|OAuth 2.0 / OIDC| SPA
    Dashboard <-->|Get Tokens| SPA
    UsersAPI <-->|Validate JWT| API_RS

    style Auth0 fill:#eb5424,color:#fff
    style Cloudflare fill:#f38020,color:#fff
    style DO fill:#0080ff,color:#fff
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

### Infrastructure

| Component | Provider | Purpose |
|-----------|----------|---------|
| App Platform | DigitalOcean | Hosting (static sites + Docker services) |
| DNS + CDN | Cloudflare | Domain routing, SSL, caching |
| Authentication | Auth0 | OAuth 2.0 / OIDC identity provider |
| IaC | Pulumi (TypeScript) | Infrastructure as Code |

### Monorepo Structure

```
mattbutlerengineering/
├── apps/
│   ├── web/              # Public website
│   └── dashboard/        # Authenticated dashboard
├── services/
│   └── users/            # Users API (Fastify)
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── auth/             # Auth utilities (React + Fastify)
│   └── config/           # Shared ESLint/TypeScript config
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

## URLs

| Environment | URL |
|-------------|-----|
| Production | https://mattbutlerengineering.com |
| Dashboard | https://mattbutlerengineering.com/dashboard |
| API | https://mattbutlerengineering.com/api |
| DO Direct | https://mattbutlerengineering-8ryim.ondigitalocean.app |
| Auth0 | https://dev-ytbgmz5ls3wh4xdx.us.auth0.com |
