# Users Service

Fastify + Prisma service for user management. Port **3001**.

## Domain Model

### User Entity

```typescript
interface User {
  id: string; // UUID, primary key
  email: string; // Unique, used for login
  name: string | null; // Display name
  picture: string | null; // Avatar URL
  emailVerified: boolean; // Email verification status
  preferences: UserPreferences; // JSON object
  createdAt: Date;
  updatedAt: Date;
}

interface UserPreferences {
  theme: "light" | "dark" | "system";
  timezone: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  defaultVenueId?: string;
}
```

### Database Schema

```prisma
model User {
  id            String          @id @default(uuid())
  email         String          @unique
  name          String?
  picture       String?
  emailVerified  Boolean         @default(false)
  preferences   Json            @default("{}")
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@map("users")
}
```

### Entity Relationships

```
User (1) ──────< Venue (many, via VenueGroup)
              │
              └────< Reservations (many, via guestId)
```

## Structure

```
src/
├── app.ts          # Fastify app builder (plugins, routes, schemas)
├── index.ts        # Entry point (starts server)
├── routes/
│   ├── health.ts   # GET /health, GET /api/v1/users/health
│   └── users.ts    # User CRUD endpoints
├── schemas/
│   └── index.ts    # JSON Schema definitions with $id refs
├── services/
│   └── database.ts # Prisma client singleton
└── generated/      # Prisma client (gitignored, run db:generate)
```

## API Routes

### Health Check

| Method | Path                   | Description                             |
| ------ | ---------------------- | --------------------------------------- |
| GET    | `/health`              | Internal health check (DO App Platform) |
| GET    | `/api/v1/users/health` | Public health endpoint                  |

**Response:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "apiVersion": "v1",
  "successorVersion": "v2",
  "timestamp": "2026-04-04T00:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "latency": 5 }
  }
}
```

### User Management

| Method | Path                           | Description                | Auth     |
| ------ | ------------------------------ | -------------------------- | -------- |
| GET    | `/api/v1/users/me`             | Get current user profile   | Required |
| PUT    | `/api/v1/users/me`             | Update profile             | Required |
| PUT    | `/api/v1/users/me/preferences` | Update preferences         | Required |
| POST   | `/api/v1/users/me/preferences` | Partial preferences update | Required |

**GET /api/v1/users/me Response:**

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://...",
    "emailVerified": true,
    "preferences": {
      "theme": "dark",
      "timezone": "America/New_York"
    }
  },
  "meta": {
    "timestamp": "2026-04-04T00:00:00.000Z"
  }
}
```

**PUT /api/v1/users/me Request:**

```json
{
  "name": "Jane Doe",
  "picture": "https://..."
}
```

## Integration Points

### Auth0 Integration

```
Auth0 ──(ROPC/PKCE)──> Hospitality UI ──(JWT)──> Users Service
                                            │
                                            └── Verify JWT
                                                │
                                                └── @mbe/auth plugin
```

### JWT Verification

```typescript
// Route handler with auth
fastify.get(
  "/api/v1/users/me",
  {
    preHandler: [fastify.requireAuth],
    schema: {
      /* ... */
    },
  },
  async (request) => {
    const userId = request.user.sub; // From verified JWT
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return { data: user };
  }
);
```

### API Client Usage

```typescript
// From hospitality app
const user = await api.users.getProfile(accessToken);

// From @mbe/api-client
import { createApiClient } from "@mbe/api-client";

const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  getAccessToken: () => accessToken,
});

const profile = await api.users.me();
```

## Error Handling

### Standard Error Response

```typescript
interface ApiError {
  error: string; // Error code (e.g., "NOT_FOUND")
  message: string; // Human-readable message
  statusCode: number;
  details?: Record<string, unknown>;
}
```

### Error Codes

| Code               | HTTP Status | Description                            |
| ------------------ | ----------- | -------------------------------------- |
| `UNAUTHORIZED`     | 401         | Missing or invalid JWT                 |
| `FORBIDDEN`        | 403         | Valid JWT but insufficient permissions |
| `NOT_FOUND`        | 404         | User not found                         |
| `VALIDATION_ERROR` | 422         | Invalid request body                   |
| `INTERNAL_ERROR`   | 500         | Server error                           |

### Error Response Example

```json
{
  "error": "NOT_FOUND",
  "message": "User with id '123' not found",
  "statusCode": 404
}
```

## Testing Patterns

### Route Testing with app.inject()

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../app.js";

vi.mock("../services/database.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("GET /api/v1/users/me", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns user with valid auth", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: `Bearer ${generateTestToken()}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: mockUser,
    });
  });
});
```

### Mocking Auth

```typescript
vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn().mockImplementation(async (app) => {
    app.decorateRequest("user", {
      sub: "test-user-id",
      email: "test@example.com",
    });
  }),
  getAuthPluginOptionsFromEnv: () => ({}),
}));
```

## Environment Variables

| Variable         | Required   | Default | Description                |
| ---------------- | ---------- | ------- | -------------------------- |
| `PORT`           | No         | 3001    | Service port               |
| `LOG_LEVEL`      | No         | info    | Logging level              |
| `CORS_ORIGIN`    | No         | `*`     | Allowed CORS origins       |
| `AUTH_AUTHORITY` | Yes (prod) | —       | Auth0 domain URL           |
| `AUTH_AUDIENCE`  | Yes (prod) | —       | Auth0 API identifier       |
| `DATABASE_URL`   | Yes        | —       | Postgres connection string |

## Commands

```bash
pnpm dev              # Hot-reload dev server (port 3001)
pnpm build            # Compile TypeScript
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm lint             # ESLint
pnpm typecheck        # TypeScript type check
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema (dev only)
pnpm db:migrate       # Create + apply migrations
pnpm db:studio        # Open Prisma Studio
```

## Health Check

The service exposes two health endpoints:

1. **Internal** (`/health`): Used by DO App Platform for container health checks
2. **Public** (`/api/v1/users/health`): For external monitoring and synthetic checks

Both return the same structure including database connectivity status.

## Related Documentation

- [Auth Package Skill](../packages/auth/SKILL.md)
- [API Versioning](../docs/API-VERSIONING.md)
- [Cross-Service Flows](../docs/CROSS-SERVICE-FLOWS.md)
