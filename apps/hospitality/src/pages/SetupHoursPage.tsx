import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { OperatingHours } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { OperatingHoursStep } from "../components/venue-onboarding/OperatingHoursStep.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./SetupHoursPage.module.css";

export function SetupHoursPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { selectedVenue, selectedVenueId } = useVenue();

  const [hours, setHours] = useState<OperatingHours>(
    selectedVenue?.operatingHours ?? {}
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const handleSave = async () => {
    if (!selectedVenueId) return;

    setIsSaving(true);
    setError(null);

    try {
      await api.venues.update(selectedVenueId, { operatingHours: hours });
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
          {error}
        </div>
      )}

      <div className={styles.form}>
        <OperatingHoursStep data={hours} onChange={setHours} />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={() => navigate("/setup")}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save Hours"}
        </button>
      </div>
    </div>
  );
}
