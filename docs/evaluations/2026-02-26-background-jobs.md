# Background Jobs & Task Queue Evaluation — February 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Job queue** | None |
| **Scheduled tasks** | None |
| **Email reminders** | Not implemented (venue settings exist: `reminderEmailEnabled`) |
| **Background processing** | None — all operations are synchronous request/response |

### Why This Matters Now

The Email/SMS evaluation recommends Resend for reservation confirmations and reminders. Reminder emails require scheduling: "send email 24 hours before reservation." This needs a job queue or scheduler — the reservation service can't hold a setTimeout for 24 hours.

### Use Cases (Priority Order)

1. **Reservation reminder emails** — scheduled X hours before reservation time
2. **Retry failed email sends** — exponential backoff on transient failures
3. **Reservation status transitions** — auto-expire holds after `holdDurationMinutes`
4. **Future: SMS reminders** — same scheduling pattern as email
5. **Future: Analytics aggregation** — nightly rollups, report generation

---

## Provider Profiles

### 1. BullMQ (Recommended)

Open-source Redis-based queue for Node.js. The standard for background jobs in the Node.js ecosystem. MIT licensed.

| Criterion | Details |
|-----------|---------|
| **License** | MIT (free, no artificial limits) |
| **Pro version** | $95/mo — batch processing, rate limiting per group (not needed at this scale) |
| **Runtime** | Node.js, Python, Elixir, PHP |
| **TypeScript** | Native — written in TypeScript |
| **Requires** | Redis 6.2+ (or Valkey, or Dragonfly) |
| **Features** | Delayed jobs, repeatable/cron jobs, retries with backoff, priorities, concurrency control, job progress tracking |
| **Dashboard** | [Bull Board](https://github.com/felixmosh/bull-board) (open source) or Taskforce.sh (paid) |
| **Fastify integration** | `@bull-board/fastify` adapter |
| **Self-hosted** | Yes — you manage Redis |
| **Managed option** | Use with Upstash Redis ($0 free tier) or any managed Redis |

**Key strength:** BullMQ is the Node.js ecosystem standard. Massive community, battle-tested at scale, excellent TypeScript support, and zero vendor lock-in. The delayed job feature is exactly what reservation reminders need:

```typescript
await emailQueue.add("send-reminder", { reservationId }, {
  delay: reminderTime.getTime() - Date.now(), // milliseconds until send
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
});
```

**Redis requirement:** BullMQ needs Redis. Options for this project:
- **Upstash Redis** — serverless, $0 free tier (10K requests/day), pay-as-you-go after
- **DigitalOcean Managed Redis** — $15/mo (1 GB, production-ready)
- **Docker Compose** — local development (already have Docker Compose for Postgres)

---

### 2. Trigger.dev

Open-source background job platform with managed cloud. TypeScript-first. Apache 2.0 licensed.

| Criterion | Details |
|-----------|---------|
| **License** | Apache 2.0 |
| **Free tier** | $5/mo usage free; 10,000 runs/month; 5 concurrent runs |
| **Pricing** | Pay-as-you-go based on compute time |
| **Runtime** | Node.js / TypeScript only |
| **Requires** | Trigger.dev cloud or self-hosted (Docker: webapp + Redis + Postgres + worker) |
| **Features** | Scheduled tasks, retries, observability dashboard, native integrations (Resend, Stripe) |
| **Self-hosted** | Yes — Docker, but requires webapp + Redis + Postgres + worker infrastructure |

**Key strength:** Built-in observability (logs, traces, job history) and native Resend integration. The dashboard is excellent for debugging.

**Key weakness for this project:** The self-hosted deployment is complex (4+ containers). The cloud version adds a vendor dependency for what is fundamentally a simple "schedule email, send at time" operation. The free tier's 10,000 runs/month is generous but creates a ceiling. BullMQ has no ceiling — it's a library, not a service.

---

### 3. Node-cron / node-schedule

Simple in-process cron schedulers. No external dependencies.

| Criterion | Details |
|-----------|---------|
| **License** | MIT |
| **Requires** | Nothing — runs in the Node.js process |
| **Features** | Cron expressions, one-time scheduled tasks |
| **Persistence** | None — jobs lost on process restart |
| **Retries** | None — must implement manually |

**Elimination reason:** No persistence. If the Fastify server restarts (deploy, crash, scaling), all scheduled reminders are lost. Unacceptable for reservation reminders.

---

## Comparison

| Dimension | BullMQ | Trigger.dev | node-cron |
|-----------|--------|-------------|-----------|
| **Cost** | $0 (+ Redis) | $0 (free tier) | $0 |
| **Persistence** | Yes (Redis) | Yes (managed) | No |
| **TypeScript** | Native | Native | Types available |
| **Delayed jobs** | Yes | Yes | Yes (no persistence) |
| **Retries** | Built-in | Built-in | Manual |
| **Dashboard** | Bull Board (OSS) | Built-in (excellent) | None |
| **Vendor lock-in** | None | Medium (cloud) / None (self-host) | None |
| **Complexity** | Low (library + Redis) | Medium (platform) | Minimal |
| **Solo dev fit** | 9/10 | 7/10 | 4/10 |

---

## Recommendation: BullMQ + Upstash Redis

**BullMQ** is the right choice. It's a library, not a platform — you add it to your Fastify service and connect it to Redis. No new infrastructure to manage beyond Redis, which is useful for caching and rate limiting anyway (see Caching evaluation).

**Upstash Redis** for the Redis dependency — serverless, $0 free tier, no server to manage. Upgrades to pay-as-you-go when traffic grows.

| Step | Action | Effort |
|------|--------|--------|
| 1 | Add Redis to Docker Compose for local dev | 10 min |
| 2 | Create Upstash Redis instance for production | 5 min |
| 3 | Add BullMQ to reservations service | 1-2 hours |
| 4 | Implement reminder email scheduling | 2-4 hours |
| 5 | Add Bull Board dashboard to Fastify | 30 min |

**Total:** ~4-6 hours. $0/month (Upstash free tier).

---

## Sources

- [BullMQ](https://bullmq.io/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [BullMQ GitHub](https://github.com/taskforcesh/bullmq)
- [BullMQ with Upstash Redis](https://upstash.com/docs/redis/integrations/bullmq)
- [BullMQ Guide (DigitalOcean)](https://www.digitalocean.com/community/tutorials/how-to-handle-asynchronous-tasks-with-node-js-and-bullmq)
- [BullMQ Guide (Dragonfly)](https://www.dragonflydb.io/guides/bullmq)
- [BullMQ Job Scheduling (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/)
- [Trigger.dev Pricing](https://trigger.dev/pricing)
- [Trigger.dev Self-Hosting](https://trigger.dev/docs/self-hosting/overview)
- [Upstash Redis Pricing](https://upstash.com/pricing/redis)
