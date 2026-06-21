import { useState } from "react";
import { Button, Select, TextArea, Stack, Text } from "@mattbutlerengineering/rialto";
import type { CancellationPolicy } from "../../utils/cancellation-fee.js";
import { evaluateCancellationFee } from "../../utils/cancellation-fee.js";
import { formatCurrencyFromCents } from "../../utils/format.js";
import styles from "./CancelReservationDialog.module.css";

interface CancelReservationDialogProps {
  reservationId: string;
  guestName: string | null;
  onConfirm: (reason: string, note: string) => Promise<void>;
  onClose: () => void;
  /** Venue cancellation policy. When provided, shows the computed fee before confirm. */
  policy?: CancellationPolicy | null;
  /** The reservation start time. Required when `policy` is provided. */
  reservationTime?: Date;
  /** ISO currency code (e.g. "usd"). Defaults to "usd". */
  currency?: string;
}

const CANCELLATION_REASONS = [
  { value: "guest_cancelled", label: "Guest Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "restaurant_cancelled", label: "Restaurant Cancelled" },
  { value: "other", label: "Other" },
];

function buildFeeLabel(
  feeType: "none" | "late" | "noshow",
  feeAmountCents: number,
  refundAmountCents: number,
  currency: string
): string {
  switch (feeType) {
    case "none":
      return `No cancellation fee — full refund of ${formatCurrencyFromCents(refundAmountCents, currency)}`;
    case "late":
      return `Late cancellation fee: ${formatCurrencyFromCents(feeAmountCents, currency)} — refund ${formatCurrencyFromCents(refundAmountCents, currency)}`;
    case "noshow":
      return `No-show fee: ${formatCurrencyFromCents(feeAmountCents, currency)} forfeited — refund ${formatCurrencyFromCents(refundAmountCents, currency)}`;
  }
}

export function CancelReservationDialog({
  reservationId: _reservationId,
  guestName,
  onConfirm,
  onClose,
  policy,
  reservationTime,
  currency = "usd",
}: CancelReservationDialogProps) {
  const [reason, setReason] = useState<string>("guest_cancelled");
  const [note, setNote] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = guestName ?? "Guest";

  // Compute fee at render time — no setState in effects
  const feeResult =
    policy && reservationTime ? evaluateCancellationFee(policy, reservationTime, new Date()) : null;

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
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-dialog-title"
    >
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

          {feeResult && (
            <div
              className={`${styles.feeBanner} ${feeResult.feeType !== "none" ? styles.feeBannerWarning : ""}`}
              data-testid="cancellation-fee-banner"
            >
              <Text variant="caption">
                {buildFeeLabel(
                  feeResult.feeType,
                  feeResult.feeAmountCents,
                  feeResult.refundAmountCents,
                  currency
                )}
              </Text>
            </div>
          )}

          <Stack gap="md">
            <Select
              label="Reason"
              value={reason}
              onChange={setReason}
              options={CANCELLATION_REASONS}
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
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
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
