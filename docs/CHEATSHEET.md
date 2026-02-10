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
