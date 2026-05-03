# AI Service Fallback Strategy

## Overview

Defines how the system behaves when the AI service (Claude API) is unavailable, rate-limited, or degraded. L6 autonomous loops must degrade gracefully, not break silently.

## Failure Modes

| Failure               | Detection                   | Response                                 |
| --------------------- | --------------------------- | ---------------------------------------- |
| API unavailable (5xx) | HTTP status code            | Retry with exponential backoff           |
| Rate limited (429)    | HTTP status code            | Backoff with delay from response headers |
| Timeout               | No response within 60s      | Retry up to 3 times                      |
| Budget exhausted      | Cost tracking exceeds limit | Stop session, create notification        |
| Consecutive failures  | 5+ failures in a row        | Circuit breaker opens for 5 minutes      |

## Retry Policy

```
Attempt 1: immediate
Attempt 2: wait 1s
Attempt 3: wait 2s
Attempt 4: wait 4s (max 30s)
```

Retryable errors: `rate_limit`, `overloaded`, `timeout`, `connection_error`
Non-retryable: `invalid_request`, `authentication_error`, `budget_exhausted`

## Circuit Breaker

Prevents hammering a failed API:

```
CLOSED (normal) -> 5 failures -> OPEN (blocked for 5min) -> HALF-OPEN (1 request) -> success -> CLOSED
                                                                                   -> failure -> OPEN
```

## Scheduled Task Behavior

| Scenario            | Behavior                                                  |
| ------------------- | --------------------------------------------------------- |
| Single failure      | Skip this run, log, try next scheduled time               |
| 3 consecutive skips | Create GitHub issue with `agent-health` label             |
| API down for 24h+   | All scheduled tasks paused, single tracking issue created |

## Notification

When degraded mode triggers:

1. Log to `.claude/acmm/fallback-events.json`
2. Create GitHub issue with `agent-health` label (if threshold exceeded)
3. Include: failure count, duration, last error, affected scheduled tasks

## Configuration

Policy is defined in `.claude/fallback-policy.json`. Key settings:

| Setting               | Default | Description                               |
| --------------------- | ------- | ----------------------------------------- |
| `maxRetries`          | 3       | Max retry attempts per request            |
| `failureThreshold`    | 5       | Consecutive failures before circuit opens |
| `resetTimeoutMs`      | 300000  | Time before circuit half-opens (5 min)    |
| `maxConsecutiveSkips` | 3       | Scheduled task skips before escalation    |

## Current Implementation Status

| Component                 | Status                        |
| ------------------------- | ----------------------------- |
| Retry logic in agent-core | Partial -- basic retry exists |
| Circuit breaker           | Not implemented               |
| Fallback policy config    | Added (this PR)               |
| Scheduled task resilience | Not implemented               |
| Notification on failure   | Not implemented               |
