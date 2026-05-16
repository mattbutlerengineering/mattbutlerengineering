---
name: reservations-service
description: This skill should be used when the user asks to "add an endpoint to reservations", "create a route in reservations service", "write tests for reservations", "test reservations service", "add a table endpoint", "work on reservations API", or mentions the reservations service, table management, or reservation functionality.
---

# Reservations Service Development Skill

This skill provides patterns and workflows for developing the Reservations Service, a Fastify-based REST API at `services/reservations/` that handles restaurant table reservations with Auth0 authentication and Prisma ORM.

## Service Overview

**Location**: `services/reservations/`
**Framework**: Fastify v5 with TypeScript
**Database**: PostgreSQL via Prisma
**Auth**: Auth0 JWT verification with jose
**Port**: 3002 (API docs at http://localhost:3002/docs)

### Key Files

| File | Purpose |
|------|---------|
| `src/app.ts` | Fastify app setup, plugin registration |
| `src/routes/tables.ts` | Table CRUD endpoints (create/update require auth) |
| `src/routes/reservations.ts` | Reservation CRUD endpoints |
| `src/services/table.ts` | Table business logic (Prisma operations) |
| `src/services/reservation.ts` | Reservation business logic |
| `src/schemas/index.ts` | OpenAPI schema definitions |
| `prisma/schema.prisma` | Database schema |

## Adding New Endpoints

### Route Structure Pattern

Follow this pattern when adding new routes:

```typescript
fastify.get<{
  Params: { id: string };           // URL params
  Querystring: { page?: string };   // Query params
  Body: CreateReservationRequest;   // Request body
  Reply: ApiResponse<Reservation> | ApiError;  // Response types
}>(
  "/endpoint-path",
  {
    preHandler: verifyAuth,  // Add for protected routes
    schema: {
      summary: "Short action description",
      operationId: "uniqueOperationName",
      description: "Detailed description for API docs.",
      tags: ["Reservations"],  // or "Tables"
      security: [{ bearerAuth: [] }],  // Add for auth routes
      params: { /* JSON Schema */ },
      body: { /* JSON Schema */ },
      response: {
        200: {
          description: "Success case",
          type: "object",
          properties: {
            data: { $ref: "Reservation#" },  // Reference shared schemas
          },
        },
        404: { $ref: "Error#" },
      },
    },
  },
  async (request, reply) => {
    // Implementation
  }
);
```

### Protected vs Optional Auth

This service uses two auth patterns:

**Required Auth** (tables create/update/delete):
```typescript
fastify.post<{ Body: CreateTableRequest; Reply: ApiResponse<Table> | ApiError }>(
  "/",
  {
    preHandler: verifyAuth,  // Requires valid JWT
    schema: {
      security: [{ bearerAuth: [] }],
      // ...
    },
  },
  async (request, reply) => {
    // request.user is guaranteed
  }
);
```

**Optional Auth** (reservations create):
```typescript
fastify.post<{ Body: CreateReservationRequest; Reply: ApiResponse<Reservation> }>(
  "/",
  {
    preHandler: optionalAuth,  // JWT optional
    schema: {
      // No security field - auth is optional
    },
  },
  async (request, reply) => {
    const userId = request.user?.id;  // May be undefined for guests
    const reservation = await reservationService.create(request.body, userId);
  }
);
```

### Adding Service Methods

Add business logic to `src/services/table.ts` or `src/services/reservation.ts`:

```typescript
// In reservation.ts
async getByDateRange(
  startDate: string,
  endDate: string
): Promise<Reservation[]> {
  const reservations = await prisma.reservation.findMany({
    where: {
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
    include: { table: true },
  });
  return reservations.map(mapPrismaReservation);
}
```

### Shared Types

Import types from `@mbe/types`:

```typescript
import type {
  Reservation,
  Table,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
  CreateTableRequest,
  UpdateTableRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
```

## Testing

### Test Commands

```bash
cd services/reservations

pnpm test                              # Run all tests
pnpm test:watch                        # Watch mode
pnpm test:coverage                     # Coverage report
npx vitest run src/routes/tables.test.ts  # Single file
npx vitest --grep "POST /v1/tables"    # Match pattern
```

### Test Structure Pattern

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { tableService } from "../services/table.js";
import { reservationService } from "../services/reservation.js";
import { jwtVerify } from "jose";

// Mock all services
vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    listByUserId: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("../services/database.js", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

const mockJWTPayload = {
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  email_verified: true,
};

describe("Table Routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("creates table with valid auth", async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: mockJWTPayload,
      protectedHeader: { alg: "RS256" },
    } as never);
    vi.mocked(tableService.create).mockResolvedValueOnce(mockTable);

    const response = await app.inject({
      method: "POST",
      url: "/v1/tables",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Table 1", capacity: 4 },
    });

    expect(response.statusCode).toBe(201);
  });
});
```

## Database Schema

Current models in `prisma/schema.prisma`:

```prisma
enum ReservationStatus {
  PENDING
  CONFIRMED
  CANCELLED
  COMPLETED
  NO_SHOW
}

model Table {
  id           String        @id @default(cuid())
  name         String        @unique
  capacity     Int
  location     String?
  isActive     Boolean       @default(true)
  venueId      String?       // Ready for multi-venue support
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  reservations Reservation[]
}

model Reservation {
  id         String            @id @default(cuid())
  date       DateTime          @db.Date
  startTime  DateTime
  endTime    DateTime
  partySize  Int
  status     ReservationStatus @default(PENDING)
  notes      String?
  guestName  String?
  guestEmail String?
  guestPhone String?
  userId     String?
  tableId    String
  table      Table             @relation(fields: [tableId], references: [id])
  venueId    String?           // Denormalized for venue+date queries
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
}
```

**Note**: The `venueId` field on both models is nullable and ready for future multi-venue support. When venues are implemented, this will link to a Venue model. The denormalized `venueId` on Reservation allows efficient queries like "all reservations for venue X on date Y" without joins.

For schema changes, use the `prisma-migrations` skill.

## API Endpoints Reference

### Tables

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/tables` | No | List tables (paginated, filter by activeOnly) |
| GET | `/v1/tables/:id` | No | Get table by ID |
| POST | `/v1/tables` | Yes | Create table |
| PATCH | `/v1/tables/:id` | Yes | Update table |
| DELETE | `/v1/tables/:id` | Yes | Delete table |

### Reservations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/reservations` | No | List reservations (filter by date/status/tableId/venueId) |
| GET | `/v1/reservations/me` | Yes | Get current user's reservations |
| GET | `/v1/reservations/:id` | No | Get reservation by ID |
| POST | `/v1/reservations` | Optional | Create reservation (guest or user) |
| PATCH | `/v1/reservations/:id` | No | Update reservation |
| DELETE | `/v1/reservations/:id` | No | Cancel reservation (sets status to CANCELLED) |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |

## Common Development Tasks

### Start Development Server

```bash
cd services/reservations
pnpm dev
```

### Check Code Quality

```bash
pnpm lint      # ESLint
pnpm typecheck # TypeScript
```

### Open API Docs

Navigate to http://localhost:3002/docs for interactive Scalar API documentation.

### Database Operations

```bash
pnpm db:studio     # Visual database browser
pnpm db:push       # Quick schema sync (dev only)
pnpm db:migrate    # Create migration (see prisma-migrations skill)
```

## Guest vs User Reservations

The service supports both authenticated and guest reservations:

**Guest Reservation** (no auth):
```json
{
  "date": "2026-02-15",
  "startTime": "2026-02-15T18:00:00Z",
  "endTime": "2026-02-15T20:00:00Z",
  "partySize": 4,
  "tableId": "table-id",
  "guestName": "John Doe",
  "guestEmail": "john@example.com",
  "guestPhone": "+1-555-123-4567"
}
```

**User Reservation** (with auth):
```json
{
  "date": "2026-02-15",
  "startTime": "2026-02-15T18:00:00Z",
  "endTime": "2026-02-15T20:00:00Z",
  "partySize": 4,
  "tableId": "table-id",
  "notes": "Birthday celebration"
}
```

When authenticated, the `userId` is automatically set from the JWT.

## Error Response Format

All errors follow this structure:

```typescript
{
  error: "Not Found",
  message: "Reservation not found",
  statusCode: 404
}
```

## Quick Checklist for New Endpoints

1. [ ] Add TypeScript types for Params/Body/Reply
2. [ ] Include OpenAPI schema with summary, description, tags
3. [ ] Add `preHandler: verifyAuth` or `optionalAuth` as needed
4. [ ] Add `security: [{ bearerAuth: [] }]` if auth required
5. [ ] Handle all error cases (400, 401, 404, 500)
6. [ ] Add service method if new business logic needed
7. [ ] Write tests with mocked service layer
8. [ ] Run `pnpm test` and `pnpm typecheck`
