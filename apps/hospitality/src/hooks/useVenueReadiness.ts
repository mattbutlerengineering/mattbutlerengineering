import { useState, useEffect, useRef, useMemo } from "react";
import { createApiClient } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";
import { useVenue } from "../contexts/VenueContext.js";
import type { Venue } from "@mbe/types";
import type { FloorPlan } from "@mbe/types";

export type SetupStep = "onboarding" | "operating-hours" | "floor-plan";

export interface VenueReadiness {
  status: "no-venue" | "setup" | "operational";
  completedSteps: readonly SetupStep[];
  nextStep: SetupStep | null;
  progress: number; // 0–100
}

export const STEP_ORDER: readonly SetupStep[] = ["onboarding", "operating-hours", "floor-plan"];

const NO_VENUE: VenueReadiness = {
  status: "no-venue",
  completedSteps: [],
  nextStep: null,
  progress: 0,
};

/**
 * Pure function that computes readiness from venue data and floor plans.
 * Can be unit tested independently from React.
 */
export function computeReadiness(
  venue: Venue | null,
  floorPlans: readonly FloorPlan[]
): VenueReadiness {
  if (!venue) {
    return { status: "no-venue", completedSteps: [], nextStep: null, progress: 0 };
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

interface FloorPlanState {
  venueId: string;
  floorPlans: readonly FloorPlan[];
}

export function useVenueReadiness(): VenueReadiness {
  const { selectedVenue, selectedVenueId, isLoading } = useVenue();
  const { accessToken } = useAuth();
  // Tracks the last resolved floor-plan fetch result
  const [floorPlanState, setFloorPlanState] = useState<FloorPlanState | null>(null);
  const fetchingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedVenueId || !accessToken) return;
    // Skip if we've already fetched or are currently fetching for this venue
    if (fetchingRef.current === selectedVenueId) return;
    if (floorPlanState?.venueId === selectedVenueId) return;

    fetchingRef.current = selectedVenueId;

    const api = createApiClient({
      baseUrl: import.meta.env.VITE_API_URL ?? "",
      getAccessToken: () => accessToken,
    });

    let cancelled = false;

    api.floorPlans
      .list({ venueId: selectedVenueId, limit: 10 })
      .then((response) => {
        if (cancelled) return;
        setFloorPlanState({ venueId: selectedVenueId, floorPlans: response.data });
      })
      .catch(() => {
        if (!cancelled) {
          setFloorPlanState({ venueId: selectedVenueId, floorPlans: [] });
        }
      })
      .finally(() => {
        if (fetchingRef.current === selectedVenueId) {
          fetchingRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVenueId, accessToken, floorPlanState]);

  // The floor plans relevant to the currently selected venue
  const currentFloorPlans: readonly FloorPlan[] =
    floorPlanState?.venueId === selectedVenueId ? floorPlanState.floorPlans : [];

  const readiness = useMemo(
    () => computeReadiness(selectedVenue, currentFloorPlans),
    [selectedVenue, currentFloorPlans]
  );

  if (isLoading) {
    return NO_VENUE;
  }

  return readiness;
}
