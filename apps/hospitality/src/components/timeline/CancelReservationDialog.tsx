import { useState } from "react";
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
        <div className={styles.header}>
          <h2 id="cancel-dialog-title" className={styles.title}>
            Cancel Reservation
          </h2>
          <p className={styles.subtitle}>
            Cancelling reservation for <strong>{displayName}</strong>
          </p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="cancel-reason" className={styles.label}>
              Reason <span className={styles.required}>*</span>
            </label>
            <select
              id="cancel-reason"
              className={styles.select}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
            >
              {CANCELLATION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="cancel-note" className={styles.label}>
              Note <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              id="cancel-note"
              className={styles.textarea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add any additional context..."
              disabled={isLoading}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={isLoading}
          >
            Keep Reservation
          </button>
          <button
            type="button"
            className={styles.destructiveButton}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Cancelling…" : "Cancel Reservation"}
          </button>
        </div>
      </div>
    </div>
  );
}
