import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Button, Card, Text, Stack, useToast } from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useApiClient } from "../hooks/useApiClient.js";
import { StepIndicator } from "../components/venue-onboarding/StepIndicator";
import { BasicInfoStep, isValidSlug } from "../components/venue-onboarding/BasicInfoStep";
import { LocationTimeStep } from "../components/venue-onboarding/LocationTimeStep";
import { OperatingHoursStep } from "../components/venue-onboarding/OperatingHoursStep";
import { SettingsStep } from "../components/venue-onboarding/SettingsStep";
import { LaunchStep } from "../components/venue-onboarding/LaunchStep";
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
  const { refetchVenues } = useVenue();
  const { toast } = useToast();

  const { step, data, errors, highestStepReached, slugStatus, isSubmitting, submitError, actions } =
    useOnboardingWizardContext();

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

  // Called by LaunchStep's Launch button. Errors propagate so LaunchStep
  // knows not to celebrate — submitError is already populated on the wizard
  // by actions.submit() for display.
  const handleLaunch = async () => {
    const createPromise = accessToken
      ? api.venues.create(buildOnboardingPayload(data))
      : Promise.reject(new Error("You must be signed in to create a venue"));

    await actions.submit(createPromise);
    await refetchVenues();
    toast({
      title: "Venue created",
      description: `"${data.basicInfo.name.trim()}" is ready — finish setup to start taking reservations`,
      variant: "success",
      duration: 5000,
    });
  };

  // Called by LaunchStep once its brief success celebration finishes —
  // client-side navigation only, so the SPA transitions straight into
  // DashboardLayout with no hard reload.
  const handleCelebrationDone = () => {
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className={styles.wizardContainer}>
      {/* Condensed progress indicator — mobile only; desktop uses the vertical
          rail in the OnboardingLayout brand panel (hidden here at >= 768px). */}
      <div className={styles.mobileProgress}>
        <StepIndicator
          currentStep={step}
          totalSteps={TOTAL_STEPS}
          highestStepReached={highestStepReached}
          onStepClick={isSubmitting ? undefined : actions.goToStep}
        />
      </div>

      <Card>
        <Stack gap="lg">
          {step === 1 && (
            <>
              <Text variant="label">Basic Information</Text>
              <BasicInfoStep
                data={data.basicInfo}
                errors={errors.basicInfo}
                onChange={(basicInfo) => actions.setStepData("basicInfo", basicInfo)}
                onValidate={actions.validateStep}
                slugStatus={slugStatus}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text variant="label">Location & Time</Text>
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
            <LaunchStep
              basicInfo={data.basicInfo}
              locationTime={data.locationTime}
              operatingHours={data.operatingHours}
              settings={data.settings}
              isSubmitting={isSubmitting}
              submitError={submitError}
              onLaunch={handleLaunch}
              onCelebrationDone={handleCelebrationDone}
            />
          )}

          <Stack direction="row" gap="md" justify="between">
            <Button
              variant="secondary"
              onClick={actions.back}
              disabled={step === 1 || isSubmitting}
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
