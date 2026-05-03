import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Button, Card, Text, Stack, useToast } from "@mattbutlerengineering/rialto";
import { ApiClient, VenuesClient } from "@mbe/api-client";
import type { OperatingHours, CreateVenueRequest, VenueSettings } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader";
import { StepIndicator } from "../components/venue-onboarding/StepIndicator";
import { BasicInfoStep } from "../components/venue-onboarding/BasicInfoStep";
import { LocationTimeStep, detectTimezone } from "../components/venue-onboarding/LocationTimeStep";
import {
  OperatingHoursStep,
  validateOperatingHours,
} from "../components/venue-onboarding/OperatingHoursStep";
import type { OperatingHoursValidationErrors } from "../components/venue-onboarding/OperatingHoursStep";
import { SettingsStep } from "../components/venue-onboarding/SettingsStep";
import { ConfirmationStep } from "../components/venue-onboarding/ConfirmationStep";
import type { BasicInfoData } from "../components/venue-onboarding/BasicInfoStep";
import type { LocationTimeData } from "../components/venue-onboarding/LocationTimeStep";
import type { SettingsData } from "../components/venue-onboarding/SettingsStep";
import styles from "./VenueOnboardingPage.module.css";

const TOTAL_STEPS = 5;

const INITIAL_BASIC_INFO: BasicInfoData = {
  name: "",
  slug: "",
  venueGroupId: "",
};

const INITIAL_LOCATION_TIME: LocationTimeData = {
  ianaTimezone: detectTimezone(),
  currencyCode: "USD",
};

const INITIAL_OPERATING_HOURS: OperatingHours = {};

const INITIAL_SETTINGS: SettingsData = {
  defaultReservationDuration: "",
  maxPartySize: "",
  advanceBookingDays: "",
};

/** Validate slug is URL-safe: lowercase alphanumeric and hyphens only. */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function VenueOnboardingPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { refetchVenues } = useVenue();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step data — each piece of state is immutable (replaced, never mutated)
  const [basicInfo, setBasicInfo] = useState<BasicInfoData>(INITIAL_BASIC_INFO);
  const [locationTime, setLocationTime] = useState<LocationTimeData>(INITIAL_LOCATION_TIME);
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(INITIAL_OPERATING_HOURS);
  const [settings, setSettings] = useState<SettingsData>(INITIAL_SETTINGS);

  // Validation errors per step
  const [basicInfoErrors, setBasicInfoErrors] = useState<
    Partial<Record<keyof BasicInfoData, string>>
  >({});
  const [locationTimeErrors, setLocationTimeErrors] = useState<
    Partial<Record<keyof LocationTimeData, string>>
  >({});
  const [settingsErrors, setSettingsErrors] = useState<Partial<Record<keyof SettingsData, string>>>(
    {}
  );
  const [operatingHoursErrors, setOperatingHoursErrors] =
    useState<OperatingHoursValidationErrors | null>(null);

  // Track which steps have been completed (for step navigation)
  const [highestStepReached, setHighestStepReached] = useState(1);

  // Slug uniqueness check (debounced)
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const slugCheckTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const slug = basicInfo.slug.trim();

    // Reset if empty or invalid format
    if (!slug || !isValidSlug(slug)) {
      setSlugStatus("idle");
      return;
    }

    // Debounce: wait 500ms after last change
    clearTimeout(slugCheckTimerRef.current);
    setSlugStatus("checking");

    slugCheckTimerRef.current = setTimeout(async () => {
      if (!accessToken) return;
      try {
        const apiClient = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL ?? "",
          getAccessToken: () => accessToken,
        });
        const venuesClient = new VenuesClient(apiClient);
        await venuesClient.getBySlug(slug);
        // If it returns successfully, the slug is taken
        setSlugStatus("taken");
        setBasicInfoErrors((prev) => ({ ...prev, slug: "A venue with this slug already exists" }));
      } catch {
        // 404 means slug is available
        setSlugStatus("available");
        setBasicInfoErrors((prev) => {
          const { slug: _removed, ...rest } = prev;
          return rest;
        });
      }
    }, 500);

    return () => clearTimeout(slugCheckTimerRef.current);
  }, [basicInfo.slug, accessToken]);

  const validateBasicInfo = useCallback((): boolean => {
    const errors: Partial<Record<keyof BasicInfoData, string>> = {};

    if (basicInfo.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }

    const slug = basicInfo.slug.trim();
    if (!slug) {
      errors.slug = "Slug is required";
    } else if (!isValidSlug(slug)) {
      errors.slug = "Slug must be URL-safe (lowercase letters, numbers, hyphens)";
    } else if (slugStatus === "taken") {
      errors.slug = "A venue with this slug already exists";
    }

    setBasicInfoErrors(errors);
    return Object.keys(errors).length === 0;
  }, [basicInfo, slugStatus]);

  const validateLocationTime = useCallback((): boolean => {
    const errors: Partial<Record<keyof LocationTimeData, string>> = {};

    if (!locationTime.ianaTimezone) {
      errors.ianaTimezone = "Timezone is required";
    }

    if (!locationTime.currencyCode) {
      errors.currencyCode = "Currency is required";
    }

    setLocationTimeErrors(errors);
    return Object.keys(errors).length === 0;
  }, [locationTime]);

  const validateSettings = useCallback((): boolean => {
    const errors: Partial<Record<keyof SettingsData, string>> = {};

    if (settings.defaultReservationDuration !== "") {
      const val = Number(settings.defaultReservationDuration);
      if (isNaN(val) || val <= 0) {
        errors.defaultReservationDuration = "Duration must be a positive number";
      }
    }

    if (settings.maxPartySize !== "") {
      const val = Number(settings.maxPartySize);
      if (isNaN(val) || val <= 0) {
        errors.maxPartySize = "Party size must be a positive number";
      }
    }

    if (settings.advanceBookingDays !== "") {
      const val = Number(settings.advanceBookingDays);
      if (isNaN(val) || val <= 0) {
        errors.advanceBookingDays = "Advance days must be a positive number";
      }
    }

    setSettingsErrors(errors);
    return Object.keys(errors).length === 0;
  }, [settings]);

  const validateOperatingHoursStep = useCallback((): boolean => {
    const errors = validateOperatingHours(operatingHours);
    setOperatingHoursErrors(errors);
    return errors === null;
  }, [operatingHours]);

  const validateCurrentStep = useCallback((): boolean => {
    switch (currentStep) {
      case 1:
        return validateBasicInfo();
      case 2:
        return validateLocationTime();
      case 3:
        return validateOperatingHoursStep();
      case 4:
        return validateSettings();
      case 5:
        return true; // Review only
      default:
        return true;
    }
  }, [
    currentStep,
    validateBasicInfo,
    validateLocationTime,
    validateOperatingHoursStep,
    validateSettings,
  ]);

  const handleNext = () => {
    if (validateCurrentStep()) {
      const nextStep = Math.min(currentStep + 1, TOTAL_STEPS);
      setCurrentStep(nextStep);
      setHighestStepReached((prev) => Math.max(prev, nextStep));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleStepClick = (step: number) => {
    // Allow jumping to any completed step (up to highestStepReached)
    if (step <= highestStepReached) {
      setCurrentStep(step);
    }
  };

  const buildPayload = (): CreateVenueRequest => {
    const payload: CreateVenueRequest = {
      name: basicInfo.name.trim(),
      slug: basicInfo.slug.trim(),
      ianaTimezone: locationTime.ianaTimezone,
      currencyCode: locationTime.currencyCode,
    };

    if (basicInfo.venueGroupId) {
      payload.venueGroupId = basicInfo.venueGroupId;
    }

    if (Object.keys(operatingHours).length > 0) {
      payload.operatingHours = operatingHours;
    }

    const venueSettings: VenueSettings = {};
    if (settings.defaultReservationDuration !== "") {
      venueSettings.defaultReservationDuration = Number(settings.defaultReservationDuration);
    }
    if (settings.maxPartySize !== "") {
      venueSettings.maxPartySize = Number(settings.maxPartySize);
    }
    if (settings.advanceBookingDays !== "") {
      venueSettings.maxAdvanceBooking = Number(settings.advanceBookingDays);
    }

    if (Object.keys(venueSettings).length > 0) {
      payload.settings = venueSettings;
    }

    return payload;
  };

  const handleSubmit = async () => {
    if (!accessToken) {
      setSubmitError("You must be signed in to create a venue");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const apiClient = new ApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      });
      const venuesClient = new VenuesClient(apiClient);
      await venuesClient.create(buildPayload());
      await refetchVenues();
      toast({
        title: "Venue created",
        description: `"${basicInfo.name.trim()}" is ready for setup`,
        variant: "success",
        duration: 5000,
      });
      navigate("/setup", { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create venue. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="New Venue" description="Set up your venue in a few steps" />

      <div className={styles.wizardContainer}>
        <StepIndicator
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          highestStepReached={highestStepReached}
          onStepClick={handleStepClick}
        />

        <Card>
          <Stack gap="lg">
            {currentStep === 1 && (
              <>
                <Text variant="label">Basic Information</Text>
                <BasicInfoStep
                  data={basicInfo}
                  errors={basicInfoErrors}
                  onChange={setBasicInfo}
                  onValidate={validateBasicInfo}
                  slugStatus={slugStatus}
                />
              </>
            )}

            {currentStep === 2 && (
              <>
                <Text variant="label">Location & Time</Text>
                <LocationTimeStep
                  data={locationTime}
                  errors={locationTimeErrors}
                  onChange={setLocationTime}
                  onValidate={validateLocationTime}
                />
              </>
            )}

            {currentStep === 3 && (
              <>
                <Text variant="label">Operating Hours</Text>
                <OperatingHoursStep
                  data={operatingHours}
                  errors={operatingHoursErrors ?? undefined}
                  onChange={(newHours) => {
                    setOperatingHours(newHours);
                    // Clear errors when user makes changes
                    setOperatingHoursErrors(null);
                  }}
                />
              </>
            )}

            {currentStep === 4 && (
              <>
                <Text variant="label">Venue Settings</Text>
                <SettingsStep
                  data={settings}
                  errors={settingsErrors}
                  onChange={setSettings}
                  onValidate={validateSettings}
                />
              </>
            )}

            {currentStep === 5 && (
              <>
                <Text variant="label">Review & Confirm</Text>
                <ConfirmationStep
                  basicInfo={basicInfo}
                  locationTime={locationTime}
                  operatingHours={operatingHours}
                  settings={settings}
                />
              </>
            )}

            {submitError && (
              <div className={styles.errorBanner} role="alert">
                <Text variant="body" color="error">
                  {submitError}
                </Text>
              </div>
            )}

            <Stack direction="row" gap="md" justify="between">
              <Button variant="secondary" onClick={handleBack} disabled={currentStep === 1}>
                Back
              </Button>

              {currentStep < TOTAL_STEPS ? (
                <Button variant="primary" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Venue"}
                </Button>
              )}
            </Stack>
          </Stack>
        </Card>
      </div>
    </div>
  );
}
