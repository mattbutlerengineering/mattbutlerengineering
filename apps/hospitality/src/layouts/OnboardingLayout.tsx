import { Outlet } from "react-router-dom";
import { Heading, Text, Stack } from "@mattbutlerengineering/rialto";
import { VenueProvider } from "../contexts/VenueContext.js";
import styles from "./OnboardingLayout.module.css";

const PRODUCT_NAME = "Hospitality";
const TAGLINE = "Restaurant management, simplified.";

/**
 * Full-viewport split-panel shell for the venue-onboarding flow.
 *
 * Left: a static brand panel (product name + tagline, plus a reserved slot for
 * per-step context to be enriched by a later slice of #3275). Right: the wizard
 * content, rendered through an `<Outlet />`.
 *
 * Wraps children in `VenueProvider` because the onboarding wizard calls
 * `useVenue()` / `refetchVenues()` (and `useVenueReadiness()` indirectly). Unlike
 * `DashboardLayout`, it deliberately omits `SSESyncProvider` — a user reaching
 * onboarding has no venue to sync yet.
 */
export function OnboardingLayout() {
  return (
    <VenueProvider>
      <div className={styles.layout}>
        <aside className={styles.brand}>
          <Stack gap="md">
            <Heading level={1} color="primary">
              {PRODUCT_NAME}
            </Heading>
            <Text variant="body" color="secondary">
              {TAGLINE}
            </Text>
          </Stack>
          {/* Reserved for per-step context (illustration/copy) — filled by a later slice of #3275. */}
          <div className={styles.stepContext} aria-hidden="true" />
        </aside>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </VenueProvider>
  );
}
