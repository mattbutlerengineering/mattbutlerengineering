/**
 * Guest signals — the segment, risk and allergy rules `GuestCard` applies, exported once so the
 * Briefing card, the booking history strip and the Timeline sheet read the same facts
 * (ux.md decision (g)).
 */

import type { GuestRiskScore } from "@mbe/types";

/** Substrings that mark a dietary restriction as an allergy (ux.md Screen 1). */
export const ALLERGY_KEYWORDS: readonly string[] = ["allergy", "nut", "shellfish", "dairy"];

export type GuestSegmentLabel = "VIP" | "Repeat" | "New";
export type GuestSegmentVariant = "accent" | "success" | "neutral";
export type GuestRiskVariant = "error" | "warning" | "neutral";

/** True when a dietary restriction reads as an allergy (case-insensitive substring match). */
export function isAllergyTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return ALLERGY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** VIP on a `vip` tag (any case) or ten-plus visits; Repeat from the second visit; else New. */
export function getSegmentLabel(visitCount: number, tags: readonly string[] | null): string {
  const tagList = (tags ?? []).map((tag) => tag.toLowerCase());
  if (tagList.includes("vip") || visitCount >= 10) return "VIP";
  if (visitCount >= 2) return "Repeat";
  return "New";
}

export function getSegmentVariant(label: string): GuestSegmentVariant {
  if (label === "VIP") return "accent";
  if (label === "Repeat") return "success";
  return "neutral";
}

/** Lifted from GuestCard unchanged: risky → error, standard → warning, everything else neutral. */
export function getRiskVariant(score: GuestRiskScore): GuestRiskVariant {
  if (score === "risky") return "error";
  if (score === "standard") return "warning";
  return "neutral";
}

export function getRiskLabel(score: GuestRiskScore): string {
  if (score === "risky") return "Risky";
  if (score === "standard") return "Standard";
  return "Trusted";
}
