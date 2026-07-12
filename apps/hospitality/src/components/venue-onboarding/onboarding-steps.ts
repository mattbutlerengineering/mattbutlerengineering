/**
 * Canonical step metadata for the venue-onboarding wizard (from #3275).
 *
 * Shared by the desktop `VerticalStepRail` (label + description) and the
 * condensed mobile `StepIndicator` (label only, surfaced via aria-label), so
 * both progress views stay in lock-step with the same labels.
 */
export interface OnboardingStep {
  /** Short step name shown as the rail heading. */
  label: string;
  /** One-line description of what the step captures. */
  description: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { label: "Welcome", description: "Name your venue" },
  { label: "Location", description: "Timezone & currency" },
  { label: "Hours", description: "When you're open" },
  { label: "Settings", description: "Reservation defaults" },
  { label: "Launch", description: "Review & go live" },
];
