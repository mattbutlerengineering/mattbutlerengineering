# Spike: Regulars Club

Refs #9495. Source: `docs/ideas/2026-10-19.md` #3. Decision doc only, no code.

## Answer first

Priority access can be built on the existing booking window with no payment code. Paid membership
cannot be built safely on today's Stripe integration. Everything is charged on the platform's own
Stripe account, with no Connect, so membership money would land with the platform, not the venue.

**Recommendation: build the free, invite-only wedge (a members-first booking window). Defer paid
membership until a Connect ADR exists. Cut prepaid dining credit.**

## How payments work today

- One platform Stripe account. `StripeService` is constructed from a single `STRIPE_SECRET_KEY`
  (`services/reservations/src/services/stripe.ts:111`). No `transfer_data`, `on_behalf_of`,
  `stripeAccount` or `application_fee` appears in `services/` or `packages/`. No `subscriptions.*`
  call exists.
- **Captured deposits already settle into the platform balance.** The platform is the merchant for
  venue deposit money today. That is an existing condition, not something membership introduces.
  The Connect ADR (child issue 7) must decide whether deposits move to Connect too.
- Deposits are authorize-then-capture PaymentIntents (`capture_method: "manual"`,
  `createPaymentIntent` in `stripe.ts`), created by
  `services/reservations/src/routes/public-deposits.ts` with key
  `${reservationId}:paymentIntent:${depositAmountCents}`.
- **One Stripe Customer per reservation**, not per guest. The booking path creates it with key
  `${reservationId}:customer` (`public-deposits.ts:166`) and stores it only on the `Deposit` row
  (`public-deposits.ts:231`). `ensureStripeCustomer` (`deposit.ts:1274`), which would write
  `Guest.stripeCustomerId`, is never called outside tests.
- Deposit lifecycle: `pending`, `held`, `applied`, `refunded`, `partial_refunded`, `forfeited`,
  `uncollectable` (`DepositStatus` in `services/reservations/prisma/schema.prisma`), driven by
  `deposit-state-machine.ts` with compare-and-set updates.
- Webhook: `services/reservations/src/routes/stripe-webhook.ts` verifies the signature against the
  raw body, fails closed without a secret, and routes five `payment_intent.*` / `charge.refund*`
  types. Unknown types return 200 (`webhook-event-router.ts`). Retries rely on CAS updates and
  Stripe idempotency keys. There is no stored `event.id` dedupe table.
- Each webhook resolves its venue from the deposit row via the PaymentIntent id. A subscription
  invoice has no deposit row, so membership events need their own resolution.

## Pricing model options

| Option                           | What the guest pays                      | Fit                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Free, invite-only tier        | Nothing. The venue tags who is a member. | **Wedge.** No payment surface. Proves the access mechanics.                                                                                                                                                          |
| B. Subscription (monthly/annual) | A recurring fee to the venue.            | **Defer.** Needs Connect so the venue is the merchant of record, plus a new webhook family.                                                                                                                          |
| C. Prepaid dining credit         | A top-up spent as food later.            | **Cut.** Stored value with breakage and redemption. The same idea doc set already dropped "deposits and prepaid credits as a working-capital line" (`docs/ideas/2026-10-11.md` seed 16) for money-transmission risk. |

## Access mechanics at booking time

**Early window (wedge).** `bookingWindow(settings, now, tz)` and `isSlotInBookingWindow` in
`services/reservations/src/services/slot-rules.ts` already gate slot listing, available dates and
hold creation from `minAdvanceBooking` / `maxAdvanceBooking`. A member gets
`maxAdvanceBooking + memberLeadDays`.

The hard part is identity. Public availability is anonymous (a widget `x-session-id`), so a typed
email cannot prove membership. (The public recognition route's disclosure is being fixed in
#9595.) So:

- The venue invites a guest. The guest gets a signed member link, HMAC-signed the same way manage
  links are (`MANAGE_TOKEN_SECRET`, `manage-token-scope.ts`), carrying venue id and email.
- The widget sends the token on availability, hold and confirm calls. The server verifies it and
  widens the window only for that request.
- Today the window is checked at hold creation (`hold.ts`), not in `confirm-hold.ts`. The hold
  must record that it was made in the member window, and confirm must refuse such a hold without
  a valid token whose email equals the reservation's guest email (as `manageTokenScoped` does).
- Membership is a row, not a tag. `Guest.tags` is free-form JSON that staff edit, so it is too weak
  to gate access. Add `GuestMembership { venueId, guestId, tier, status, invitedAt, revokedAt }`.

**Held tables (deferred).** `ReservationHold` is a 10-minute widget lock (`holdDurationMinutes`),
not an allocation. A table `closure` date rule blocks everyone, members included. Member-only
tables need a new rule kind in `packages/availability`. `DateRule.bookingOpensAt` exists in the
schema but nothing reads it. Defer until the early window proves demand.

## Money flow (for option B, for payment review)

Option B is not proposed for building now. It is specified so the Connect ADR starts from a
reviewed design. `stripe-flow-reviewer` read two drafts and this section was revised after each
read to address every finding.

**Parties.** Guest (payer). Venue (merchant of record, Connect Standard account, carries dispute
liability). Platform (optional application fee). The membership charge settles in the venue's
balance. Only the application fee settles in the platform balance.

**Who pays whom, when.**

1. Venue onboards (account link). Store `Venue.stripeAccountId`, unique. Additive migration.
2. Platform creates the membership Product and recurring Price on the venue's account
   (`Stripe-Account` header), keys `membershipPlan:${planId}:product` and
   `membershipPlan:${planId}:price:${amountCents}`. The amount is validated as a positive integer
   in minor units before the call. The Price id goes on a `MembershipPlan` row.
3. Guest opens their member link and starts checkout. Checkout Session in `subscription` mode on
   the venue's account, optional `subscription_data.application_fee_percent`. Direct charge: the
   guest pays the venue, and Stripe moves the platform's fee from that charge to the platform.
4. Access starts only on `invoice.paid` for the first invoice, never on the checkout redirect.
5. Renewals charge on the venue's account. `invoice.paid` moves `currentPeriodEnd` forward only.
   `invoice.payment_failed` sets `past_due` and removes the early window at once.
6. Cancel sets `cancel_at_period_end`; access lasts to period end; `customer.subscription.deleted`
   ends it. Every checkout attempt and every re-subscribe after `ended` is a new membership row.
   An ended row is never revived.

**Membership state machine.** Every transition is a CAS: `updateMany where { id, status: from }`.

| From                | Event                                                         | To                           |
| ------------------- | ------------------------------------------------------------- | ---------------------------- |
| (none)              | checkout started (new row)                                    | `pending`                    |
| `pending`           | `invoice.paid` (first invoice)                                | `active`                     |
| `pending`           | subscription `incomplete`                                     | `incomplete`                 |
| `pending`           | `checkout.session.expired`                                    | `ended`                      |
| `incomplete`        | `invoice.paid`                                                | `active`                     |
| `incomplete`        | subscription `incomplete_expired`                             | `ended`                      |
| `active`            | `invoice.payment_failed`                                      | `past_due`                   |
| `active`            | `customer.subscription.updated`, status `past_due` / `unpaid` | `past_due`                   |
| `past_due`          | `invoice.paid`, or `subscription.updated` status `active`     | `active`                     |
| `active`/`past_due` | `charge.dispute.created`                                      | `suspended_dispute`          |
| `suspended_dispute` | last open dispute closes as won                               | Stripe's current status (\*) |
| `suspended_dispute` | any dispute closes as lost                                    | `ended`                      |
| any but `ended`     | `customer.subscription.deleted`                               | `ended`                      |
| any but `ended`     | venue ends program (while connected)                          | `ended`                      |
| any but `ended`     | `account.application.deauthorized`                            | `ended` (local only)         |

(\*) On a won dispute, retrieve the subscription and map its status: `active` to `active`,
`past_due` or `unpaid` to `past_due`, `canceled` to `ended`. Open disputes are stored per
membership; the suspension stays until all of them close.

`customer.subscription.updated` on any row not `ended` also updates fields without a status move:
`cancelAtPeriodEnd`, the current Price id, and `currentPeriodEnd` (forward only). It never moves
a row out of `suspended_dispute` or `ended`.

`invoice.paid` never lifts `suspended_dispute` and never revives `ended`. The CAS `from` set
enforces both.

**Webhook endpoint.**

- Its own route and secret (`STRIPE_CONNECT_WEBHOOK_SECRET`), failing closed with 503 when unset,
  and its own raw-body capture, as the deposit endpoint does.
- Reject any event with no `event.account` or an account not on a venue. Resolve the venue through
  a new `app_resolve_venue_id` kind (by `stripeAccountId`), then run the handler in
  `runWithVenueContext`.
- Insert into a processed-event table keyed by `event.id` in the same transaction as the status
  change. Record the event even when its CAS was a no-op. A unique violation on that insert means
  "already processed": reply 200. A 500 would make Stripe redeliver for about 3 days.
- A handler that fails and rolls back repeats its Stripe calls on retry. That is safe only
  because every Stripe call carries an idempotency key.
- Ordering: events can arrive out of order. Handlers either retrieve the subscription from Stripe
  and act on its current state, or only move `currentPeriodEnd` forward.
- `charge.dispute.*` lookup: dispute, then its charge, then the charge's invoice, then the
  invoice's subscription, then `GuestMembership` by `stripeSubscriptionId`. Retrieved on the venue's
  account. The ADR pins the API version, since the charge-to-invoice link differs between versions.
- `account.application.deauthorized`: a disconnected Standard account revokes the platform's API
  access, so refund and cancel calls would fail. Set every membership of that venue `ended`
  locally, make no Stripe calls, and leave refunds to the venue.

**Idempotency keys.**

- Checkout: `membership:${membershipId}:checkout:${planPriceId}`. A new attempt is a new row, so a
  new key. One open row (`pending`/`incomplete`) per (venue, guest) by a partial unique index.
- Cancel: `membership:${membershipId}:cancel`.
- `stripeSubscriptionId` and the connected-account `stripeCustomerId` are unique on
  `GuestMembership`. That Customer lives on the venue's account and is unrelated to deposit
  Customers.
- Refunds: `membership:${id}:refund:${invoiceId}:${leg}:${failedCount}`, with metadata
  `{ membershipId, invoiceId, leg }`. `failedCount` counts our failed or canceled refunds of that
  leg, so a retry after a failure gets a fresh key. This mirrors deposits
  (`stripe.ts:213-222`, `countFailedDepositRefunds` at `stripe.ts:277-296`, #7794).
  `charge.refund.updated` reconciles a refund that later fails.

**Refund amounts.** Integer minor units only. Prorated amount =
`floor(amount_paid * unusedSeconds / periodSeconds)`, capped at
`invoice.amount_paid - charge.amount_refunded`, both read from Stripe at refund time.

**Refund triggers.**

| Trigger                                                | Action                                                                                 | `refund_application_fee` |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------ |
| Guest cancels within 14 days, no member-window booking | Full refund of latest invoice, cancel now                                              | true                     |
| Guest cancels later                                    | No refund, cancel at period end                                                        | n/a                      |
| Venue ends the program or closes, still connected      | Prorated refund and cancel on every active subscription, as a retryable background job | true                     |
| Venue disconnects (`account.application.deauthorized`) | `ended` locally, no Stripe calls, venue handles refunds                                | n/a                      |
| Venue removes a member for abuse                       | Cancel now, prorated refund (Owner/legal to confirm)                                   | false                    |
| Dispute opened                                         | Suspend, no refund call. A dispute does not reverse the fee.                           | n/a                      |
| Refund made in the venue's dashboard                   | Reconcile only, as `postCaptureRefundCents` does (#5725)                               | n/a                      |

Reservations made in the member window stay valid when a membership lapses. Ending a membership
never cancels a booking or touches its deposit.

## Fraud and abuse cases

- **Shared member link.** Bound to email; confirm requires a matching guest email. Rotate on
  revoke.
- **Member hoards prime slots then cancels.** Cap member-window bookings per member per week.
  Count member-window late cancels in `guest-reliability.ts` and suspend past the venue's
  `autoDepositAfterNoShows` threshold.
- **Card testing on signup (option B).** Checkout only behind the signed link, a per-IP limit, and
  Radar on the venue's account.
- **Use perks, then charge back (option B).** Suspend on dispute. Early-window bookings keep their
  normal deposit rules, so a no-show is still covered.
- **Enumeration.** The member check must never answer "is this email a member".

## Kill test

Time box: 6 weeks after the free wedge ships.

- At least one venue invites 20 or more guests.
- At least 25% of invited guests book in the member window at least once.
- Member-window bookings show no higher no-show or late-cancel rate than public ones.

Fails any: cut the idea and update the showcase copy. Passes: write the Connect ADR before any
paid work. Honest limit: the demo venue is not hard to book, so the test needs a real operator.

## Recommendation

**Build the free wedge. Defer paid membership (option B) behind a Connect ADR. Cut prepaid
credit.**

- The early window reuses `bookingWindow` and the signed-token pattern. Small and testable.
- Paid membership on the single-account setup would extend platform-as-merchant to recurring venue
  revenue. That is a money-flow and liability decision for an ADR, not a feature.
- Prepaid credit was already dropped once for regulatory risk.
- Charter: theme 1, guest-facing loop. Paid membership touches the "new payment surfaces"
  guardrail the idea doc itself flagged.

## Proposed child issues

**Proposed, not filed: the Owner decides.**

1. **feat(reservations): `GuestMembership` model.** AC: additive migration; venue-scoped with FORCE
   RLS like `guests`; RLS sweep fixture added.
2. **feat(reservations): signed member link.** AC: HMAC token with venue id and email; verify
   returns 400/401/410 like manage tokens; revoking the membership invalidates it.
3. **feat(reservations): member early window.** AC: with a valid token, availability and hold use
   `maxAdvanceBooking + memberLeadDays`; confirm refuses a member-window hold without one; tests
   cover both.
4. **feat(hospitality): invite and revoke members.** AC: an operator invites by email, sees status,
   revokes; the invite sends the member link.
5. **feat(hospitality): member window UX in the booking widget.** AC: a member sees "Members book N
   days early" and the extra dates; a public guest sees nothing new.
6. **feat(reservations): member-window booking cap.** AC: max bookings per member per week,
   refused with a clear problem detail.
7. **docs(adr): Stripe Connect for venue-owned revenue.** AC: decides Standard vs Express, direct
   charges, the webhook split, and whether deposits move to Connect; starts from this money flow;
   reviewed by `stripe-flow-reviewer`. Gate for any paid tier.
