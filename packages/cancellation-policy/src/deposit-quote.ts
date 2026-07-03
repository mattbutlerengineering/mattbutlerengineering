/**
 * Deposit pricing engine — pure function, no IO.
 *
 * This is the single source of truth for the per_person-vs-flat deposit
 * pricing rule. Both the reservations service (the authoritative charge
 * created against Stripe) and the hospitality booking widget (the amount
 * shown to the guest) call this function, so the two surfaces can never
 * silently diverge.
 */

export type DepositType = "flat" | "per_person";

export interface DepositQuoteConfig {
  depositType: DepositType | null;
  amountCents: number | null;
}

/**
 * Computes the deposit amount in cents for a reservation.
 *
 * Rules:
 * - "per_person": amountCents × partySize
 * - "flat" (or no type recorded — null): amountCents as-is
 * - null amountCents: zero (no deposit configured)
 *
 * `depositType` is constrained to `"flat" | "per_person" | null` at the type
 * level — the reservations service's Venue.depositType column is a Postgres
 * enum with only those two values, so an "unknown type" can't reach this
 * function from real data; TypeScript rejects anything else at the call site.
 *
 * `amountCents` and `partySize`, by contrast, are plain integers with no DB
 * constraint against negative values, so they're validated here — a negative
 * amount would otherwise silently produce a negative Stripe charge.
 */
export function quoteDeposit(config: DepositQuoteConfig, partySize: number): number {
  const amountCents = config.amountCents ?? 0;

  if (amountCents < 0) {
    throw new Error(`Invalid deposit config: amountCents cannot be negative (got ${amountCents})`);
  }
  if (partySize < 0) {
    throw new Error(`Invalid partySize: cannot be negative (got ${partySize})`);
  }

  if (config.depositType === "per_person") {
    return amountCents * partySize;
  }
  return amountCents;
}
