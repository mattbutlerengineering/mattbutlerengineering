import { useState, useEffect, useRef } from "react";
import { createApiClient } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";
import { useVenue } from "../contexts/VenueContext.js";

export type SetupStep = "onboarding" | "operating-hours" | "floor-plan";

export interface VenueReadiness {
  status: "no-venue" | "setup" | "operational";
  completedSteps: readonly SetupStep[];
  nextStep: SetupStep | null;
  progress: number; // 0–100
}

const READY: VenueReadiness = {
  status: "operational",
  completedSteps: ["onboarding", "operating-hours", "floor-plan"],
  nextStep: null,
  progress: 100,
};

const NO_VENUE: VenueReadiness = {
  status: "no-venue",
  completedSteps: [],
  nextStep: "onboarding",
  progress: 0,
};

interface FloorPlanState {
  venueId: string;
  hasFloorPlan: boolean;
}

export function useVenueReadiness(): VenueReadiness {
  const { selectedVenue, selectedVenueId, isLoading } = useVenue();
  const { accessToken } = useAuth();
  // Tracks the last resolved floor-plan check result
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
        const hasAtLeastOne = response.data.some(
          (fp) => fp.tables !== undefined && fp.tables.length > 0
        );
        setFloorPlanState({ venueId: selectedVenueId, hasFloorPlan: hasAtLeastOne });
      })
      .catch(() => {
        if (!cancelled) {
          setFloorPlanState({ venueId: selectedVenueId, hasFloorPlan: false });
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

  if (isLoading) {
    return { status: "setup", completedSteps: [], nextStep: "onboarding", progress: 0 };
  }

  if (!selectedVenue) {
    return NO_VENUE;
  }

  // Evaluate gates
  const onboardingComplete = true; // Venue exists = onboarding complete
  const hasOperatingHours =
    selectedVenue.operatingHours !== null &&
    selectedVenue.operatingHours !== undefined &&
    Object.values(selectedVenue.operatingHours).some(
      (schedule) => schedule !== undefined
    );

  // Floor plan is current only if checked matches selected venue
  const floorPlanReady =
    floorPlanState !== null &&
    floorPlanState.venueId === selectedVenueId &&
    floorPlanState.hasFloorPlan;

  const completedSteps: SetupStep[] = [];
  if (onboardingComplete) completedSteps.push("onboarding");
  if (hasOperatingHours) completedSteps.push("operating-hours");
  if (floorPlanReady) completedSteps.push("floor-plan");

  const allComplete = onboardingComplete && hasOperatingHours && floorPlanReady;

  if (allComplete) return READY;

  // Determine next step
  let nextStep: SetupStep;
  if (!onboardingComplete) {
    nextStep = "onboarding";
  } else if (!hasOperatingHours) {
    nextStep = "operating-hours";
  } else {
    nextStep = "floor-plan";
  }

  const progress = Math.round((completedSteps.length / 3) * 100);

  return {
    status: "setup",
    completedSteps,
    nextStep,
    progress,
  };
}
