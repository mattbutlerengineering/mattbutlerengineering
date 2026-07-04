---
id: ADR-019
title: In-Process JobWorker Delivery
status: active
date: 2026-07-04
---

# ADR-019: In-Process JobWorker Delivery

## Context

The `@mbe/jobs` package presents a wide scheduling interface — `JobScheduler`,
`JobWorker`, `dispatchJob`, a typed `JobPayloadMap`, and a retry/trim policy
(`attempts: 3`, exponential backoff, `removeOnComplete`/`removeOnFail`). Until
now only the **enqueue half** was wired in the reservations service:

- `booking-notifications` schedules `BOOKING_REMINDER` and `DAY_OF_REMINDER` on
  every confirmed reservation.
- `waitlist-notifier` schedules `WAITLIST_EXPIRY` on every `notifyTableReady`.

But `new JobWorker` / `JobHandlerMap` registration existed **nowhere** in the
monorepo. A pre-check confirmed no out-of-repo consumer (separate cron/infra)
dequeues these jobs either. Consequently every enqueued job terminated in Redis
with nothing dequeuing it:

- No booking reminder was ever delivered.
- Waitlist expiry never re-notified the next waiting guest — the
  `handleExpiry` re-notify path was unreachable dead depth.

Issue #3078 required a human decision: **wire delivery** (giving the scheduling
interface real depth) or **delete** the enqueue half (collapsing `@mbe/jobs` to
what is actually used). The recorded HITL decision was to **wire delivery**:
reminders and waitlist re-notification are real product requirements, so the
enqueue half becomes load-bearing rather than being removed.

## Decision

Run the `JobWorker` **in-process inside the reservations service** at startup,
rather than as a separate DigitalOcean App Platform component.

- A `JobHandlerMap` is composed in `services/reservations/src/services/job-worker.ts`:
  - `BOOKING_REMINDER` and `DAY_OF_REMINDER` share a reminder-delivery handler
    that loads the reservation + venue (the finder), then calls the existing
    `NotificationDispatcher.sendBookingReminder` (the dispatcher), threading a
    freshly signed manage-token and the guest's communication preference.
  - `WAITLIST_EXPIRY` calls the existing `waitlistNotifier.handleExpiry`,
    reaching the expire-then-re-notify-next-guest path. `handleExpiry` now
    derives the venue from the expired entry itself, so the job payload only
    needs the entry id — exactly what the enqueue side sends.
  - The three job types that are never enqueued today
    (`POST_VISIT_FOLLOWUP`, `PRE_ARRIVAL_BRIEFING`, `LAPSED_GUEST_SCAN`) map to
    handlers that throw, so a mis-enqueued job fails loudly instead of silently
    vanishing — the exact failure mode this ADR removes.
- The worker is wrapped by `createReservationJobWorker`, which defers
  construction (and therefore the Redis consumer connection) to Fastify's
  `onReady` hook and closes it on `onClose`. `buildApp()` stays
  side-effect-free, matching the existing `createLapsedGuestMonitor` pattern.
- Handlers are pure closures built eagerly; only the worker's Redis consumer is
  lifecycle-bound. In `NODE_ENV=test` the worker is not started.
- The typed `JobPayloadMap`, retry policy, and trim policy are kept intact and
  are now genuinely load-bearing.

## Consequences

### Benefits

- Reminders are delivered and waitlist expiry re-notifies the next guest — the
  scheduling interface now matches observable behaviour.
- The retry/backoff and trim policies become meaningful: transient delivery
  failures propagate from the handler so BullMQ retries per policy.
- No new deployment target or infrastructure. The worker ships with the
  reservations service as a single deployable unit.

### Trade-offs

- The worker shares the reservations process's lifecycle and resources; scaling
  the API also scales the worker. With multiple reservations instances, BullMQ
  competing-consumer semantics distribute jobs across them safely.
- A heavy delivery workload could contend with request-serving CPU/IO. If
  reminder volume grows, the delivery path can be extracted into a dedicated
  worker component (see Alternatives) without changing the enqueue side.

## Alternatives Considered

### Separate DigitalOcean App Platform worker component

**Rejected for now:** a standalone worker adds a deployment target plus
`app.yaml` / Pulumi surface (per ADR-014) for what is currently a low-volume
delivery path. The three-tier topology in ADR-014 already supports adding such
a component later; this ADR is deliberately adjacent to that topology so the
extraction is a follow-up, not a rewrite.

### Delete the enqueue half

**Rejected:** the deletion test showed no observable behaviour lost *today*, but
the HITL decision is that reminder delivery and waitlist re-notification are
required product behaviour. Building worker + enqueue together as one wired
feature is the honest resolution.

## See Also

- **ADR-014**: Deployment Topology — where a future dedicated worker component
  would live if delivery volume warrants extraction.
- **Issue #3078**: the HITL decision to wire delivery.
- **Issue #3088**: single notifier runtime consolidation, unblocked by this
  decision.
