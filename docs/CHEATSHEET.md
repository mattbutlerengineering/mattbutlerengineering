# Code Cheatsheet

Reusable patterns and snippets for the MBE platform.

---

## Rate Limiting with Redis

A simple sliding window rate limiter using Redis. Apply selectively to sensitive routes.

### Implementation

```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';

const redisClient = createClient();
redisClient.connect();

const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_REQUESTS = 10;

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip; // The unique "key" for this user
  const key = `rate-limit:${ip}`;

  try {
    // 1. Increment the count for this IP
    const currentCount = await redisClient.incr(key);

    // 2. If it's the very first hit, set the "Clear" timer (TTL)
    if (currentCount === 1) {
      await redisClient.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    // 3. Check if they've crossed the line
    if (currentCount > MAX_REQUESTS) {
      return res.status(429).json({
        error: 'Too many requests. Please try again in a minute.',
        retryAfter: await redisClient.ttl(key) // Tell them exactly how long to wait
      });
    }

    // 4. If all is well, move to the next middleware/route
    next();
  } catch (err) {
    // If Redis is down, we usually "fail open" (let the request through)
    // so the app doesn't break for everyone.
    console.error('Redis Rate Limiter Error:', err);
    next();
  }
};
```

### Usage

Apply selectively to sensitive routes (login, signup, password reset):

```typescript
// Apply it ONLY to sensitive routes (like login)
app.post('/api/login', rateLimiter, (req, res) => {
  res.send("Authenticated!");
});

// Public routes stay fast and don't hit Redis
app.get('/api/blog', (req, res) => {
  res.send("Public content");
});
```

### Key Points

- **Sliding window**: Each request increments counter, TTL resets window
- **Fail open**: If Redis is down, requests pass through (availability > security for most cases)
- **429 response**: Returns `retryAfter` header so clients know when to retry
- **Per-IP limiting**: Uses `req.ip` as the key; can be changed to user ID for authenticated routes

---

## Circuit Breaker with Opossum

Prevents cascading failures by stopping calls to failing services. Uses the [opossum](https://github.com/nodeshift/opossum) library.

### Implementation

```typescript
import CircuitBreaker from 'opossum';

// 1. The "Protected" Function
// This represents your call to a service or a slow DB query
async function callExternalService(data: any) {
  // Logic that might fail (e.g., axios.post(...) or sequelize.query(...))
  if (Math.random() > 0.8) throw new Error("Service Failure");
  return "Success";
}

// 2. Circuit Breaker Options
const options = {
  timeout: 3000, // If the function takes > 3s, count it as a failure
  errorThresholdPercentage: 50, // Trip if 50% of requests fail
  resetTimeout: 30000 // Wait 30s before trying again (Half-Open state)
};

// 3. Initialize the Breaker
const breaker = new CircuitBreaker(callExternalService, options);

// 4. Usage in Express Middleware/Route
export const protectedRoute = async (req: Request, res: Response) => {
  try {
    // Instead of calling the function directly, we use breaker.fire()
    const result = await breaker.fire(req.body);
    res.json({ result });
  } catch (error) {
    // If the circuit is OPEN, this triggers immediately
    if (breaker.opened) {
      return res.status(503).json({
        error: "Service temporarily unavailable. Circuit is Open.",
        hint: "We stopped trying to hit the failing service to save resources."
      });
    }

    res.status(500).json({ error: "Standard server error" });
  }
};

// 5. Monitoring (Crucial for Operational Excellence)
breaker.on('open', () => console.warn('ALERT: Circuit to ExternalService is OPEN!'));
breaker.on('halfOpen', () => console.info('Circuit is checking for recovery...'));
breaker.on('close', () => console.info('Circuit is CLOSED. Normal operations resumed.'));
```

### Circuit States

```
CLOSED ──(failures exceed threshold)──> OPEN
   ↑                                      │
   │                                      │ (resetTimeout expires)
   │                                      ↓
   └───────(test request succeeds)─── HALF-OPEN
                                          │
                                          │ (test request fails)
                                          ↓
                                        OPEN
```

### Key Points

- **Fail fast**: When circuit is OPEN, requests fail immediately without hitting the service
- **Self-healing**: After `resetTimeout`, circuit enters HALF-OPEN and tests if service recovered
- **Threshold-based**: Opens only after `errorThresholdPercentage` failures (not on first error)
- **Timeout protection**: Slow responses count as failures, preventing thread exhaustion

---

## Circuit Breaker with Retry

Combines circuit breaker with exponential backoff retry. Retries transient failures before tripping the circuit.

### Implementation

```typescript
import CircuitBreaker from 'opossum';
import retry from 'async-retry';

async function callExternalService(data: any) {
  // Your actual API/DB call logic
  // e.g., await axios.post('https://api.example.com/v1/data', data);
}

const breakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};

// We wrap the function to include retry logic
const functionWithRetry = async (data: any) => {
  return await retry(
    async (bail) => {
      try {
        return await callExternalService(data);
      } catch (error: any) {
        // If it's a 401 or 404, don't bother retrying (bail out)
        if (error.status === 401 || error.status === 404) {
          bail(error);
          return;
        }
        // Otherwise, throw and let it retry
        throw error;
      }
    },
    {
      retries: 3, // Try 3 times total
      minTimeout: 1000, // Wait 1s, then 2s, then 4s...
      onRetry: (error, attempt) => {
        console.warn(`Retry attempt ${attempt} failed: ${error.message}`);
      }
    }
  );
};

const breaker = new CircuitBreaker(functionWithRetry, breakerOptions);

// Usage in route:
// await breaker.fire(payload);
```

### Request Flow

```
Request
   │
   ▼
┌─────────────────┐
│ Circuit Breaker │──(OPEN)──> 503 Service Unavailable
└────────┬────────┘
         │ (CLOSED/HALF-OPEN)
         ▼
┌─────────────────┐
│  Retry Logic    │
│  (3 attempts)   │
│  1s → 2s → 4s   │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
 Success    Failure
    │         │
    ▼         ▼
  200 OK   Circuit counts failure
           (may trip to OPEN)
```

### Key Points

- **Retry first, then circuit**: Retries handle transient blips; circuit handles sustained outages
- **Bail on permanent errors**: 401/404 skip retries (no point retrying auth failures)
- **Exponential backoff**: `minTimeout` doubles each retry (1s, 2s, 4s)
- **Combined timeout**: Circuit's 5s timeout applies to entire retry sequence

---
