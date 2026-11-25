# Spike: Regulars Club

Refs #9495. Source: `docs/ideas/2026-10-19.md` #3. Decision doc only, no code.

## Answer first

Priority access can be built on the existing booking window with no payment code. Paid membership
cannot be built safely on today's Stripe integration. Deposits are charged on the platform's own
Stripe account, with no Connect, so membership money would land with the platform, not the venue.

**Recommendation: build the free, invite-only wedge (a members-first booking window). Defer paid
membership until Connect exists. Cut prepaid dining credit.**

## How payments work today

- One platform Stripe account. `StripeService` is constructed from a single `STRIPE_SECRET_KEY`
  (`services/reservations/src/services/stripe.ts`). No `transfer_data`, `on_behalf_of`,
  `stripeAccount` or `application_fee` appears anywhere in `services/` or `packages/`. No
  `subscriptions.*` call exists.
- Deposits are authorize-then-capture PaymentIntents (`capture_method: "manual"`,
  `createPaymentIntent` in `stripe.ts`). Created by `services/reservations/src/routes/public-deposits.ts`
  with idempotency keys `${reservationId}:customer` and
  `${reservationId}:paymentIntent:${depositAmountCents}`.
- A Stripe Customer is created per guest per venue and stored on `Guest.stripeCustomerId` (unique)
  and `Deposit.stripeCustomerId` (`services/reservations/src/services/deposit.ts`).
- Deposit lifecycle: `pending`, `held`, `applied`, `refunded`, `partial_refunded`, `forfeited`,
  `uncollectable` (`DepositStatus` in `services/reservations/prisma/schema.prisma`), driven by
  `deposit-state-machine.ts` with compare-and-set updates.
- Webhook: `services/reservations/src/routes/stripe-webhook.ts` verifies the signature against the
  raw body, fails closed without a secret, and routes only `payment_intent.succeeded`,
  `payment_intent.amount_capturable_updated`, `payment_intent.canceled`, `charge.refunded` and
  `charge.refund.updated`. Unknown types return 200 and are skipped (`webhook-event-router.ts`).
  Retries are safe because of CAS updates and Stripe idempotency keys. There is no stored
  `event.id` dedupe table.
- Every webhook resolves its venue from the deposit row via the PaymentIntent id. A subscription
  invoice has no deposit row, so this lookup would not work for membership events.

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

The hard part is identity. Public availability is anonymous (a widget `x-session-id`), and
`public-guest-recognition.ts` recognises a guest by an email query string with no proof of
ownership. A member window keyed on a typed email would let anyone book early by typing a
member's address. So:

- The venue invites a guest. The guest gets a signed member link, HMAC-signed the same way manage
  links are (`MANAGE_TOKEN_SECRET`, `manage-token-scope.ts`), carrying venue id and email.
- The widget sends the token on availability, hold and confirm calls. The server verifies it and
  widens the window only for that request.
- Confirm re-checks the token and requires the reservation's guest email to equal the token email
  (the same rule `manageTokenScoped` applies). Today the window is checked at hold creation
  (`hold.ts`), not in `confirm-hold.ts`. The hold is the gate, so the hold must record that it was
  made in the member window, and confirm must refuse a member-window hold without a valid token.
- Membership is a row, not a tag. `Guest.tags` is free-form JSON that staff edit, so it is too weak
  to gate access. Add `GuestMembership { venueId, guestId, tier, status, invitedAt, revokedAt }`.

**Held tables (deferred).** `ReservationHold` is a 10-minute widget lock (`holdDurationMinutes`),
not an allocation. A table `closure` date rule (`DateRule.targetKind = tables`) blocks everyone,
members included. Member-only tables would need a new rule kind and engine changes in
`packages/availability`. `DateRule.bookingOpensAt` exists in the schema but nothing reads it.
Defer held tables until the early window has proven demand.

## Money flow (for option B, for payment review)

Option B is not proposed for building now. It is specified here so `stripe-flow-reviewer` can
review it, as #9495 requires.

**Parties.** Guest (payer). Venue (merchant of record, Stripe Connect Standard account). Platform
(this app, takes an optional application fee). Money never sits in the platform balance.

**Who pays whom, when.**

1. Venue onboards to Connect (account link). Store `Venue.stripeAccountId`. Additive migration.
2. Venue creates a membership Product and a recurring Price on its own account
   (`Stripe-Account` header). Store the Price id on a `MembershipPlan` row.
3. Guest opens their signed member link and starts checkout. The server creates a Checkout Session
   in `subscription` mode on the venue's account, with `subscription_data.application_fee_percent`
   if the platform charges a fee. Direct charge: the guest pays the venue. Stripe pays the platform
   its fee from the venue's account.
4. Access starts only on `invoice.paid` for the first invoice. Never on the checkout redirect.
5. Each renewal: Stripe charges the guest on the venue's account. `invoice.paid` extends
   `currentPeriodEnd`. `invoice.payment_failed` moves the membership to `past_due` and removes the
   early window at once.
6. Cancellation: `cancel_at_period_end`. Access stays to period end. `customer.subscription.deleted`
   ends it.

**Idempotency.**

- Checkout creation key: `membership:${membershipId}:checkout:${planPriceId}`. One pending
  membership row per (venue, guest), enforced by a unique index.
- Store `stripeSubscriptionId` and `stripeCustomerId` unique on `GuestMembership`. The connected
  account's Customer is new. It is not `Guest.stripeCustomerId`, which lives on the platform account.
- A separate Connect webhook endpoint and signing secret. Handlers resolve venue by
  `event.account`, then the membership by subscription id, and change status by CAS
  (`updateMany where { id, status: expected }`), the pattern deposits use.
- Add a processed-event table keyed by `event.id`. Invoice events can arrive out of order and
  repeat, and the deposit path has no such table today.
- Refund calls key on `membership:${membershipId}:refund:${invoiceId}`.

**Refund triggers.**

| Trigger                                                              | Action                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Guest cancels within 14 days and has not booked in the member window | Full refund of the latest invoice, cancel now.                           |
| Guest cancels later                                                  | No refund. Cancel at period end.                                         |
| Venue ends the program or closes                                     | Prorated refund of unused time on every active subscription, cancel now. |
| Venue removes a member for abuse                                     | Cancel now. Refund unused time (Owner/legal to confirm policy).          |
| Dispute opened (`charge.dispute.created`)                            | Suspend access. No refund call, the dispute decides.                     |
| Refund made in the Stripe dashboard                                  | Reconcile only, as `postCaptureRefundCents` does for deposits (#5725).   |

Reservations already made in the member window stay valid when a membership lapses. Removing a
membership never cancels a booking or touches its deposit.

## Fraud and abuse cases

- **Shared member link.** Bound to email; confirm requires a matching guest email. Rotate on
  revoke.
- **Member hoards prime slots then cancels.** Cap member-window bookings per member per week.
  Count member-window late cancels in `guest-reliability.ts` and suspend after the venue's
  `autoDepositAfterNoShows` threshold.
- **Card testing on signup (option B).** Checkout behind the signed link only, a per-IP limit, and
  Stripe Radar on the venue's account.
- **Use perks, then charge back (option B).** Suspend on dispute. Early-window bookings keep their
  normal deposit rules, so a no-show is still covered.
- **Enumeration.** The member check must not answer "is this email a member". Today's recognition
  route already leaks first name and visit count for any email (10/min limit). The member route
  must not copy that.

## Kill test

Time box: 6 weeks after the free wedge ships.

- At least one venue invites 20 or more guests.
- At least 25% of invited guests book in the member window at least once.
- Member-window bookings show no higher no-show or late-cancel rate than public ones.

Fails any of these: cut the idea and update the showcase copy. Passes: write the Connect decision
as its own ADR before any paid work.

Honest limit: the target user is a venue hard to book. The demo venue is not. The test needs one
real operator.

## Recommendation

**Build the free wedge. Defer paid membership (option B) behind a Connect ADR. Cut prepaid
credit.**

Reasons:

- The early window reuses `bookingWindow` and the signed-token pattern. Small and testable.
- Paid membership on today's single-account Stripe setup would make the platform the merchant
  for venue revenue. That is a money-flow and liability change, not a feature.
- Prepaid credit was already dropped once for regulatory risk.
- Charter: theme 1, guest-facing loop. Paid membership touches the "new payment surfaces"
  guardrail the idea doc itself flagged.

## Proposed child issues

**Proposed, not filed: the Owner decides.**

1. **feat(reservations): `GuestMembership` model.** AC: additive migration; venue-scoped with FORCE
   RLS like `guests`; RLS sweep fixture added.
2. **feat(reservations): signed member link.** AC: HMAC token with venue id and email; verify
   returns 400/401/410 like manage tokens; revoking the membership invalidates it.
3. **feat(reservations): member early window.** AC: with a valid token, availability, hold and
   confirm use `maxAdvanceBooking + memberLeadDays`; without it, a member-only slot is refused at
   confirm; tests cover both.
4. **feat(hospitality): invite and revoke members.** AC: an operator invites by email, sees status,
   revokes; invite sends the member link.
5. **feat(hospitality): member window UX in the booking widget.** AC: a member sees "Members book N days early" and
   the extra dates; a public guest sees nothing new.
6. **feat(reservations): member-window booking cap.** AC: max bookings per member per week,
   refused with a clear problem detail.
7. **docs(adr): Stripe Connect for venue-owned revenue.** AC: decides Standard vs Express, direct
   charges, webhook endpoint split; reviewed by `stripe-flow-reviewer`. Gate for any paid tier.
