import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import {
  Drawer,
  Button,
  Input,
  Select,
  TextArea,
  Stack,
  Divider,
} from "@mattbutlerengineering/rialto";
import type {
  Occasion,
  Reservation,
  SeatingPreference,
  Table,
  UpdateReservationRequest,
} from "@mbe/types";
import { OccasionSeatingFields } from "../reservations/OccasionSeatingFields.js";
import { GuestCard } from "../crm/GuestCard.js";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { useFocusAfter } from "../../hooks/useFocusAfter.js";
import { describeApiError, type ApiErrorDescription } from "../../lib/describe-api-error.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { venueWallTimeToInstant, wallTimeInputValue } from "../../utils/venue-wall-time.js";
import styles from "./EditReservationDrawer.module.css";

interface EditReservationDrawerProps {
  reservation: Reservation;
  tables: Table[];
  /** Rejects on failure — the drawer owns showing it (architecture § Dialog contracts). */
  onSave: (id: string, data: UpdateReservationRequest) => Promise<void>;
  onClose: () => void;
}

interface EditReservationFormData {
  startTime: string;
  endTime: string;
  partySize: string;
  notes: string;
}

/**
 * The drawer owns its failure and nothing else: a rejected `onSave` becomes an `ErrorRetryBanner`
 * above the actions, Save Changes returns to rest, the edited values stay, and focus lands back on
 * Save Changes — pressing again is the retry. Form validation keeps its own line.
 */
export function EditReservationDrawer({
  reservation,
  tables,
  onSave,
  onClose,
}: EditReservationDrawerProps) {
  const { timeZone } = useVenueFormat();
  const { t } = useTranslation();
  const [tableId, setTableId] = useState(reservation.tableId);
  const [occasion, setOccasion] = useState<Occasion>(reservation.occasion ?? "none");
  const [seatingPreference, setSeatingPreference] = useState<SeatingPreference>(
    reservation.seatingPreference ?? "no_preference"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const { focusAfter } = useFocusAfter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<EditReservationFormData>({
    defaultValues: {
      startTime: wallTimeInputValue(reservation.startTime, timeZone),
      endTime: wallTimeInputValue(reservation.endTime, timeZone),
      partySize: String(reservation.partySize),
      notes: reservation.notes ?? "",
    },
  });

  const activeTables = tables.filter((table) => table.isActive);
  const tableOptions = activeTables.map((table) => ({
    value: table.id,
    label: t("timeline.edit.tableOption", { name: table.name, capacity: table.capacity }),
  }));

  const watchedStartTime = watch("startTime");

  const onFormSubmit = async (data: EditReservationFormData) => {
    const parsedPartySize = parseInt(data.partySize, 10);

    const date = reservation.date.split("T")[0];
    const payload: UpdateReservationRequest = {
      startTime: venueWallTimeToInstant(date!, data.startTime, timeZone).toISOString(),
      endTime: venueWallTimeToInstant(date!, data.endTime, timeZone).toISOString(),
      partySize: parsedPartySize,
      tableId,
      notes: data.notes.trim() || undefined,
      occasion,
      seatingPreference,
    };

    setIsLoading(true);
    setFailure(null);
    try {
      await onSave(reservation.id, payload);
    } catch (err) {
      setFailure(describeApiError(err));
      if (saveRef.current) focusAfter({ kind: "element", element: saveRef.current });
    } finally {
      setIsLoading(false);
    }
  };

  const validationError =
    errors.partySize?.message ?? errors.startTime?.message ?? errors.endTime?.message;

  return (
    <Drawer open={true} onClose={onClose} title={t("timeline.edit.title")} size="default">
      <div data-testid="edit-reservation-drawer">
        <form noValidate onSubmit={handleSubmit(onFormSubmit)}>
          <Stack gap="lg" style={{ padding: "var(--rialto-space-md)" }}>
            {reservation.guestId && (
              <>
                <GuestCard guestId={reservation.guestId} />
                <Divider />
              </>
            )}

            {validationError && <div className={styles.errorBanner}>{validationError}</div>}

            <Stack gap="md">
              <div className={styles.fieldRow}>
                <div style={{ flex: 1 }}>
                  <Input
                    label={t("timeline.edit.startTime")}
                    type="time"
                    disabled={isLoading}
                    {...register("startTime", {
                      required: t("timeline.edit.timesRequired"),
                    })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label={t("timeline.edit.endTime")}
                    type="time"
                    disabled={isLoading}
                    {...register("endTime", {
                      required: t("timeline.edit.timesRequired"),
                      validate: (value) => {
                        if (!value) return t("timeline.edit.timesRequired");
                        if (watchedStartTime >= value) return t("timeline.edit.endAfterStart");
                        return true;
                      },
                    })}
                  />
                </div>
              </div>

              <Input
                label={t("timeline.edit.partySize")}
                type="number"
                min={1}
                disabled={isLoading}
                {...register("partySize", {
                  validate: (value) => {
                    const parsed = parseInt(value, 10);
                    if (isNaN(parsed) || parsed < 1) return t("timeline.edit.partySizePositive");
                    return true;
                  },
                })}
              />

              <Select
                label={t("timeline.edit.assignTable")}
                value={tableId}
                onChange={setTableId}
                disabled={isLoading}
                options={tableOptions}
              />

              <OccasionSeatingFields
                occasion={occasion}
                seatingPreference={seatingPreference}
                onOccasionChange={setOccasion}
                onSeatingPreferenceChange={setSeatingPreference}
                disabled={isLoading}
              />

              <TextArea
                label={t("timeline.edit.notes")}
                rows={4}
                disabled={isLoading}
                {...register("notes")}
              />
            </Stack>

            {failure && (
              <ErrorRetryBanner
                title={t("timeline.edit.failed")}
                error={failure.detail}
                details={failure.raw}
              />
            )}

            <div className={styles.drawerActions}>
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className={styles.fullWidth}
              >
                {t("timeline.edit.cancel")}
              </Button>
              <Button
                ref={saveRef}
                variant="primary"
                type="submit"
                isLoading={isLoading}
                loadingText={t("timeline.edit.saving")}
                className={styles.fullWidth}
              >
                {t("timeline.edit.save")}
              </Button>
            </div>
          </Stack>
        </form>
      </div>
    </Drawer>
  );
}
