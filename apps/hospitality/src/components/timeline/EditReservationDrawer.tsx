import { useState } from "react";
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
import type { Reservation, Table, UpdateReservationRequest } from "@mbe/types";
import { GuestCard } from "../crm/GuestCard.js";
import styles from "./EditReservationDrawer.module.css";

interface EditReservationDrawerProps {
  reservation: Reservation;
  tables: Table[];
  onSave: (id: string, data: UpdateReservationRequest) => Promise<void>;
  onClose: () => void;
}

interface EditReservationFormData {
  startTime: string;
  endTime: string;
  partySize: string;
  notes: string;
}

function toTimeInputValue(isoString: string): string {
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function EditReservationDrawer({
  reservation,
  tables,
  onSave,
  onClose,
}: EditReservationDrawerProps) {
  const [tableId, setTableId] = useState(reservation.tableId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<EditReservationFormData>({
    defaultValues: {
      startTime: toTimeInputValue(reservation.startTime),
      endTime: toTimeInputValue(reservation.endTime),
      partySize: String(reservation.partySize),
      notes: reservation.notes ?? "",
    },
  });

  const activeTables = tables.filter((t) => t.isActive);
  const tableOptions = activeTables.map((t) => ({
    value: t.id,
    label: `${t.name} (cap. ${t.capacity})`,
  }));

  const watchedStartTime = watch("startTime");

  const onFormSubmit = async (data: EditReservationFormData) => {
    const parsedPartySize = parseInt(data.partySize, 10);

    const date = reservation.date.split("T")[0];
    const payload: UpdateReservationRequest = {
      startTime: `${date}T${data.startTime}:00`,
      endTime: `${date}T${data.endTime}:00`,
      partySize: parsedPartySize,
      tableId,
      notes: data.notes.trim() || undefined,
    };

    setIsLoading(true);
    setError(null);
    try {
      await onSave(reservation.id, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
      setIsLoading(false);
    }
  };

  const validationError =
    errors.partySize?.message ?? errors.startTime?.message ?? errors.endTime?.message ?? error;

  return (
    <Drawer open={true} onClose={onClose} title="Edit Reservation" size="default">
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
                    label="Start Time"
                    type="time"
                    disabled={isLoading}
                    {...register("startTime", {
                      required: "Start and end times are required.",
                    })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="End Time"
                    type="time"
                    disabled={isLoading}
                    {...register("endTime", {
                      required: "Start and end times are required.",
                      validate: (value) => {
                        if (!value) return "Start and end times are required.";
                        if (watchedStartTime >= value) return "End time must be after start time.";
                        return true;
                      },
                    })}
                  />
                </div>
              </div>

              <Input
                label="Party Size"
                type="number"
                min={1}
                disabled={isLoading}
                {...register("partySize", {
                  validate: (value) => {
                    const parsed = parseInt(value, 10);
                    if (isNaN(parsed) || parsed < 1) return "Party size must be a positive number.";
                    return true;
                  },
                })}
              />

              <Select
                label="Assign Table"
                value={tableId}
                onChange={setTableId}
                disabled={isLoading}
                options={tableOptions}
              />

              <TextArea label="Notes" rows={4} disabled={isLoading} {...register("notes")} />
            </Stack>

            <div className={styles.drawerActions}>
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className={styles.fullWidth}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isLoading}
                loadingText="Saving…"
                className={styles.fullWidth}
              >
                Save Changes
              </Button>
            </div>
          </Stack>
        </form>
      </div>
    </Drawer>
  );
}
