import { useState } from "react";
import { Button, Select, TextArea, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./CancelReservationDialog.module.css";

interface CancelReservationDialogProps {
  reservationId: string;
  guestName: string | null;
  onConfirm: (reason: string, note: string) => Promise<void>;
  onClose: () => void;
}

const CANCELLATION_REASONS = [
  { value: "guest_cancelled", label: "Guest Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "restaurant_cancelled", label: "Restaurant Cancelled" },
  { value: "other", label: "Other" },
];

export function CancelReservationDialog({
  reservationId: _reservationId,
  guestName,
  onConfirm,
  onClose,
}: CancelReservationDialogProps) {
  const [reason, setReason] = useState<string>("guest_cancelled");
  const [note, setNote] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = guestName ?? "Guest";

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onConfirm(reason, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel reservation.");
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
      <div className={styles.dialog}>
        <Stack gap="lg">
          <div className={styles.header}>
            <Text variant="display" id="cancel-dialog-title">
              Cancel Reservation
            </Text>
            <Text variant="body" color="secondary">
              Cancelling reservation for <strong>{displayName}</strong>
            </Text>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <Stack gap="md">
            <Select
              label="Reason"
              value={reason}
              options={CANCELLATION_REASONS}
              onChange={(val) => setReason(val)}
              disabled={isLoading}
            />

            <TextArea
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add any additional context..."
              disabled={isLoading}
            />
          </Stack>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Keep Reservation
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              isLoading={isLoading}
              loadingText="Cancelling…"
            >
              Cancel Reservation
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  );
}
