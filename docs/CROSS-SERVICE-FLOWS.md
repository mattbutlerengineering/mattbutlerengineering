# Cross-Service Workflows

End-to-end flow documentation for operations that span multiple services.

---

## 1. Walk-in Creation

**Flow:** Hospitality UI → Reservations API → SSE broadcast → UI update

### Sequence Diagram

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ Hospitality │     │ Reservations API │     │  SSE Broadcast       │     │ All Clients │
│    UI       │     │   (Port 3004)    │     │  /api/v1/events     │     │             │
└──────┬──────┘     └────────┬────────┘     └──────────┬──────────┘     └──────┬──────┘
       │                       │                          │                       │
       │ POST /api/v1/reservations│                          │                       │
       │───────────────────────│                          │                       │
       │                       │                          │                       │
       │                       │ Create reservation        │                       │
       │                       │ in database              │                       │
       │                       │──────────┐               │                       │
       │                       │          │               │                       │
       │                       │<─────────┘               │                       │
       │                       │                          │                       │
       │                       │  Emit event              │                       │
       │                       │─────────────────────────>│                       │
       │                       │                          │                       │
       │                       │                          │ event:created         │
       │                       │                          │───────────────────────>
       │                       │                          │                       │
       │                       │                          │                       │
       │<──────────────────────│ 201 Created             │                       │
       │  { reservation }      │                          │                       │
       │                       │                          │                       │
```

### Data Payload

```typescript
// POST /api/v1/reservations
interface CreateReservationRequest {
  venueId: string;
  tableId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  startTime: string; // ISO 8601
  partySize: number;
  notes?: string;
}

// SSE Event: reservation:created
interface ReservationCreatedEvent {
  type: "reservation:created";
  id: string;          // event sequence number
  timestamp: string;    // ISO 8601
  data: {
    id: string;
    venueId: string;
    tableId: string;
    guestName: string;
    startTime: string;
    partySize: number;
    status: "PENDING" | "CONFIRMED";
  };
}
```

### Error Scenarios

| Error | Cause | Recovery |
|-------|-------|----------|
| 409 Conflict | Table already booked | Retry with different time/table |
| 422 Unprocessable | Invalid date/time | User corrects input |
| 503 Unavailable | Service down | Retry with exponential backoff |

### Retry Behavior

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1s base, exponential backoff

async function createReservation(request: CreateReservationRequest) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await api.reservations.create(request);
      return response.data;
    } catch (error) {
      if (error.status === 503 && attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}
```

---

## 2. Agent Session Lifecycle

**Flow:** CLI → Agent API → worktree → GitHub PR

### Sequence Diagram

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────┐     ┌─────────┐
│  CLI    │     │ Agent API   │     │ Agent Core   │     │ Git      │     │ GitHub  │
│(mbe)    │     │ (Port 3003) │     │ Package      │     │ Worktree │     │         │
└────┬────┘     └──────┬──────┘     └──────┬───────┘     └────┬─────┘     └────┬────┘
     │                  │                     │                  │               │
     │ mbe agent run    │                     │                  │               │
     │─────────────────>│                     │                  │               │
     │                  │                     │                  │               │
     │                  │ POST /v1/sessions  │                  │               │
     │                  │───────────────────>│                  │               │
     │                  │                    │                  │               │
     │                  │                    │ Create worktree   │               │
     │                  │                    │─────────────────>│               │
     │                  │                    │                  │               │
     │                  │                    │                  │ git worktree │
     │                  │                    │                  │ add          │
     │                  │                    │                  │──────────────>
     │                  │                    │                  │               │
     │                  │                    │ <SSE stream>      │               │
     │                  │                    │───────────────────│               │
     │                  │                    │                  │               │
     │                  │ 201 Created        │                  │               │
     │                  │ { sessionId }      │                  │               │
     │<─────────────────│                    │                  │               │
     │                  │                    │                  │               │
     │                  │                    │                  │               │
     │                  │                    │                  │ git push      │
     │                  │                    │                  │──────────────>
     │                  │                    │                  │               │
     │                  │                    │                  │               │
     │                  │                    │                  │ Create PR     │
     │                  │                    │                  │───────────────>
     │                  │                    │                  │               │
```

### Data Payload

```typescript
// POST /v1/sessions
interface CreateAgentSessionRequest {
  task: string;              // Task description
  model?: string;             // claude-sonnet-4-6 (default)
  maxBudget?: number;         // USD, default 1.00
  maxTurns?: number;          // default 50
  createPR?: boolean;         // default true
}

// SSE Events
interface SessionStartedEvent {
  type: "session:started";
  sessionId: string;
  task: string;
}

interface SessionCompletedEvent {
  type: "session:completed";
  sessionId: string;
  status: "succeeded" | "failed" | "cancelled";
  prUrl?: string;
  prNumber?: number;
  totalCostUsd: number;
  totalTurns: number;
}
```

### Error Scenarios

| Error | Cause | Recovery |
|-------|-------|----------|
| 400 Bad Request | Invalid task | User corrects task description |
| 401 Unauthorized | Invalid/missing token | Re-authenticate |
| 429 Rate Limited | Too many sessions | Wait and retry |
| 500 Internal Error | Worktree creation failed | Check disk space, retry |

---

## 3. Auth Token Flow

**Flow:** Auth0 → Frontend → API Gateway → Service JWT verification

### Sequence Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Auth0    │     │ Hospitality │     │ Edge Router     │     │ Service     │
│  (OIDC)    │     │    UI       │     │ (CF Worker)     │     │ (Fastify)   │
└──────┬──────┘     └──────┬──────┘     └────────┬────────┘     └──────┬──────┘
       │                    │                       │                      │
       │ 1. Login/Redirect │                       │                      │
       │<──────────────────│                       │                      │
       │                   │                        │                      │
       │                   │ 2. Auth Code           │                      │
       │─────────────────>│                       │                      │
       │                   │                        │                      │
       │                   │ 3. Exchange code       │                      │
       │                   │ for tokens            │                      │
       │                   │──────────────────────>│                      │
       │                   │                        │                      │
       │                   │ 4. JWT Access Token    │                      │
       │                   │<──────────────────────│                      │
       │                   │                        │                      │
       │                   │ 5. API Request + JWT  │                      │
       │                   │───────────────────────>│                      │
       │                   │                        │                      │
       │                   │                        │ 6. Verify JWT        │
       │                   │                        │──────────────────────>
       │                   │                        │                      │
       │                   │                        │ 7. 200 OK / 401      │
       │                   │                        │<──────────────────────│
       │                   │                        │                      │
```

### Token Verification

```typescript
// Service middleware (from @mbe/auth/fastify)
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL(`${AUTH_AUTHORITY}/.well-known/jwks.json`)
);

async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: AUTH_AUTHORITY,
    audience: AUTH_AUDIENCE, // https://api.mattbutlerengineering.com
  });
  
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    permissions: (payload.permissions as string[]) ?? [],
  };
}
```

### JWT Claims

```typescript
interface JWTPayload {
  iss: string;           // https://mattbutlerengineering.auth0.com/
  sub: string;          // User ID
  aud: string[];        // [https://api.mattbutlerengineering.com]
  exp: number;          // Expiration timestamp
  iat: number;          // Issued at timestamp
  scope: string;        // Space-separated permissions
  permissions: string[];
  email?: string;
  email_verified?: boolean;
}
```

### Error Scenarios

| Error | Cause | Recovery |
|-------|-------|----------|
| 401 Unauthorized | Token expired | Refresh token or re-login |
| 403 Forbidden | Insufficient permissions | Request additional scopes |
| 401 Invalid | Token malformed | Clear tokens and re-login |

---

## 4. Real-time Sync (SSE)

**Flow:** Reservations mutation → SSE event → all connected clients

### Sequence Diagram

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ Hospitality │     │ Reservations API │     │  SSE Event Broadcaster│     │ Client 1..N│
│    UI       │     │                 │     │                     │     │             │
└──────┬──────┘     └────────┬────────┘     └──────────┬──────────┘     └──────┬──────┘
       │                       │                          │                       │
       │ PUT /api/v1/reservations/:id│                       │                       │
       │───────────────────────>│                          │                       │
       │                       │                          │                       │
       │                       │ Update database          │                       │
       │                       │──────────┐               │                       │
       │                       │          │               │                       │
       │                       │<─────────┘               │                       │
       │                       │                          │                       │
       │                       │ Emit SSE event          │                       │
       │                       │────────────────────────>│                       │
       │                       │                          │                       │
       │                       │                          │ Broadcaster sends     │
       │                       │                          │ to all connections    │
       │                       │                          │                       │
       │                       │                          │ event:updated         │
       │                       │                          │───────────────────────>
       │                       │                          │                       │
       │                       │                          │                       │
       │<──────────────────────│ 200 OK                  │                       │
       │                       │                          │                       │
```

### SSE Connection Setup

```typescript
// Client-side (from useReservationEvents.ts)
const eventSource = new EventSource(
  `/api/v1/events/stream?venueId=${venueId}`,
  {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case "reservation:created":
      onReservationCreated(data.data);
      break;
    case "reservation:updated":
      onReservationUpdated(data.data);
      break;
    case "reservation:cancelled":
      onReservationCancelled(data.data);
      break;
  }
};
```

### Event Types

```typescript
type ReservationEvent = 
  | { type: "reservation:created"; id: string; data: Reservation }
  | { type: "reservation:updated"; id: string; data: Reservation }
  | { type: "reservation:cancelled"; id: string; data: Reservation }
  | { type: "table:updated"; id: string; data: Table }
  | { type: "hold:created"; id: string; data: ReservationHold }
  | { type: "hold:released"; id: string; data: ReservationHold }
  | { type: "hold:confirmed"; id: string; data: Reservation };
```

### Error Scenarios

| Error | Cause | Recovery |
|-------|-------|----------|
| Connection lost | Network issue | Auto-reconnect with exponential backoff |
| 401 Unauthorized | Token expired | Refresh connection with new token |
| 503 Service Unavailable | Backend down | Retry with backoff, show "offline" indicator |

### Reconnection Pattern

```typescript
const MAX_BACKOFF = 30000; // 30 seconds

function connect(attempt = 0) {
  const eventSource = new EventSource(url, { headers });
  
  eventSource.onerror = () => {
    eventSource.close();
    
    const delay = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF);
    setTimeout(() => connect(attempt + 1), delay);
  };
}
```

---

## 5. Booking Widget Flow

**Flow:** Guest → Booking Widget → API → Confirmation Email

### Sequence Diagram

```
┌─────────┐     ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Guest  │     │  Booking    │     │ Reservations API│     │   Email     │
│ Browser │     │   Widget    │     │   (Port 3004)   │     │   Service   │
└────┬────┘     └──────┬──────┘     └────────┬────────┘     └──────┬──────┘
     │                  │                       │                       │
     │ 1. Load widget  │                       │                       │
     │    (embed)      │                       │                       │
     │<────────────────│                       │                       │
     │                  │                       │                       │
     │ 2. Get timeslots│                       │                       │
     │─────────────────>│                       │                       │
     │                  │ GET /availability     │                       │
     │                  │─────────────────────>│                       │
     │                  │                       │                       │
     │                  │ 3. Available times   │                       │
     │                  │<─────────────────────│                       │
     │                  │                       │                       │
     │ 4. Select time  │                       │                       │
     │<────────────────│                       │                       │
     │                  │                       │                       │
     │ 5. Submit form  │                       │                       │
     │─────────────────>│                       │                       │
     │                  │ POST /holds          │                       │
     │                  │─────────────────────>│                       │
     │                  │                       │                       │
     │                  │ 6. Hold created      │                       │
     │                  │<─────────────────────│                       │
     │                  │                       │                       │
     │ 7. Confirm      │                       │                       │
     │─────────────────>│                       │                       │
     │                  │ PUT /holds/:id/confirm                       │
     │                  │─────────────────────>│                       │
     │                  │                       │                       │
     │                  │                       │ POST /email/confirmation
     │                  │                       │───────────────────────>
     │                  │                       │                       │
     │                  │ 8. Reservation created│                       │
     │                  │<─────────────────────│                       │
     │                  │                       │                       │
     │ 9. Confirmation │                       │                       │
     │    displayed    │                       │                       │
     │<────────────────│                       │                       │
```

### Data Flow

```typescript
// 1. Get availability
interface AvailabilityQuery {
  venueId: string;
  date: string;      // YYYY-MM-DD
  partySize: number;
}

interface TimeSlot {
  time: string;      // HH:mm
  tableId: string;
  available: boolean;
}

// 2. Create hold (5-minute expiration)
interface CreateHoldRequest {
  venueId: string;
  tableId: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
}

interface ReservationHold {
  id: string;
  expiresAt: string;  // 5 minutes from creation
}

// 3. Confirm hold
interface ConfirmHoldRequest {
  holdId: string;
  notes?: string;
}

interface Reservation {
  id: string;
  confirmationCode: string;
  status: "CONFIRMED";
  venueId: string;
  tableId: string;
  guestName: string;
  guestEmail: string;
  startTime: string;
  partySize: number;
}
```

### Error Scenarios

| Error | Cause | Recovery |
|-------|-------|----------|
| Slot taken | Another guest grabbed it | Show error, refresh availability |
| Hold expired | 5-minute timeout | Create new hold |
| Invalid email | Email validation failed | Show validation error |
| Venue closed | Outside operating hours | Show "closed" message |

---

## Common Error Handling Patterns

### Retry with Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const isRetryable = error.status >= 500 || error.status === 429;
      if (!isRetryable) throw error;
      
      await delay(baseDelay * Math.pow(2, attempt));
    }
  }
  throw new Error("Unreachable");
}
```

### Circuit Breaker

For critical services, implement circuit breaker pattern:

1. **Closed**: Normal operation, requests pass through
2. **Open**: Failures exceeded threshold, requests fail fast
3. **Half-Open**: Test if service recovered

```typescript
class CircuitBreaker {
  failures = 0;
  lastFailure = 0;
  state: "closed" | "open" | "half-open" = "closed";
  
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > 30000) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker open");
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```
