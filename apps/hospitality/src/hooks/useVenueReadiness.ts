import { useMemo } from "react";
import { useAuth } from "@mbe/auth/react";
import { useVenue } from "../contexts/VenueContext.js";
import { useFloorPlans } from "./useFloorPlans.js";
import type { Venue } from "@mbe/types";
import type { FloorPlan } from "@mbe/types";

export type SetupStep = "onboarding" | "operating-hours" | "floor-plan";

export interface VenueReadiness {
  status: "loading" | "no-venue" | "setup" | "operational";
  completedSteps: readonly SetupStep[];
  nextStep: SetupStep | null;
  progress: number; // 0–100
}

export const STEP_ORDER: readonly SetupStep[] = ["onboarding", "operating-hours", "floor-plan"];

const LOADING: VenueReadiness = {
  status: "loading",
  completedSteps: [],
  nextStep: null,
  progress: 0,
};

/**
 * Pure function that computes readiness from venue data and floor plans.
 * Can be unit tested independently from React.
 *
 * `isError` distinguishes a *failed* floor-plan fetch from a genuinely *empty*
 * one: on error we cannot tell "setup" from "operational", so we return the
 * indeterminate loading state rather than falsely reporting "setup" (which
 * would bounce the user to /setup). An empty list, by contrast, legitimately
 * means the floor-plan gate is unmet.
 */
export function computeReadiness(
  venue: Venue | null,
  floorPlans: readonly FloorPlan[],
  isError = false
): VenueReadiness {
  if (!venue) {
    return { status: "no-venue", completedSteps: [], nextStep: null, progress: 0 };
  }

  if (isError) {
    return LOADING;
  }

  const completed: SetupStep[] = [];

  // Gate 1: Onboarding — venue exists with name, timezone, currency
  if (venue.name && venue.ianaTimezone && venue.currencyCode) {
    completed.push("onboarding");
  }

  // Gate 2: Operating hours — at least one day that's not closed
  if (venue.operatingHours) {
    const days = Object.values(venue.operatingHours);
    const hasOpenDay = days.some((day) => day !== undefined && day.closed !== true);
    if (hasOpenDay) {
      completed.push("operating-hours");
    }
  }

  // Gate 3: Floor plan with at least one table
  const hasFloorPlanWithTables = floorPlans.some((fp) => fp.tables && fp.tables.length > 0);
  if (hasFloorPlanWithTables) {
    completed.push("floor-plan");
  }

  const progress = (completed.length / STEP_ORDER.length) * 100;

  if (completed.length === STEP_ORDER.length) {
    return { status: "operational", completedSteps: completed, nextStep: null, progress };
  }

  const nextStep = STEP_ORDER.find((step) => !completed.includes(step)) ?? null;
  return { status: "setup", completedSteps: completed, nextStep, progress };
}

export function useVenueReadiness(): VenueReadiness {
  const { selectedVenue, selectedVenueId, isLoading } = useVenue();
  const { accessToken } = useAuth();
  const enabled = !!selectedVenueId && !!accessToken;

  // Compose the shared react-query floor-plans hook instead of a bespoke effect.
  // The query is keyed by venueId, so switching venues fetches fresh data and
  // in-flight requests for stale venues are ignored by react-query.
  const {
    data: floorPlans,
    error,
  } = useFloorPlans({ venueId: selectedVenueId, limit: 10, enabled });

  const isError = error !== null;

  const readiness = useMemo(
    () => computeReadiness(selectedVenue, floorPlans ?? [], isError),
    [selectedVenue, floorPlans, isError]
  );

  if (isLoading) {
    return LOADING;
  }

  // Venue is resolved, but its floor plans are still loading (and haven't
  // errored) — we cannot yet distinguish "setup" from "operational", so stay in
  // the indeterminate loading state instead of flapping to "setup" and
  // triggering a spurious /setup -> /timeline redirect. (See #1968 cluster A.)
  const awaitingFloorPlans = enabled && floorPlans === undefined && !isError;
  if (awaitingFloorPlans) {
    return LOADING;
  }

  return readiness;
}
