/**
 * Guest prefill — the revert rule a pick and a Clear share (architecture.md `guest-prefill.ts`).
 * A pick fills the form fields the profile has a value for and remembers what each held;
 * Clear puts the remembered value back only where the Host has not typed over the fill since.
 * Pure: every call returns new objects. Identical on the reservation dialog (email, phone) and
 * the waitlist (phone) — a field the form does not have is never filled.
 */

/** The guest fields a surface may hand over; each is present only when that form has it. */
export interface PrefillFields {
  guestEmail?: string;
  guestPhone?: string;
}

/** The profile values that map onto {@link PrefillFields} (a `Guest`'s `email` / `phone`). */
export interface PrefillProfile {
  email: string | null;
  phone: string | null;
}

export interface PrefillEntry {
  before: string;
  filled: string;
}

/** One entry per field the pick filled — nothing for fields the profile left alone. */
export type PrefillSnapshot = Partial<Record<keyof PrefillFields, PrefillEntry>>;

const FIELD_SOURCES: ReadonlyArray<readonly [keyof PrefillFields, keyof PrefillProfile]> = [
  ["guestEmail", "email"],
  ["guestPhone", "phone"],
];

export function applyPick<T extends PrefillFields>(
  current: T,
  profile: PrefillProfile
): { next: T; snapshot: PrefillSnapshot } {
  const next: T = { ...current };
  const snapshot: PrefillSnapshot = {};
  for (const [field, source] of FIELD_SOURCES) {
    const filled = profile[source];
    if (!(field in current) || !filled) continue;
    snapshot[field] = { before: current[field] ?? "", filled };
    next[field] = filled;
  }
  return { next, snapshot };
}

export function applyClear<T extends PrefillFields>(current: T, snapshot: PrefillSnapshot): T {
  const next: T = { ...current };
  for (const [field] of FIELD_SOURCES) {
    const entry = snapshot[field];
    if (entry && current[field] === entry.filled) next[field] = entry.before;
  }
  return next;
}
