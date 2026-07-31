/**
 * Onboarding step machine — pure logic for the four-step getting-started example.
 *
 * Framework-free so the navigation rules and the launch summary can be unit-tested
 * without React. The showcase page (OnboardingExamplePage) holds the answers in
 * local React state and delegates every step decision here.
 */

/* ── Steps ───────────────────────────────────── */

export type OnboardingStepId = "property" | "spaces" | "preferences" | "launch";

export interface OnboardingStepDef {
  id: OnboardingStepId;
  /** Short label for the persistent progress rail. */
  label: string;
  /** One-line rail description of what the step asks for. */
  description: string;
  /** Panel heading — the element focus moves to when the step changes. */
  heading: string;
  /** Panel sub-heading, in the product's own voice. */
  blurb: string;
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: "property",
    label: "Property",
    description: "Name and type",
    heading: "Tell us about your property",
    blurb: "This is the name guests see on confirmations and receipts.",
  },
  {
    id: "spaces",
    label: "Spaces",
    description: "What you rent out",
    heading: "Set up your spaces",
    blurb: "Pick the closest match — you can add individual spaces later.",
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "How you take bookings",
    heading: "Choose how bookings work",
    blurb: "Sensible defaults are pre-selected. Change them any time in Settings.",
  },
  {
    id: "launch",
    label: "Launch",
    description: "You're live",
    heading: "You're ready to take bookings",
    blurb: "Your property is live. Here's what we set up for you.",
  },
];

/** Index of the first step — Back is disabled here. */
export const FIRST_STEP_INDEX = 0;

/** Index of the terminal launch step, which shows a completion state instead of Next. */
export const LAST_STEP_INDEX = ONBOARDING_STEPS.length - 1;

/** The next step, clamped at the launch step. */
export function nextStep(index: number): number {
  return Math.min(index + 1, LAST_STEP_INDEX);
}

/** The previous step, clamped at the first step. */
export function previousStep(index: number): number {
  return Math.max(index - 1, FIRST_STEP_INDEX);
}

/** True on the terminal launch step. */
export function isFinalStep(index: number): boolean {
  return index === LAST_STEP_INDEX;
}

/** Whole-percent completion for the rail's progress bar — the current step counts as done. */
export function completionPercent(index: number): number {
  return Math.round(((index + 1) / ONBOARDING_STEPS.length) * 100);
}

/* ── Answers (fixture defaults, no service calls) ── */

export type PropertyType = "boutique" | "resort" | "inn";

export const PROPERTY_TYPES: { id: PropertyType; label: string }[] = [
  { id: "boutique", label: "Boutique hotel" },
  { id: "resort", label: "Resort" },
  { id: "inn", label: "Inn" },
];

export interface SpacePreset {
  value: string;
  label: string;
}

export const SPACE_PRESETS: SpacePreset[] = [
  { value: "rooms", label: "Guest rooms only" },
  { value: "rooms-dining", label: "Guest rooms and dining" },
  { value: "rooms-dining-events", label: "Guest rooms, dining, and event space" },
];

export interface OnboardingState {
  propertyName: string;
  propertyType: PropertyType;
  spacePreset: string;
  instantBooking: boolean;
  requireDeposit: boolean;
}

/**
 * Pre-filled with a plausible property so the launch summary reads as a real
 * account and the example is meaningful without typing anything first.
 */
export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  propertyName: "Harbor House",
  propertyType: "boutique",
  spacePreset: "rooms-dining",
  instantBooking: true,
  requireDeposit: false,
};

/* ── Launch summary ──────────────────────────── */

export interface SummaryRow {
  label: string;
  value: string;
}

function labelFor<T extends { label: string }>(
  options: T[],
  match: (option: T) => boolean
): string {
  return options.find(match)?.label ?? "—";
}

/** Restates every answer the flow collected, for the launch step's summary list. */
export function launchSummary(state: OnboardingState): SummaryRow[] {
  return [
    { label: "Property", value: state.propertyName },
    { label: "Type", value: labelFor(PROPERTY_TYPES, (t) => t.id === state.propertyType) },
    { label: "Spaces", value: labelFor(SPACE_PRESETS, (p) => p.value === state.spacePreset) },
    { label: "Instant booking", value: state.instantBooking ? "On" : "Off" },
    { label: "Deposit required", value: state.requireDeposit ? "Yes" : "No" },
  ];
}
