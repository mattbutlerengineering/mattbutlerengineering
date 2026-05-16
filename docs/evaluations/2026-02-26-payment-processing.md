# Payment Processing Evaluation — February 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Payment provider** | None |
| **Deposits/prepayment** | Not implemented |
| **No-show fees** | Not implemented |
| **Subscription billing** | Not needed |

### Why This Matters

Reservation systems typically need payment processing for:
1. **Deposits** — collect a deposit at booking to reduce no-shows
2. **No-show fees** — charge a fee if a guest doesn't honor their reservation
3. **Prepaid experiences** — chef's table, prix fixe, special events
4. **Future: SaaS billing** — if the platform charges venues a subscription

This is a forward-looking evaluation. The reservation system works without payments initially, but the data model and provider choice should be decided early to avoid rework.

---

## Provider Profiles

### 1. Stripe (Recommended)

The developer-standard payment platform. Founded 2010. $95B+ valuation. Used by millions of businesses.

| Criterion | Details |
|-----------|---------|
| **Pricing** | 2.9% + $0.30 per card transaction (US) |
| **Monthly fee** | $0 |
| **Free tier** | No minimum; pay per transaction only |
| **TypeScript SDK** | `stripe` npm package — excellent TypeScript support |
| **API quality** | Gold standard for developer APIs; best documentation in the industry |
| **Reservation deposits** | PaymentIntent with `capture_method: "manual"` (authorize now, capture later) |
| **No-show fees** | PaymentIntent with delayed capture; charge if no-show, release if honored |
| **Stripe Connect** | Multi-venue support: collect payment, split between platform and venue |
| **Connect pricing** | +0.25% per payout (capped at $25); Standard accounts: $0 extra |
| **Webhooks** | Comprehensive event system for payment lifecycle |
| **Fraud prevention** | Stripe Radar (included); ML-based fraud detection |
| **PCI compliance** | Stripe handles PCI; you never touch raw card numbers |

**Key strength for this project:** Stripe's authorization/capture flow is purpose-built for reservation deposits. Authorize at booking, capture on arrival, or release if cancelled. No-show fees work the same way. Stripe Connect enables the platform to charge venues (SaaS model) and split payments between the platform and venue.

**Stripe Elements / Checkout:** Pre-built, PCI-compliant payment UI components. Stripe Checkout is a hosted payment page (zero frontend work). Elements are embeddable React components for custom UIs.

---

### 2. Square

All-in-one payment platform with focus on in-person/POS. Founded 2009 (Block, Inc.).

| Criterion | Details |
|-----------|---------|
| **Pricing** | 2.9% + $0.30 per online transaction (same as Stripe) |
| **TypeScript SDK** | `square` npm package — decent TypeScript support |
| **API quality** | Good but less developer-focused than Stripe |
| **Restaurant focus** | Square for Restaurants — POS, ordering, table management |
| **Reservation integration** | Limited API for reservation-specific flows |

**Elimination reason:** Square is POS-first, API-second. The developer experience, documentation, and ecosystem are significantly behind Stripe. Square for Restaurants is a complete POS product, not an API for building custom reservation systems. If you're building a platform, Stripe's API-first approach is the right fit.

---

### 3. PayPal / Braintree

PayPal's developer platform. Braintree (owned by PayPal) offers a Stripe-like API.

| Criterion | Details |
|-----------|---------|
| **Pricing** | 2.99% + $0.49 per transaction (PayPal); 2.59% + $0.49 (Braintree) |
| **Developer experience** | Braintree is decent; PayPal API is dated |

**Elimination reason:** Higher transaction fees than Stripe. Braintree's developer experience is acceptable but Stripe's is superior. No compelling advantage for this use case.

---

## Recommendation: Stripe

**Stripe is the only serious option for a developer building a reservation platform.** The authorization/capture flow maps directly to reservation deposits. Stripe Connect maps directly to multi-venue payment splitting. The TypeScript SDK and documentation are best-in-class.

**Implementation approach:**

| Phase | Feature | Stripe API | Effort |
|-------|---------|-----------|--------|
| 1 | **Reservation deposits** | PaymentIntent (`capture_method: "manual"`) | 4-8 hours |
| 2 | **No-show charges** | Capture authorized PaymentIntent | 2-4 hours |
| 3 | **Cancellation refunds** | Cancel PaymentIntent (pre-capture) or Refund (post-capture) | 2-4 hours |
| 4 | **Multi-venue (future)** | Stripe Connect (Standard accounts) | 8-16 hours |
| 5 | **SaaS billing (future)** | Stripe Billing (Subscriptions API) | 8-16 hours |

**Cost:** $0/month base. 2.9% + $0.30 per transaction. For a reservation system processing $10K/month in deposits, that's ~$320/month in processing fees — standard industry rate.

---

## Sources

- [Stripe Pricing](https://stripe.com/pricing)
- [Stripe Connect](https://stripe.com/connect)
- [Stripe Restaurant Payment Processing](https://stripe.com/resources/more/restaurant-payment-processing)
- [Stripe Hospitality Payment Processing](https://stripe.com/resources/more/hospitality-payment-processing)
- [Stripe PaymentIntents API](https://docs.stripe.com/api/payment_intents)
- [Stripe Connect SaaS Platforms](https://docs.stripe.com/connect/saas-platforms-and-marketplaces)
- [Square vs Stripe 2026 (UniBee)](https://unibee.dev/blog/stripe-vs-square-comparison/)
- [Best Payment APIs 2026 (Postman)](https://blog.postman.com/best-payment-apis-for-developers/)
- [Stripe Fees Guide 2026](https://www.wearefounders.uk/a-guide-to-stripe-fees-in-2025-what-founders-need-to-know/)
