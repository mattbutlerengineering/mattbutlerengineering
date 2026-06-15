# @mbe/jobs

BullMQ job scheduling for background tasks. Uses Redis (via `ioredis`) as the backing store. Provides `JobScheduler` for enqueuing delayed/cron jobs and `JobWorker` for processing them.

## Structure

```
src/
├── index.ts          # Re-exports
├── job-types.ts      # JobType union, JobPayloadMap, type definitions
├── scheduler.ts      # JobScheduler — enqueue one-time + cron jobs
├── scheduler.test.ts
├── worker.ts         # JobWorker — process jobs from the queue
├── worker.test.ts
└── integration.test.ts
```

## Job Types

| Type                   | Payload                     | Purpose                       |
| ---------------------- | --------------------------- | ----------------------------- |
| `booking-reminder`     | `BookingReminderPayload`    | 24h before reservation        |
| `day-of-reminder`      | `DayOfReminderPayload`      | Day-of reminder               |
| `post-visit-followup`  | `PostVisitFollowupPayload`  | After visit                   |
| `pre-arrival-briefing` | `PreArrivalBriefingPayload` | Staff briefing before arrival |
| `lapsed-guest-scan`    | `LapsedGuestScanPayload`    | Scan for lapsed guests        |
| `waitlist-expiry`      | `WaitlistExpiryPayload`     | Waitlist entry expiry         |

## Usage

```typescript
import { JobScheduler, JobWorker, JOB_TYPES } from "@mbe/jobs";

// Schedule a one-time delayed job
const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
const jobId = await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, payload, 86_400_000);

// Schedule a recurring cron job
await scheduler.scheduleCron(JOB_TYPES.LAPSED_GUEST_SCAN, payload, "0 3 * * *");

// Process jobs
const worker = new JobWorker({
  redisUrl: "redis://localhost:6379",
  handlers: {
    [JOB_TYPES.BOOKING_REMINDER]: async (payload) => {
      /* ... */
    },
    [JOB_TYPES.LAPSED_GUEST_SCAN]: async (payload) => {
      /* ... */
    },
  },
});

// Cleanup
await scheduler.close();
await worker.close();
```

Default queue name: `mbe-notifications`. Jobs retry up to 3 times with exponential backoff (1s base). Completed/failed jobs are trimmed to 100/50 respectively.

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Vitest unit tests
pnpm test:watch     # Vitest watch mode
pnpm test:coverage  # Coverage report
pnpm lint           # ESLint
pnpm typecheck      # Type check
```
