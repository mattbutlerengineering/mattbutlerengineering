/**
 * Canonical step metadata for the venue-onboarding wizard (from #3275).
 *
 * Shared by the desktop `VerticalStepRail` (label + description) and the
 * condensed mobile `StepIndicator` (label only, surfaced via aria-label), so
 * both progress views stay in lock-step. The text lives in the locale's
 * catalog under `onboarding.steps.<id>.{label,description}`.
 */
export type OnboardingStepId =
  "welcome" | "location" | "hours" | "settings" | "floorPlan" | "launch";

export interface OnboardingStep {
  readonly id: OnboardingStepId;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "welcome" },
  { id: "location" },
  { id: "hours" },
  { id: "settings" },
  { id: "floorPlan" },
  { id: "launch" },
];
