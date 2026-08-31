import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@mbe/auth/react";
import { Button, Card, Text, Stack, useToast } from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useApiClient } from "../hooks/useApiClient.js";
import { StepIndicator } from "../components/venue-onboarding/StepIndicator";
import { isValidSlug } from "../components/venue-onboarding/BasicInfoStep";
import { WelcomeStep } from "../components/venue-onboarding/WelcomeStep";
import { LocationTimeStep } from "../components/venue-onboarding/LocationTimeStep";
import { OperatingHoursStep } from "../components/venue-onboarding/OperatingHoursStep";
import { SettingsStep } from "../components/venue-onboarding/SettingsStep";
import { FloorPlanStep } from "../components/venue-onboarding/FloorPlanStep";
import { LaunchStep } from "../components/venue-onboarding/LaunchStep";
import { runLaunchSequence } from "../components/venue-onboarding/launch-sequence.js";
import {
  buildOnboardingPayload,
  TOTAL_STEPS,
} from "../components/venue-onboarding/useOnboardingWizard.js";
import { useOnboardingWizardContext } from "../components/venue-onboarding/OnboardingWizardContext.js";
import styles from "./VenueOnboardingPage.module.css";

export function VenueOnboardingPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const api = useApiClient();
  const { venues, selectedVenueId, setVenueId, refetchVenues } = useVenue();
  const { toast } = useToast();
  // Set once LaunchStep's celebration animation finishes — a useState setter
  // is stable across renders, unlike setVenueId from context, so the
  // celebration timer's captured onCelebrationDone callback is never stale.
  const [celebrationDone, setCelebrationDone] = useState(false);

  const { step, data, errors, highestStepReached, slugStatus, launch, actions } =
    useOnboardingWizardContext();

  // The only real "a launch is in progress, don't let the user navigate away"
  // signal — isSubmitting/submitError were retired (#4824): nothing has
  // dispatched SUBMIT_START since actions.submit was retired in #4804, so
  // that flag was permanently false and never actually guarded anything.
  const launchInFlight = launch.inFlightStage !== null;

  // Debounced slug-uniqueness check — the actual check-and-dispatch lifecycle
  // (checking -> taken/available) lives entirely inside actions.checkSlugAvailability.
  useEffect(() => {
    const slug = data.basicInfo.slug.trim();
    if (!slug || !isValidSlug(slug) || !accessToken) {
      return;
    }

    const timer = setTimeout(() => {
      actions.checkSlugAvailability(api.venues.getBySlug(slug));
    }, 500);

    return () => clearTimeout(timer);
  }, [data.basicInfo.slug, accessToken, api, actions]);

  // Called by LaunchStep's Launch button, and by its Retry banner once a
  // stage fails. One resumable pass of the launch sequence from the
  // wizard's current progress — retry is the same call with the same
  // (partially-completed) progress, so a done stage never repeats. Errors
  // propagate so LaunchStep knows not to celebrate — the failure is already
  // visible via launch.failedStage, updated live through onProgress.
  const handleLaunch = async () => {
    const result = await runLaunchSequence(
      api,
      data.floorPlan,
      buildOnboardingPayload(data),
      launch,
      actions.setLaunchProgress
    );

    if (result.failedStage !== null) {
      throw new Error(result.errorMessage ?? "Something went wrong");
    }

    await refetchVenues();

    const venueName = data.basicInfo.name.trim();
    const planName = data.floorPlan.planName;
    const tableCount = data.floorPlan.tables.length;
    const description =
      tableCount > 0
        ? `"${venueName}" is ready with ${tableCount} tables on ${planName}.`
        : `"${venueName}" is ready. Add tables to ${planName} to start taking reservations.`;

    toast({
      title: "Venue is live",
      description,
      variant: "success",
      duration: 5000,
    });
  };

  // Called by LaunchStep once its brief success celebration finishes.
  // Navigation itself waits on the handoff effect below, which needs the
  // refetched venue list to have landed first.
  const handleCelebrationDone = () => {
    setCelebrationDone(true);
  };

  // Called by LaunchStep's Retry banner. Retry bypasses LaunchStep's own
  // celebration wrapper (that wrapper only wraps the primary Launch button),
  // so a successful retry never fires onCelebrationDone on its own — the
  // handoff effect below would then never navigate, leaving the manager
  // parked on the launch screen with a disabled Launch button even though
  // the venue is live. Marking celebrationDone directly on retry success
  // closes that gap without touching LaunchStep.
  const handleRetry = async () => {
    try {
      await handleLaunch();
      setCelebrationDone(true);
    } catch {
      // A failed retry already surfaces via launch.failedStage/errorMessage
      // (dispatched inside runLaunchSequence's onProgress) — nothing further
      // to do here besides preventing an unhandled rejection on a repeat
      // failure (#4824 Finding 2).
    }
  };

  // Handoff, part 1: once the refetched venue list contains the launched
  // venue and it isn't the active selection yet, select it. setVenueId
  // refuses an id absent from venues, which is exactly why this waits for
  // refetchVenues (inside handleLaunch) to land first.
  useEffect(() => {
    if (launch.venueId === null || selectedVenueId === launch.venueId) return;
    if (!venues.some((venue) => venue.id === launch.venueId)) return;
    setVenueId(launch.venueId);
  }, [venues, launch.venueId, selectedVenueId, setVenueId]);

  // Handoff, part 2: once the new venue is selected and the celebration has
  // finished, hand off into the floor plan editor. If the refetch above
  // never surfaces the new venue, selectedVenueId never matches and the
  // manager stays on the celebration rather than bouncing through
  // DashboardLayout's no-venue gate back to /onboarding.
  useEffect(() => {
    if (!celebrationDone || launch.floorPlanId === null) return;
    if (selectedVenueId !== launch.venueId) return;
    navigate(`/floor-plans/${launch.floorPlanId}`, { replace: true });
  }, [celebrationDone, launch.floorPlanId, launch.venueId, selectedVenueId, navigate]);

  // The floor plan canvas wants more room than the 40rem review card — widen
  // the container on step 5 only.
  const containerClassName =
    step === 5 ? `${styles.wizardContainer} ${styles.wizardContainerWide}` : styles.wizardContainer;

  return (
    <div className={containerClassName}>
      {/* Condensed progress indicator — mobile only; desktop uses the vertical
          rail in the OnboardingLayout brand panel (hidden here at >= 768px). */}
      <div className={styles.mobileProgress}>
        <StepIndicator
          currentStep={step}
          totalSteps={TOTAL_STEPS}
          highestStepReached={highestStepReached}
          onStepClick={launchInFlight ? undefined : actions.goToStep}
        />
      </div>

      <Card>
        <Stack gap="lg">
          {step === 1 && (
            <WelcomeStep
              data={data.basicInfo}
              errors={errors.basicInfo}
              onChange={(basicInfo) => actions.setStepData("basicInfo", basicInfo)}
              onValidate={actions.validateStep}
              slugStatus={slugStatus}
            />
          )}

          {step === 2 && (
            <>
              <Text variant="label">Location & Time</Text>
              <Text variant="caption" color="secondary">
                So we show the right time and currency.
              </Text>
              <LocationTimeStep
                data={data.locationTime}
                errors={errors.locationTime}
                onChange={(locationTime) => actions.setStepData("locationTime", locationTime)}
                onValidate={actions.validateStep}
              />
            </>
          )}

          {step === 3 && (
            <>
              <Text variant="label">Operating Hours</Text>
              <Text variant="caption" color="secondary">
                So guests know when you&apos;re open.
              </Text>
              <OperatingHoursStep
                data={data.operatingHours}
                errors={errors.operatingHours ?? undefined}
                onChange={(operatingHours) => actions.setStepData("operatingHours", operatingHours)}
              />
            </>
          )}

          {step === 4 && (
            <>
              <Text variant="label">Venue Settings</Text>
              <Text variant="caption" color="secondary">
                Customize how bookings work — or use our recommended defaults.
              </Text>
              <SettingsStep
                data={data.settings}
                errors={errors.settings}
                onChange={(settings) => actions.setStepData("settings", settings)}
                onValidate={actions.validateStep}
                onAdvance={actions.next}
              />
            </>
          )}

          {step === 5 && (
            <FloorPlanStep
              draft={data.floorPlan}
              error={errors.floorPlan}
              onSelectTemplate={actions.setTemplate}
              onAddTable={actions.addDraftTable}
              onMoveTable={actions.moveDraftTable}
              onRemoveTable={actions.removeDraftTable}
            />
          )}

          {step === 6 && (
            <LaunchStep
              basicInfo={data.basicInfo}
              locationTime={data.locationTime}
              operatingHours={data.operatingHours}
              settings={data.settings}
              onLaunch={handleLaunch}
              onCelebrationDone={handleCelebrationDone}
              floorPlan={data.floorPlan}
              launch={launch}
              onRetry={handleRetry}
            />
          )}

          <Stack direction="row" gap="md" justify="between">
            <Button
              variant="secondary"
              onClick={actions.back}
              disabled={step === 1 || launchInFlight}
            >
              Back
            </Button>

            {step < TOTAL_STEPS && (
              <Button variant="primary" onClick={actions.next}>
                Next
              </Button>
            )}
          </Stack>
        </Stack>
      </Card>
    </div>
  );
}
