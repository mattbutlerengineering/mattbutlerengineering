/**
 * Guest lookup rows — the pure copy rules behind the typeahead's listbox rows, the history
 * strip's sentences and the pick announcement (ux.md § Copy). Pure like `guest-signals.ts`.
 */

import type { TFunction } from "i18next";
import type { Guest } from "@mbe/types";
import { defaultT } from "../../i18n/default-t.js";
import { isAllergyTag } from "./guest-signals.js";

/** "linked" attaches the profile (reservation, walk-in); "recognised" only prefills (waitlist, Q3). */
export type GuestLookupMode = "linked" | "recognised";

/** "{N} visit|visits", or the honest zero state — never "0 visits" (Q4). */
export function visitsSentence(visitCount: number, t: TFunction = defaultT): string {
  return visitCount > 0 ? t("crm.visit", { count: visitCount }) : t("crm.noVisits");
}

/** "{N} no-show|no-shows"; null at zero so the strip omits the row. */
export function noShowsSentence(noShowCount: number, t: TFunction = defaultT): string | null {
  return noShowCount > 0 ? t("crm.noShow", { count: noShowCount }) : null;
}

/** Row line 2: phone · email · visits, omitting null contacts and zero visits. */
export function formatGuestRowDetail(guest: Guest, t: TFunction = defaultT): string {
  const contacts = [guest.phone, guest.email].filter((part): part is string => Boolean(part));
  if (contacts.length === 0 && guest.visitCount === 0) return t("crm.noContact");
  const visits = guest.visitCount > 0 ? [t("crm.visit", { count: guest.visitCount })] : [];
  return [...contacts, ...visits].join(" · ");
}

export function stripTitle(mode: GuestLookupMode, name: string, t: TFunction = defaultT): string {
  return mode === "linked" ? t("crm.stripLinked", { name }) : t("crm.stripRecognised", { name });
}

/** The one polite sentence announced on a pick, e.g. "Using Priya Shah's profile — 12 visits, 1 no-show. Allergy: shellfish." */
export function pickAnnouncement(
  mode: GuestLookupMode,
  guest: Guest,
  t: TFunction = defaultT
): string {
  const history = [
    guest.visitCount > 0 ? t("crm.visit", { count: guest.visitCount }) : t("crm.noVisitsInline"),
    noShowsSentence(guest.noShowCount, t),
  ]
    .filter((part) => part !== null)
    .join(", ");
  const allergies = (guest.dietaryRestrictions ?? []).filter(isAllergyTag);
  const allergyClause =
    allergies.length > 0 ? ` ${t("crm.allergyList", { list: allergies.join(", ") })}` : "";
  return `${stripTitle(mode, guest.name, t)} — ${history}.${allergyClause}`;
}
