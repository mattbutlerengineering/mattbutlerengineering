/**
 * Per-onboarding spend ceiling for the gen onboarding route (#9476).
 *
 * No venue exists before Launch, so an onboarding is keyed by user id: spend
 * accumulates per user over a 24 h session window, then resets. The ceiling is
 * a cost-control guard, not a ledger, so it is held in process memory. Known
 * limit: with N instances a user can spend up to N x ceiling; the aggregate
 * daily ceiling (gen-spend-ceiling.ts) still bounds the total.
 */

/** $0.05 is roughly 10+ turns at the cheap model's price (one turn is a few thousand tokens). */
export const GEN_ONBOARDING_CEILING_DEFAULT_USD = 0.05;

const SESSION_WINDOW_MS = 24 * 3_600_000;
const MAX_TRACKED_USERS = 10_000;

interface Entry {
  readonly startedAt: number;
  readonly microUsd: number;
}

let spend = new Map<string, Entry>();

export function resolveOnboardingCeilingUsd(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return GEN_ONBOARDING_CEILING_DEFAULT_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : GEN_ONBOARDING_CEILING_DEFAULT_USD;
}

export function getOnboardingCeilingMicroUsd(): number {
  return Math.round(
    resolveOnboardingCeilingUsd(process.env.GEN_ONBOARDING_CEILING_USD) * 1_000_000
  );
}

function live(userId: string, now: number): Entry | undefined {
  const entry = spend.get(userId);
  if (!entry) return undefined;
  if (now - entry.startedAt > SESSION_WINDOW_MS) {
    spend.delete(userId);
    return undefined;
  }
  return entry;
}

export function isOnboardingCeilingReached(
  userId: string,
  ceilingMicroUsd: number,
  now: number = Date.now()
): boolean {
  return (live(userId, now)?.microUsd ?? 0) >= ceilingMicroUsd;
}

export function addOnboardingSpend(
  userId: string,
  microUsd: number,
  now: number = Date.now()
): void {
  const entry = live(userId, now);
  if (!entry && spend.size >= MAX_TRACKED_USERS) {
    // Bound memory: drop the oldest tracked user (Map keeps insertion order).
    const oldest = spend.keys().next().value;
    if (oldest !== undefined) spend.delete(oldest);
  }
  spend.set(userId, {
    startedAt: entry?.startedAt ?? now,
    // A negative delta settles a reservation against the real cost; never below zero.
    microUsd: Math.max(0, (entry?.microUsd ?? 0) + microUsd),
  });
}

export function resetOnboardingSpendForTests(): void {
  spend = new Map();
}
