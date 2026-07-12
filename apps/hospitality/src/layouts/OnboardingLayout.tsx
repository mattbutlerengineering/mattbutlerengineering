import { Outlet } from "react-router-dom";
import { Heading, Text, Stack } from "@mattbutlerengineering/rialto";
import { VenueProvider } from "../contexts/VenueContext.js";
import {
  OnboardingWizardProvider,
  useOnboardingWizardContext,
} from "../components/venue-onboarding/OnboardingWizardContext.js";
import { VerticalStepRail } from "../components/venue-onboarding/VerticalStepRail.js";
import styles from "./OnboardingLayout.module.css";

const PRODUCT_NAME = "Hospitality";
const TAGLINE = "Restaurant management, simplified.";

/** Brand panel: product identity plus the live vertical progress rail (desktop). */
function OnboardingBrandPanel() {
  const { step, highestStepReached, isSubmitting, actions } = useOnboardingWizardContext();
  return (
    <aside className={styles.brand}>
      <Stack gap="md">
        <Heading level={1} color="primary">
          {PRODUCT_NAME}
        </Heading>
        <Text variant="body" color="secondary">
          {TAGLINE}
        </Text>
      </Stack>
      <div className={styles.stepContext}>
        <VerticalStepRail
          currentStep={step}
          highestStepReached={highestStepReached}
          onStepClick={isSubmitting ? undefined : actions.goToStep}
        />
      </div>
    </aside>
  );
}

/**
 * Full-viewport split-panel shell for the venue-onboarding flow.
 *
 * Left: a brand panel (product name + tagline) that also hosts the always-visible
 * vertical progress rail on desktop. Right: the wizard content, rendered through
 * an `<Outlet />`.
 *
 * The onboarding wizard state is owned here (via `OnboardingWizardProvider`) so
 * the left rail and the `<Outlet />`-rendered step form share one source of truth
 * for the current step; the reducer itself (`useOnboardingWizard`) is unchanged.
 *
 * Wraps children in `VenueProvider` because the onboarding wizard calls
 * `useVenue()` / `refetchVenues()` (and `useVenueReadiness()` indirectly). Unlike
 * `DashboardLayout`, it deliberately omits `SSESyncProvider` — a user reaching
 * onboarding has no venue to sync yet.
 */
export function OnboardingLayout() {
  return (
    <VenueProvider>
      <OnboardingWizardProvider>
        <div className={styles.layout}>
          <OnboardingBrandPanel />
          <main className={styles.content}>
            <Outlet />
          </main>
        </div>
      </OnboardingWizardProvider>
    </VenueProvider>
  );
}
