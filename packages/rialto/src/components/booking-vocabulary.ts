import type { GuestRiskMessages, ReservationStatusMessages } from "../i18n/messages";

/** A Badge tone for a status or risk word. */
export type VocabularyTone = "neutral" | "success" | "warning" | "error";

export type ReservationStatusKey = keyof ReservationStatusMessages;
export type GuestRiskKey = keyof GuestRiskMessages;

/** A raw tool value resolved to its locale key (undefined when unknown) and Badge tone. */
export interface Resolved<K extends string> {
  readonly key: K | undefined;
  readonly tone: VocabularyTone;
}

/**
 * Tones copied from the hospitality dashboard (`STATUS_BADGE_VARIANT`):
 * pending warning, confirmed success, cancelled and no-show error, completed
 * neutral. The dashboard gives seated no tone, so it stays neutral.
 */
const STATUS: Readonly<Record<string, Resolved<ReservationStatusKey>>> = {
  PENDING: { key: "pending", tone: "warning" },
  CONFIRMED: { key: "confirmed", tone: "success" },
  CANCELLED: { key: "cancelled", tone: "error" },
  COMPLETED: { key: "completed", tone: "neutral" },
  NO_SHOW: { key: "noShow", tone: "error" },
  SEATED: { key: "seated", tone: "neutral" },
};

/** Tones copied from the dashboard's `getRiskVariant`: risky error, standard warning, trusted neutral. */
const RISK: Readonly<Record<string, Resolved<GuestRiskKey>>> = {
  RISKY: { key: "risky", tone: "error" },
  STANDARD: { key: "standard", tone: "warning" },
  TRUSTED: { key: "trusted", tone: "neutral" },
};

const UNKNOWN = { key: undefined, tone: "neutral" } as const;

/** Trims, upper-cases, and turns runs of spaces and hyphens into `_`, so "No show" and "no-show" read as NO_SHOW. */
function canonical(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

/** Resolves a raw reservation status (as a tool or model wrote it). Unknown values give no key; the caller shows the raw string. */
export function normalizeReservationStatus(raw: string): Resolved<ReservationStatusKey> {
  return STATUS[canonical(raw)] ?? UNKNOWN;
}

/** Resolves a raw guest risk score. Unknown values give no key; the caller shows the raw string. */
export function normalizeGuestRisk(raw: string): Resolved<GuestRiskKey> {
  return RISK[canonical(raw)] ?? UNKNOWN;
}
