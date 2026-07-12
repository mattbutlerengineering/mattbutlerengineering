import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useOnboardingWizard, type OnboardingWizardResult } from "./useOnboardingWizard.js";

/**
 * Shared wizard state for the onboarding flow.
 *
 * The wizard reducer is owned once, above the route boundary, so the vertical
 * progress rail in `OnboardingLayout`'s brand panel and the step form rendered
 * through the `<Outlet />` read the exact same `step` / `highestStepReached`.
 * The reducer itself (`useOnboardingWizard`) is unchanged — this only lifts
 * ownership up a level.
 */
const OnboardingWizardContext = createContext<OnboardingWizardResult | null>(null);

export function OnboardingWizardProvider({ children }: { children: ReactNode }) {
  const wizard = useOnboardingWizard();
  return (
    <OnboardingWizardContext.Provider value={wizard}>{children}</OnboardingWizardContext.Provider>
  );
}

export function useOnboardingWizardContext(): OnboardingWizardResult {
  const wizard = useContext(OnboardingWizardContext);
  if (!wizard) {
    throw new Error("useOnboardingWizardContext must be used within an OnboardingWizardProvider");
  }
  return wizard;
}
