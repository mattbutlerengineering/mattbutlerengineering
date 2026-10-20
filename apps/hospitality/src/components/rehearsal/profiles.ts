export type RehearsalProfileId = "friday" | "weeknight" | "brunch";

export interface PartySizeWeight {
  readonly size: number;
  readonly weight: number;
}

export interface RehearsalProfile {
  readonly id: RehearsalProfileId;
  /** Rehearsal hours, in whole minutes from venue midnight (not the venue's real hours). */
  readonly openMinute: number;
  readonly closeMinute: number;
  /** Relative demand across the night, split evenly over its length. */
  readonly curve: readonly number[];
  /** Expected booked parties per table per hour at curve weight 1. */
  readonly bookingsPerTableHour: number;
  /** Expected walk-in parties per table per hour at curve weight 1. */
  readonly walkInsPerTableHour: number;
  /** Chance that a booking never arrives. */
  readonly noShowRate: number;
  readonly partySizes: readonly PartySizeWeight[];
}

const COMMON_SIZES: readonly PartySizeWeight[] = [
  { size: 2, weight: 40 },
  { size: 3, weight: 10 },
  { size: 4, weight: 28 },
  { size: 5, weight: 6 },
  { size: 6, weight: 10 },
  { size: 8, weight: 6 },
];

export const REHEARSAL_PROFILES: Readonly<Record<RehearsalProfileId, RehearsalProfile>> = {
  friday: {
    id: "friday",
    openMinute: 17 * 60,
    closeMinute: 23 * 60,
    curve: [0.5, 0.9, 1, 0.85, 0.5, 0.2],
    bookingsPerTableHour: 0.55,
    walkInsPerTableHour: 0.3,
    noShowRate: 0.1,
    partySizes: COMMON_SIZES,
  },
  weeknight: {
    id: "weeknight",
    openMinute: 17 * 60,
    closeMinute: 22 * 60,
    curve: [0.4, 0.7, 0.6, 0.35, 0.15],
    bookingsPerTableHour: 0.35,
    walkInsPerTableHour: 0.12,
    noShowRate: 0.06,
    partySizes: COMMON_SIZES,
  },
  brunch: {
    id: "brunch",
    openMinute: 9 * 60,
    closeMinute: 14 * 60,
    curve: [0.4, 0.9, 1, 0.6, 0.2],
    bookingsPerTableHour: 0.4,
    walkInsPerTableHour: 0.25,
    noShowRate: 0.05,
    partySizes: COMMON_SIZES,
  },
};

/** Demand weight at a minute of the night, from the profile's curve. */
export function demandAt(profile: RehearsalProfile, minute: number): number {
  const span = profile.closeMinute - profile.openMinute;
  const fraction = Math.min(Math.max((minute - profile.openMinute) / span, 0), 0.999999);
  return profile.curve[Math.floor(fraction * profile.curve.length)] ?? 0;
}
