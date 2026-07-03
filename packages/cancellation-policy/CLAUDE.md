# @mbe/cancellation-policy

Pure cancellation-fee decision engine — no IO, no DB calls. Given a venue's
policy fields and two timestamps (reservation time, cancellation time),
computes the fee owed and the deposit action to take.

## Structure

```
src/
├── index.ts                    # Barrel export
├── cancellation-policy.ts      # evaluateCancellationFee, formatCancellationTerms
└── cancellation-policy.test.ts
```

## Decision Tree

- `cancellationTime >= reservationTime` → **no-show** (forfeit, unless a partial no-show fee leaves a refund owed)
- `cancellationTime > freeCutoff` (inside the late window) → **late** (partial refund)
- `cancellationTime <= freeCutoff` → **none** (full refund)

`freeCutoff = reservationTime - freeCancellationHours`. All money is integer
cents; fractional cents are floored, never rounded.

## Consumers

- `services/reservations` (`src/services/cancellation-policy.ts`) — server-side fee calculation when a guest cancels
- `apps/hospitality` (`src/utils/cancellation-fee.ts`) — client-side display of cancellation terms in the booking widget

## Gotchas

- `policy === null` or `freeCancellationHours === null` short-circuits to always-free — don't add a fee branch below the null checks
- Boundary is inclusive: cancelling exactly at `freeCutoffMs` is still free
- `depositAction: "forfeit"` only applies when `refundAmountCents` is 0 — a no-show fee under 100% still owes a partial refund

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
