/**
 * Guest lookup rows — the pure copy rules behind the typeahead's listbox rows, the history
 * strip's sentences and the pick announcement (ux.md § Copy). Pure like `guest-signals.ts`.
 */

import type { Guest } from "@mbe/types";
import { isAllergyTag } from "./guest-signals.js";

/** "linked" attaches the profile (reservation, walk-in); "recognised" only prefills (waitlist, Q3). */
export type GuestLookupMode = "linked" | "recognised";

const ZERO_VISITS = "No visits on record yet";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "{N} visit|visits", or the honest zero state — never "0 visits" (Q4). */
export function visitsSentence(visitCount: number): string {
  return visitCount > 0 ? plural(visitCount, "visit") : ZERO_VISITS;
}

/** "{N} no-show|no-shows"; null at zero so the strip omits the row. */
export function noShowsSentence(noShowCount: number): string | null {
  return noShowCount > 0 ? plural(noShowCount, "no-show") : null;
}

/** Row line 2: phone · email · visits, omitting null contacts and zero visits. */
export function formatGuestRowDetail(guest: Guest): string {
  const contacts = [guest.phone, guest.email].filter((part): part is string => Boolean(part));
  if (contacts.length === 0 && guest.visitCount === 0) return "no contact on file";
  const visits = guest.visitCount > 0 ? [plural(guest.visitCount, "visit")] : [];
  return [...contacts, ...visits].join(" · ");
}

export function stripTitle(mode: GuestLookupMode, name: string): string {
  return mode === "linked" ? `Using ${name}'s profile` : `Recognised ${name}`;
}

/** The one polite sentence announced on a pick, e.g. "Using Priya Shah's profile — 12 visits, 1 no-show. Allergy: shellfish." */
export function pickAnnouncement(mode: GuestLookupMode, guest: Guest): string {
  const history = [
    guest.visitCount > 0 ? plural(guest.visitCount, "visit") : ZERO_VISITS.toLowerCase(),
    noShowsSentence(guest.noShowCount),
  ]
    .filter((part) => part !== null)
    .join(", ");
  const allergies = (guest.dietaryRestrictions ?? []).filter(isAllergyTag);
  const allergyClause = allergies.length > 0 ? ` Allergy: ${allergies.join(", ")}.` : "";
  return `${stripTitle(mode, guest.name)} — ${history}.${allergyClause}`;
}
