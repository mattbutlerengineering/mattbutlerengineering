import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import type { OperatingHours } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import {
  OperatingHoursStep,
  validateOperatingHours,
} from "../components/venue-onboarding/OperatingHoursStep.js";
import type { OperatingHoursValidationErrors } from "../components/venue-onboarding/OperatingHoursStep.js";
import { PageHeader } from "../components/PageHeader.js";
import { useUpdateVenue } from "../hooks/useVenues.js";
import styles from "./SetupHoursPage.module.css";

export function SetupHoursPage() {
  const navigate = useNavigate();
  const { selectedVenue, selectedVenueId } = useVenue();
  const updateVenueMutation = useUpdateVenue();

  const [hours, setHours] = useState<OperatingHours>(selectedVenue?.operatingHours ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoursErrors, setHoursErrors] = useState<OperatingHoursValidationErrors | null>(null);

  const handleSave = async () => {
    if (!selectedVenueId) return;

    const validationErrors = validateOperatingHours(hours);
    if (validationErrors) {
      setHoursErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateVenueMutation.mutateAsync({
        venueId: selectedVenueId,
        data: { operatingHours: hours },
      });
      navigate("/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save operating hours.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.root}>
      <PageHeader
        title="Operating Hours"
        description="Set the days and times your venue is open for reservations."
      />

      {error && (
        <div className={styles.errorBanner} role="alert">
          <Text variant="body" color="error">
            {error}
          </Text>
        </div>
      )}

      <div className={styles.form}>
        <OperatingHoursStep
          data={hours}
          errors={hoursErrors ?? undefined}
          onChange={(newHours) => {
            setHours(newHours);
            setHoursErrors(null);
          }}
        />
      </div>

      <Stack direction="row" gap="sm" justify="end">
        <Button variant="secondary" onClick={() => navigate("/setup")} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Hours"}
        </Button>
      </Stack>
    </div>
  );
}
